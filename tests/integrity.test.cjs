const assert = require('node:assert/strict');
const test = require('node:test');
const { computeRowHash, verifyChain, genesisHash, signPrefill, verifyPrefill, prefillPayload } = require('../.test-build/integrity.js');
const { diffSchemas, summarizeDiff } = require('../.test-build/diff.js');

async function buildChain(rows) {
  const links = [];
  let prev = genesisHash();
  for (const row of rows) {
    const link = { ...row, prev_hash: prev };
    link.row_hash = await computeRowHash(link);
    prev = link.row_hash;
    links.push(link);
  }
  return links;
}

const BASE = [
  { id: 1, form_id: 'f1', data: '{"a":"1"}', created_at: 1000 },
  { id: 2, form_id: 'f1', data: '{"a":"2"}', created_at: 2000 },
  { id: 3, form_id: 'f1', data: '{"a":"3"}', created_at: 3000 },
];

test('verifies an untampered chain', async () => {
  const chain = await buildChain(BASE);
  const verdict = await verifyChain(chain);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.checked, 3);
  assert.equal(verdict.head, chain[2].row_hash);
});

test('detects an edited response', async () => {
  const chain = await buildChain(BASE);
  chain[1].data = '{"a":"tampered"}';
  const verdict = await verifyChain(chain);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.brokenAt, 2);
  assert.match(verdict.reason, /no longer matches/);
});

test('detects a deleted response', async () => {
  const chain = await buildChain(BASE);
  chain.splice(1, 1);
  const verdict = await verifyChain(chain);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.brokenAt, 3);
});

test('detects a back-dated response', async () => {
  const chain = await buildChain(BASE);
  chain[0].created_at = 5;
  const verdict = await verifyChain(chain);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.brokenAt, 1);
});

test('skips rows written before the chain existed', async () => {
  const chain = await buildChain(BASE);
  const legacy = [{ id: 0, form_id: 'f1', data: '{}', created_at: 1, prev_hash: '', row_hash: '' }, ...chain];
  const verdict = await verifyChain(legacy);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.checked, 3, 'legacy rows are not counted as verified');
});

test('signs and verifies prefill values, rejecting edits', async () => {
  const values = { name: 'Ada', plan: 'pro' };
  const sig = await signPrefill(values, 'secret');
  assert.equal(await verifyPrefill(values, sig, 'secret'), true);
  assert.equal(await verifyPrefill({ name: 'Ada', plan: 'enterprise' }, sig, 'secret'), false, 'edited value must fail');
  assert.equal(await verifyPrefill(values, sig, 'other-secret'), false, 'wrong secret must fail');
  assert.equal(await verifyPrefill(values, '', 'secret'), false, 'missing signature must fail');
});

test('prefill payload is order-independent and ignores the signature param', () => {
  assert.equal(prefillPayload({ b: '2', a: '1' }), prefillPayload({ a: '1', b: '2' }));
  assert.equal(prefillPayload({ a: '1', _sig: 'x' }), prefillPayload({ a: '1' }));
});

/* ---------------------------------------------------------------- schema diff */

const v1 = JSON.stringify({
  version: 2,
  blocks: [
    { id: 'name', type: 'short_text', label: 'Name', required: true },
    { id: 'email', type: 'email', label: 'Email' },
  ],
  settings: { submitText: 'Send', successMessage: '', redirectUrl: '' },
  pages: [{ id: 'page_1', title: 'Page 1' }], variables: [], logic: [], endings: [],
});

test('reports added, removed, changed, and moved blocks', () => {
  const v2 = JSON.stringify({
    version: 2,
    blocks: [
      { id: 'email', type: 'email', label: 'Email address' },
      { id: 'name', type: 'short_text', label: 'Name', required: true },
      { id: 'phone', type: 'phone', label: 'Phone' },
    ],
    settings: { submitText: 'Submit', successMessage: '', redirectUrl: '' },
    pages: [{ id: 'page_1', title: 'Page 1' }], variables: [], logic: [], endings: [],
  });
  const diff = diffSchemas(v1, v2);
  const kinds = Object.fromEntries(diff.blocks.map((b) => [b.id + ':' + b.kind, b]));

  assert.ok(kinds['phone:added'], 'new block reported as added');
  assert.ok(kinds['email:changed'], 'relabelled block reported as changed');
  assert.ok(kinds['email:moved'] || kinds['name:moved'], 'reorder reported as a move');
  assert.equal(diff.identical, false);
  assert.ok(diff.settings.some((c) => c.key === 'submitText'), 'settings change reported');
});

test('identical schemas produce no diff', () => {
  const diff = diffSchemas(v1, v1);
  assert.equal(diff.identical, true);
  assert.equal(summarizeDiff(diff), 'no changes');
});

test('a removed block is not reported as a move', () => {
  const v2 = JSON.stringify({
    version: 2,
    blocks: [{ id: 'name', type: 'short_text', label: 'Name', required: true }],
    settings: { submitText: 'Send', successMessage: '', redirectUrl: '' },
    pages: [{ id: 'page_1', title: 'Page 1' }], variables: [], logic: [], endings: [],
  });
  const diff = diffSchemas(v1, v2);
  assert.deepEqual(diff.blocks.map((b) => b.kind).sort(), ['removed']);
});
