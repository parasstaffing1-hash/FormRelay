const assert = require('node:assert/strict');
const test = require('node:test');
const { validateEmail, isBusinessEmail, validatePhone } = require('../.test-build/validate-contact.js');
const { assessSpam, parseSpamRules, DEFAULT_SPAM_RULES } = require('../.test-build/spam-score.js');
const { readIdempotencyKey, idempotencyScope, contentFingerprint } = require('../.test-build/events.js');

/* ------------------------------------------------------------------ email */

test('accepts real addresses and rejects undeliverable syntax', () => {
  assert.equal(validateEmail('ada@example.com').valid, true);
  assert.equal(validateEmail('ada.lovelace+tag@sub.example.co.uk').valid, true);
  for (const bad of ['', 'ada', 'ada@', '@example.com', 'ada@example', 'a b@example.com', 'ada@@example.com']) {
    assert.equal(validateEmail(bad).valid, false, bad);
  }
});

test('normalises case and whitespace without altering the local part', () => {
  const v = validateEmail('  Ada.Lovelace+News@Example.COM ');
  assert.equal(v.normalized, 'ada.lovelace+news@example.com');
  assert.equal(v.domain, 'example.com');
});

test('flags disposable, free, role, and fake addresses distinctly', () => {
  assert.ok(validateEmail('x@mailinator.com').findings.includes('disposable'));
  assert.ok(validateEmail('x@gmail.com').findings.includes('free_provider'));
  assert.ok(validateEmail('sales@acme.com').findings.includes('role_account'));
  assert.ok(validateEmail('test@acme.com').findings.includes('obvious_fake'));
  // Dots and tags must not hide a role account.
  assert.ok(validateEmail('s.a.l.e.s+x@acme.com').findings.includes('role_account'));
});

test('business email means neither free nor disposable', () => {
  assert.equal(isBusinessEmail(validateEmail('ada@acme.com')), true);
  assert.equal(isBusinessEmail(validateEmail('ada@gmail.com')), false);
  assert.equal(isBusinessEmail(validateEmail('ada@mailinator.com')), false);
});

/* ------------------------------------------------------------------ phone */

test('normalises international numbers to E.164', () => {
  assert.equal(validatePhone('+1 (415) 555-2671').e164, '+14155552671');
  assert.equal(validatePhone('+44 20 7946 0958').e164, '+442079460958');
  assert.equal(validatePhone('0044 20 7946 0958').e164, '+442079460958');
  assert.equal(validatePhone('+91 98765 43210').e164, '+919876543210');
});

test('longest calling code wins so +1 does not shadow +1242', () => {
  assert.equal(validatePhone('+353 1 234 5678').countryCode, '353');
});

test('applies a default country and strips a trunk prefix', () => {
  const v = validatePhone('020 7946 0958', '44');
  assert.equal(v.valid, true);
  assert.equal(v.e164, '+442079460958');
});

test('rejects unusable numbers with a reason', () => {
  assert.equal(validatePhone('').reason, 'empty');
  assert.equal(validatePhone('abc').reason, 'no digits');
  assert.equal(validatePhone('555 1234').reason, 'no country code and no default');
  assert.equal(validatePhone('+999 123456').reason, 'unrecognised country code');
  assert.equal(validatePhone('+1 12').reason, 'too short');
  assert.equal(validatePhone('+1 1234567890123456789').reason, 'too long for E.164');
});

/* ------------------------------------------------------------------- spam */

const CLEAN = { name: 'Ada Lovelace', message: 'I would like to discuss a project with your team.' };

test('a normal submission scores clean', () => {
  const a = assessSpam({ values: CLEAN, email: 'ada@acme.com', elapsedMs: 45000 });
  assert.deepEqual(a.signals, []);
  assert.equal(a.score, 0);
  assert.equal(a.spam, false);
});

test('every signal carries a human reason', () => {
  const a = assessSpam({
    values: { message: 'http://a.com http://b.com http://c.com http://d.com http://e.com' },
    email: 'x@mailinator.com',
    elapsedMs: 300,
    duplicate: true,
  });
  assert.ok(a.spam, 'should cross the threshold');
  for (const signal of a.signals) {
    assert.ok(signal.detail && signal.detail.length > 3, 'signal must explain itself: ' + signal.rule);
    assert.ok(signal.weight > 0);
  }
  const rules = a.signals.map((s) => s.rule);
  assert.ok(rules.includes('link_count'));
  assert.ok(rules.includes('disposable_email'));
  assert.ok(rules.includes('submit_speed'));
  assert.ok(rules.includes('duplicate'));
});

test('blocklists are decisive on their own', () => {
  const rules = parseSpamRules(JSON.stringify({ blockedEmails: ['bad@actor.com'], blockedDomains: ['spam.io'] }));
  assert.ok(assessSpam({ values: CLEAN, email: 'bad@actor.com', rules }).spam);
  assert.ok(assessSpam({ values: CLEAN, email: 'anyone@spam.io', rules }).spam);
  assert.equal(assessSpam({ values: CLEAN, email: 'ada@acme.com', rules }).spam, false);
});

test('blocked words match case-insensitively inside the body', () => {
  const rules = parseSpamRules(JSON.stringify({ blockedWords: ['crypto'] }));
  const a = assessSpam({ values: { message: 'Buy CRYPTO now' }, rules });
  assert.ok(a.signals.some((s) => s.rule === 'blocked_word'));
});

test('score is capped and the threshold is configurable', () => {
  const strict = parseSpamRules(JSON.stringify({ threshold: 10 }));
  assert.ok(assessSpam({ values: { message: 'HELLO THIS IS ALL SHOUTING TEXT HERE' }, rules: strict }).spam);
  const a = assessSpam({ values: { m: 'http://a http://b http://c http://d http://e' }, email: 'x@mailinator.com', elapsedMs: 1, duplicate: true, recentFromIp: 20 });
  assert.ok(a.score <= 100, 'score must not exceed 100');
});

test('malformed rules fall back to defaults rather than throwing', () => {
  assert.deepEqual(parseSpamRules('not json'), DEFAULT_SPAM_RULES);
  assert.deepEqual(parseSpamRules(null), DEFAULT_SPAM_RULES);
});

test('missing timing does not invent a speed signal', () => {
  const a = assessSpam({ values: CLEAN, email: 'ada@acme.com', elapsedMs: null });
  assert.equal(a.signals.some((s) => s.rule === 'submit_speed'), false);
});

/* ----------------------------------------------------------- idempotency */

test('reads an idempotency key from header or body', () => {
  assert.equal(readIdempotencyKey('abc-123', {}), 'abc-123');
  assert.equal(readIdempotencyKey(undefined, { _idempotency_key: 'from-body' }), 'from-body');
  assert.equal(readIdempotencyKey('  spaced  ', {}), 'spaced');
});

test('rejects keys that are empty, oversized, or contain control characters', () => {
  assert.equal(readIdempotencyKey('', {}), '');
  assert.equal(readIdempotencyKey('x'.repeat(201), {}), '');
  assert.equal(readIdempotencyKey('bad\nkey', {}), '');
});

test('keys are scoped per form', () => {
  assert.notEqual(idempotencyScope('form_a', 'k1'), idempotencyScope('form_b', 'k1'));
});

test('fingerprint ignores control fields and field order', async () => {
  const a = await contentFingerprint('f1', { name: 'Ada', email: 'a@b.com', _gotcha: '', _started: '123' });
  const b = await contentFingerprint('f1', { email: 'a@b.com', name: 'Ada', _started: '999' });
  assert.equal(a, b, 'control fields and ordering must not change the fingerprint');

  const c = await contentFingerprint('f1', { name: 'Grace', email: 'a@b.com' });
  assert.notEqual(a, c, 'different answers must fingerprint differently');

  const d = await contentFingerprint('f2', { name: 'Ada', email: 'a@b.com' });
  assert.notEqual(a, d, 'the same answers on another form are not a duplicate');
});
