const assert = require('node:assert/strict');
const test = require('node:test');
const t = require('../.test-build/totp.js');

// RFC 6238 Appendix B uses the ASCII secret "12345678901234567890" for SHA-1.
const RFC_SECRET = t.base32Encode(new TextEncoder().encode('12345678901234567890'));

test('base32 round-trips arbitrary bytes', () => {
  for (const bytes of [[0], [255], [0, 0, 0], [1, 2, 3, 4, 5], [72, 101, 108, 108, 111]]) {
    const encoded = t.base32Encode(Uint8Array.from(bytes));
    assert.deepEqual([...t.base32Decode(encoded)], bytes, encoded);
  }
});

test('base32 decoding tolerates padding, whitespace and lowercase', () => {
  const secret = t.base32Encode(Uint8Array.from([1, 2, 3, 4, 5]));
  const messy = secret.toLowerCase().match(/.{1,4}/g).join(' ') + '==';
  assert.deepEqual([...t.base32Decode(messy)], [...t.base32Decode(secret)]);
});

test('matches the RFC 6238 test vectors', async () => {
  // If this passes, any authenticator app will agree with us. If it fails, nothing else
  // about the feature matters.
  const vectors = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];
  for (const [seconds, expected] of vectors) {
    const counter = t.counterFor(seconds * 1000);
    assert.equal(await t.codeForCounter(RFC_SECRET, counter, 8), expected, `T=${seconds}`);
  }
});

test('the 6-digit code is the low 6 digits of the 8-digit one', async () => {
  const counter = t.counterFor(59 * 1000);
  assert.equal(await t.codeForCounter(RFC_SECRET, counter, 6), '287082');
});

test('a code is accepted within the skew window and rejected outside it', async () => {
  const now = 1_700_000_000_000;
  const secret = t.generateSecret();
  const current = await t.currentCode(secret, now);

  assert.equal(await t.verify(secret, current, now), true, 'current step');
  // One step of clock skew either way is tolerated.
  assert.equal(await t.verify(secret, current, now + 30_000), true, 'one step late');
  assert.equal(await t.verify(secret, current, now - 30_000), true, 'one step early');
  // Two steps is not: a wider window multiplies an attacker's blind-guess odds.
  assert.equal(await t.verify(secret, current, now + 90_000), false, 'two steps late');
  assert.equal(await t.verify(secret, current, now - 90_000), false, 'two steps early');
});

test('malformed input is rejected without touching crypto', async () => {
  const secret = t.generateSecret();
  for (const bad of ['', '12345', '1234567', 'abcdef', '12 34 56 78', null, undefined]) {
    assert.equal(await t.verify(secret, String(bad ?? ''), Date.now()), false, String(bad));
  }
});

test('spaces inside an otherwise valid code are tolerated', async () => {
  const now = 1_700_000_000_000;
  const secret = t.generateSecret();
  const code = await t.currentCode(secret, now);
  assert.equal(await t.verify(secret, `${code.slice(0, 3)} ${code.slice(3)}`, now), true);
});

test('a code from a different secret never verifies', async () => {
  const now = 1_700_000_000_000;
  const code = await t.currentCode(t.generateSecret(), now);
  assert.equal(await t.verify(t.generateSecret(), code, now), false);
});

test('generated secrets are 160-bit and distinct', () => {
  const a = t.generateSecret();
  const b = t.generateSecret();
  assert.equal(t.base32Decode(a).length, 20);
  assert.notEqual(a, b);
});

test('the otpauth URI carries everything an app needs', () => {
  const uri = t.otpauthUri('JBSWY3DPEHPK3PXP', 'owner@example.com');
  assert.match(uri, /^otpauth:\/\/totp\//);
  assert.match(uri, /secret=JBSWY3DPEHPK3PXP/);
  assert.match(uri, /issuer=FormRelay/);
  assert.match(uri, /digits=6/);
  assert.match(uri, /period=30/);
  // The account must be inside the label, so the app shows which account it belongs to.
  assert.match(decodeURIComponent(uri), /FormRelay:owner@example\.com/);
});

test('recovery codes are distinct, readable, and free of ambiguous characters', () => {
  const codes = t.generateRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const code of codes) {
    assert.match(code, /^[a-z0-9]{5}-[a-z0-9]{5}$/, code);
    // No l/i/o/0/1: these are transcribed by hand from a screen to paper.
    assert.doesNotMatch(code, /[lio01]/, code);
  }
});

test('recovery codes normalise so formatting does not defeat a valid one', () => {
  assert.equal(t.normaliseRecoveryCode('AbC12-xy9Z8'), 'abc12xy9z8');
  assert.equal(t.normaliseRecoveryCode('abc12xy9z8'), 'abc12xy9z8');
});

test('constant-time comparison still returns the right answer', () => {
  assert.equal(t.timingSafeEqual('123456', '123456'), true);
  assert.equal(t.timingSafeEqual('123456', '123457'), false);
  assert.equal(t.timingSafeEqual('123456', '12345'), false);
});
