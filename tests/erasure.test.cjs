const assert = require('node:assert/strict');
const test = require('node:test');
const { computeRowHash, verifyChain, genesisHash, prefillPayload } = require('../.test-build/integrity.js');

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

test('an erased response is a tombstone, not tampering', async () => {
  const chain = await buildChain(BASE);
  // The respondent erased their answers: content is destroyed, digest is retained.
  chain[1].data = '{}';
  chain[1].erased_at = 1712345678;
  const verdict = await verifyChain(chain);
  assert.equal(verdict.ok, true, 'authorised erasure must not read as tampering');
  assert.equal(verdict.erased, 1);
  assert.equal(verdict.checked, 2, 'erased rows are counted separately from verified ones');
});

test('tampering after an erasure is still caught', async () => {
  const chain = await buildChain(BASE);
  chain[0].data = '{}';
  chain[0].erased_at = 1712345678;
  chain[2].data = '{"a":"tampered"}';
  const verdict = await verifyChain(chain);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.brokenAt, 3);
});

test('separators stop adjacent field values from colliding', async () => {
  const a = await computeRowHash({ id: 1, form_id: 'ab', data: 'c', created_at: 2, prev_hash: '' });
  const b = await computeRowHash({ id: 1, form_id: 'a', data: 'bc', created_at: 2, prev_hash: '' });
  assert.notEqual(a, b, 'adjacent fields must not be able to run together');
  assert.notEqual(prefillPayload({ a: '1', b: '2' }), prefillPayload({ a: '1b=2' }));
});
