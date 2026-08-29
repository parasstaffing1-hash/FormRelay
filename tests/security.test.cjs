const assert = require('node:assert/strict');
const test = require('node:test');
const { hashPassword, verifyPassword, timingSafeEqual, escapeScriptJson } = require('../.test-build/util.js');

const sha256Hex = async (input) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

test('hashes passwords with a per-password salt', async () => {
  const a = await hashPassword('correct horse battery');
  const b = await hashPassword('correct horse battery');
  assert.match(a, /^pbkdf2\$\d+\$/);
  assert.notEqual(a, b, 'identical passwords must not produce identical hashes');
});

test('verifies PBKDF2 hashes and rejects wrong passwords', async () => {
  const stored = await hashPassword('correct horse battery');
  assert.deepEqual(await verifyPassword('correct horse battery', stored, sha256Hex), { ok: true, needsUpgrade: false });
  assert.deepEqual(await verifyPassword('wrong password', stored, sha256Hex), { ok: false, needsUpgrade: false });
});

test('accepts legacy sha256 hashes and flags them for upgrade', async () => {
  const legacy = await sha256Hex('legacy secret');
  assert.deepEqual(await verifyPassword('legacy secret', legacy, sha256Hex), { ok: true, needsUpgrade: true });
  assert.deepEqual(await verifyPassword('nope', legacy, sha256Hex), { ok: false, needsUpgrade: false });
});

test('rejects malformed PBKDF2 hashes rather than throwing', async () => {
  for (const bad of ['pbkdf2$', 'pbkdf2$abc$salt$hash', 'pbkdf2$1000$$', 'pbkdf2$-1$c2FsdA==$aGFzaA==']) {
    assert.deepEqual(await verifyPassword('x', bad, sha256Hex), { ok: false, needsUpgrade: false });
  }
});

test('compares strings without leaking length-independent equality', () => {
  assert.equal(timingSafeEqual('abc', 'abc'), true);
  assert.equal(timingSafeEqual('abc', 'abd'), false);
  assert.equal(timingSafeEqual('abc', 'abcd'), false);
  assert.equal(timingSafeEqual('', ''), true);
});

test('escapes script-terminating sequences in inlined JSON', () => {
  const json = JSON.stringify([{ label: '</script><img src=x onerror=alert(1)>' }]);
  const escaped = escapeScriptJson(json);
  assert.ok(!escaped.includes('</script>'));
  assert.deepEqual(JSON.parse(escaped), JSON.parse(json), 'escaping must round-trip through JSON.parse');
});
