const assert = require('node:assert/strict');
const test = require('node:test');
const {
  extractIdentity, extractCompany, scoreLead, parseScoreRules, rulesVersion,
  scoreBand, isLeadStatus, DEFAULT_SCORE_RULES,
} = require('../.test-build/contacts.js');

/* ---------------------------------------------------------------- identity */

test('identifies a contact by email, preferring it over phone', () => {
  const id = extractIdentity({ name: 'Ada', email: 'Ada@Acme.COM', phone: '+14155552671' });
  assert.equal(id.matchedOn, 'email');
  assert.equal(id.key, 'email:ada@acme.com');
  assert.equal(id.email, 'ada@acme.com', 'email is normalised for matching');
  assert.equal(id.phone, '+14155552671', 'phone is still captured');
  assert.equal(id.name, 'Ada');
});

test('falls back to phone when there is no usable email', () => {
  const id = extractIdentity({ name: 'Ada', phone: '+44 20 7946 0958' });
  assert.equal(id.matchedOn, 'phone');
  assert.equal(id.key, 'phone:+442079460958');
});

test('an unidentifiable submission produces no key rather than a bad match', () => {
  const id = extractIdentity({ name: 'Ada', message: 'hello' });
  assert.equal(id.key, '');
  assert.equal(id.matchedOn, 'none');
});

test('an invalid email does not become an identity', () => {
  const id = extractIdentity({ email: 'not-an-email', phone: '+14155552671' });
  assert.equal(id.matchedOn, 'phone', 'must not key on an undeliverable address');
});

test('resolves fields by label when block ids are opaque', () => {
  const values = { blk_1: 'Ada Lovelace', blk_2: 'ada@acme.com', blk_3: 'Acme Ltd' };
  const labels = { blk_1: 'Full name', blk_2: 'Email address', blk_3: 'Company' };
  const id = extractIdentity(values, labels);
  assert.equal(id.email, 'ada@acme.com');
  assert.equal(id.name, 'Ada Lovelace');
  assert.equal(extractCompany(values, labels), 'Acme Ltd');
});

test('two spellings of the same address are one identity', () => {
  const a = extractIdentity({ email: 'ada@acme.com' });
  const b = extractIdentity({ email: '  ADA@ACME.COM ' });
  assert.equal(a.key, b.key);
});

test('different people are never merged', () => {
  const a = extractIdentity({ name: 'Ada Lovelace', email: 'ada@acme.com' });
  const b = extractIdentity({ name: 'Ada Lovelace', email: 'ada@othercorp.com' });
  assert.notEqual(a.key, b.key, 'a shared name must not merge two contacts');
});

/* ------------------------------------------------------------------ score */

const ID = (over = {}) => ({ key: 'email:ada@acme.com', email: 'ada@acme.com', phone: '', name: 'Ada', matchedOn: 'email', ...over });

test('scores a business lead above a free-provider one', () => {
  const business = scoreLead({ values: {}, identity: ID() });
  const free = scoreLead({ values: {}, identity: ID({ email: 'ada@gmail.com' }) });
  assert.ok(business.score > free.score);
  assert.ok(business.breakdown.some((b) => b.rule === 'business_email'));
});

test('every point traces to a named rule with a reason', () => {
  const result = scoreLead({
    values: {},
    identity: ID({ phone: '+14155552671' }),
    company: 'Acme',
    isRepeat: true,
  });
  const summed = result.breakdown.reduce((n, b) => n + b.points, 0);
  assert.equal(result.score, summed, 'score must equal the sum of its breakdown');
  for (const entry of result.breakdown) {
    assert.ok(entry.rule && entry.detail, 'each entry explains itself');
  }
});

test('numeric thresholds tolerate formatted currency', () => {
  const rules = parseScoreRules(JSON.stringify([{ kind: 'field_gt', points: 25, field: 'budget', value: 100000 }]));
  assert.equal(scoreLead({ values: { budget: '£120,000' }, identity: ID(), rules }).score, 25);
  assert.equal(scoreLead({ values: { budget: '80,000' }, identity: ID(), rules }).score, 0);
  assert.equal(scoreLead({ values: { budget: 'lots' }, identity: ID(), rules }).score, 0);
});

test('country and field rules match case-insensitively', () => {
  const rules = parseScoreRules(JSON.stringify([
    { kind: 'country', points: 10, values: ['IN', 'US'] },
    { kind: 'field_equals', points: 15, field: 'dept', value: 'Sales' },
  ]));
  const r = scoreLead({ values: { dept: 'sales' }, identity: ID(), country: 'in', rules });
  assert.equal(r.score, 25);
});

test('score is clamped so a misconfigured rule set stays meaningful', () => {
  const rules = parseScoreRules(JSON.stringify([{ kind: 'business_email', points: 5000 }]));
  assert.equal(scoreLead({ values: {}, identity: ID(), rules }).score, 100);
});

test('rules version changes with the rules and is stored with the score', () => {
  const a = rulesVersion(DEFAULT_SCORE_RULES);
  const b = rulesVersion([{ kind: 'business_email', points: 99 }]);
  assert.notEqual(a, b);
  assert.equal(scoreLead({ values: {}, identity: ID() }).rulesVersion, a);
});

test('malformed rules fall back to defaults', () => {
  assert.deepEqual(parseScoreRules('not json'), DEFAULT_SCORE_RULES);
  assert.deepEqual(parseScoreRules(null), DEFAULT_SCORE_RULES);
  assert.deepEqual(parseScoreRules('[{"kind":"business_email"}]'), [], 'rules without points are dropped');
});

test('bands split the score range', () => {
  assert.equal(scoreBand(75), 'hot');
  assert.equal(scoreBand(40), 'warm');
  assert.equal(scoreBand(10), 'cold');
});

test('lead statuses are a closed set', () => {
  assert.equal(isLeadStatus('qualified'), true);
  assert.equal(isLeadStatus('anything'), false);
});
