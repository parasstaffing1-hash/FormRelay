const assert = require('node:assert/strict');
const test = require('node:test');
const {
  issuePowChallenge, verifyPow, solutionMeetsDifficulty,
  blindIdentity, buildConsentReceipt, consentVersion,
  scoreQuality, issueStartToken, elapsedFromStartToken,
  parseFieldAcl, canSeeField, redactForRole,
} = require('../.test-build/trust.js');

const SECRET = 'test-secret';

async function mine(challenge, bits) {
  for (let nonce = 0; nonce < 500000; nonce++) {
    if (await solutionMeetsDifficulty(challenge, String(nonce), bits)) return String(nonce);
  }
  throw new Error('no solution found');
}

/* ---------------------------------------------------------------- proof of work */

test('accepts a correct proof and rejects an unsolved one', async () => {
  const challenge = await issuePowChallenge('f1', SECRET);
  const nonce = await mine(challenge, 10);
  assert.deepEqual(await verifyPow('f1', challenge, nonce, 10, SECRET), { ok: true });

  const bad = await verifyPow('f1', challenge, '0', 10, SECRET);
  if (bad.ok) assert.fail('nonce 0 should not usually qualify');
  assert.equal(bad.reason, 'insufficient work');
});

test('rejects a forged or foreign challenge', async () => {
  const forged = '1700000000.bm90LWEtcmVhbC1zaWc=';
  const v1 = await verifyPow('f1', forged, '0', 10, SECRET);
  assert.equal(v1.ok, false);

  // A challenge minted for one form must not be replayable on another.
  const challenge = await issuePowChallenge('f1', SECRET);
  const nonce = await mine(challenge, 8);
  const v2 = await verifyPow('f2', challenge, nonce, 8, SECRET);
  assert.equal(v2.ok, false);
  assert.equal(v2.reason, 'challenge signature invalid');
});

test('rejects expired and future-dated challenges', async () => {
  const now = Date.now();
  const old = await issuePowChallenge('f1', SECRET, now - 60 * 60 * 1000);
  const expired = await verifyPow('f1', old, '0', 8, SECRET, now);
  assert.equal(expired.reason, 'challenge expired');

  const future = await issuePowChallenge('f1', SECRET, now + 10 * 60 * 1000);
  const early = await verifyPow('f1', future, '0', 8, SECRET, now);
  assert.equal(early.reason, 'challenge not yet valid');
});

test('difficulty of zero disables the gate', async () => {
  assert.deepEqual(await verifyPow('f1', '', '', 0, SECRET), { ok: true });
});

/* ------------------------------------------------------------ blind identity */

test('blinds identifiers so duplicates collide but the value is not recoverable', async () => {
  const a = await blindIdentity('f1', 'Staff-123', SECRET);
  const b = await blindIdentity('f1', ' staff-123 ', SECRET);
  assert.equal(a, b, 'case and whitespace must not create a second identity');

  const other = await blindIdentity('f1', 'staff-999', SECRET);
  assert.notEqual(a, other);

  const otherForm = await blindIdentity('f2', 'staff-123', SECRET);
  assert.notEqual(a, otherForm, 'identities must not be linkable across forms');

  assert.ok(!a.includes('staff'), 'the raw identifier must not survive in the digest');
});

/* ---------------------------------------------------------------- consent */

test('consent receipts pin the exact wording', async () => {
  const receipt = await buildConsentReceipt('  I agree to the terms.  ');
  assert.equal(receipt.text, 'I agree to the terms.');
  assert.equal(receipt.version, await consentVersion('I agree to the terms.'));
  assert.notEqual(receipt.version, await consentVersion('I agree to the revised terms.'));
});

/* ---------------------------------------------------------------- timing */

test('elapsed time comes from a signed start token', async () => {
  const now = Date.now();
  const token = await issueStartToken('f1', SECRET, now - 5000);
  const elapsed = await elapsedFromStartToken('f1', token, SECRET, now);
  assert.ok(elapsed >= 5000 && elapsed < 6000, 'elapsed ' + elapsed);

  assert.equal(await elapsedFromStartToken('f1', '123.forged', SECRET, now), null);
  assert.equal(await elapsedFromStartToken('f2', token, SECRET, now), null, 'token is bound to its form');
});

/* ---------------------------------------------------------------- quality */

const FIELDS = { choiceFields: ['q1', 'q2', 'q3', 'q4'], textFields: ['c1'] };

test('a considered response scores clean', () => {
  const report = scoreQuality({
    values: { q1: 'Agree', q2: 'Disagree', q3: 'Neutral', q4: 'Agree', c1: 'The onboarding was confusing in places.' },
    ...FIELDS,
    elapsedMs: 60000,
  });
  assert.deepEqual(report.signals, []);
  assert.equal(report.score, 100);
});

test('flags straightlining and speeding', () => {
  const report = scoreQuality({
    values: { q1: 'Agree', q2: 'Agree', q3: 'Agree', q4: 'Agree', c1: 'aaaa' },
    ...FIELDS,
    elapsedMs: 900,
  });
  assert.ok(report.signals.includes('straightlining'));
  assert.ok(report.signals.includes('speeding'));
  assert.ok(report.score < 100);
});

test('flags low-effort free text', () => {
  const report = scoreQuality({
    values: { q1: 'Agree', q2: 'Disagree', q3: 'Neutral', q4: 'Agree', c1: 'ok' },
    ...FIELDS,
    elapsedMs: 60000,
  });
  assert.deepEqual(report.signals, ['low_effort_text']);
});

test('missing timing does not manufacture a speeding signal', () => {
  const report = scoreQuality({
    values: { q1: 'Agree', q2: 'Disagree', q3: 'Neutral', q4: 'Agree', c1: 'Considered answer here.' },
    ...FIELDS,
    elapsedMs: null,
  });
  assert.deepEqual(report.signals, []);
  assert.equal(report.elapsed_ms, null);
});

/* ------------------------------------------------------- field access control */

test('redacts fields the role may not see, but never from an owner', () => {
  const acl = parseFieldAcl('{"salary":["owner"],"ssn":["owner"],"message":[]}');
  const values = { name: 'Ada', message: 'hello', salary: '100000', ssn: '123-45-6789' };

  assert.deepEqual(redactForRole(values, acl, 'owner'), values, 'owners see everything');

  const viewer = redactForRole(values, acl, 'viewer');
  assert.deepEqual(Object.keys(viewer).sort(), ['message', 'name'], 'restricted fields are dropped');
  assert.equal(canSeeField(acl, 'salary', 'viewer'), false);
  assert.equal(canSeeField(acl, 'name', 'viewer'), true, 'unlisted fields stay visible');
  assert.equal(canSeeField(acl, 'message', 'viewer'), true, 'an empty rule means no restriction');
});

test('a malformed ACL fails open to visible rather than throwing', () => {
  assert.deepEqual(parseFieldAcl('not json'), {});
  assert.deepEqual(parseFieldAcl(null), {});
  assert.equal(canSeeField(parseFieldAcl('{"a":"nope"}'), 'a', 'viewer'), true);
});
