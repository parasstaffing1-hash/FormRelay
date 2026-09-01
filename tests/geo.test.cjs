const assert = require('node:assert/strict');
const test = require('node:test');
const geo = require('../.test-build/geo.js');

test('flags are built from regional indicator symbols, no assets needed', () => {
  assert.equal(geo.countryFlag('US'), '\u{1F1FA}\u{1F1F8}');
  assert.equal(geo.countryFlag('IN'), '\u{1F1EE}\u{1F1F3}');
  assert.equal(geo.countryFlag('gb'), '\u{1F1EC}\u{1F1E7}', 'lowercase input still works');
});

test('a malformed code gets a neutral flag rather than mojibake', () => {
  for (const bad of ['', 'X', 'USA', '12', null, undefined]) {
    assert.equal(geo.countryFlag(bad), '\u{1F3F3}', String(bad));
  }
});

test('known countries get real names', () => {
  assert.equal(geo.countryName('IN'), 'India');
  assert.equal(geo.countryName('us'), 'United States');
  assert.equal(geo.countryName('TR'), 'Türkiye');
});

test('an unlisted but valid code shows as itself, not as Unknown', () => {
  // Folding MT into "Unknown" would hide a real country behind a bucket that is supposed
  // to mean "we could not resolve this".
  assert.equal(geo.countryName('MT'), 'MT');
});

test('Cloudflare special codes are named, not dropped', () => {
  // A spike in Tor or unresolved traffic is itself a signal worth seeing.
  assert.equal(geo.countryName('T1'), 'Tor network');
  assert.equal(geo.countryName('XX'), 'Unknown');
  assert.equal(geo.countryName(''), 'Unknown');
});

test('countries rank by count, descending', () => {
  const ranked = geo.rankCountries([
    { code: 'IN', count: 5 },
    { code: 'US', count: 12 },
    { code: 'DE', count: 8 },
  ]);
  assert.deepEqual(ranked.map((r) => r.code), ['US', 'DE', 'IN']);
  assert.equal(ranked[0].name, 'United States');
});

test('ties break alphabetically so the order is stable between loads', () => {
  const ranked = geo.rankCountries([{ code: 'US', count: 3 }, { code: 'DE', count: 3 }]);
  assert.deepEqual(ranked.map((r) => r.code), ['DE', 'US']);
});

test('share is a percentage of the total, to one decimal', () => {
  const ranked = geo.rankCountries([{ code: 'US', count: 1 }, { code: 'IN', count: 3 }]);
  assert.equal(ranked.find((r) => r.code === 'IN').share, 75);
  assert.equal(ranked.find((r) => r.code === 'US').share, 25);
});

test('share is of the true total, so a truncated list does not sum to 100', () => {
  // Passing an explicit total matters when the query is LIMITed: five countries at 12%
  // each must not be reported as 20% each.
  const ranked = geo.rankCountries([{ code: 'US', count: 12 }, { code: 'IN', count: 12 }], 100);
  assert.equal(ranked[0].share, 12);
  assert.equal(ranked.reduce((sum, r) => sum + r.share, 0), 24);
});

test('zero-count rows are dropped rather than shown at 0%', () => {
  assert.deepEqual(geo.rankCountries([{ code: 'US', count: 0 }]), []);
});

test('an empty set produces no rows and no division by zero', () => {
  assert.deepEqual(geo.rankCountries([]), []);
});

test('the country is read from Cloudflare request properties', () => {
  assert.equal(geo.countryFromRequest({ country: 'in' }), 'IN');
  assert.equal(geo.countryFromRequest({ country: 'T1' }), 'T1');
});

test('a missing cf object yields no country rather than a fabricated one', () => {
  // cf is absent in local dev and in tests; recording "" would invent a country.
  for (const absent of [undefined, null, {}, { country: 123 }, { country: 'USA' }]) {
    assert.equal(geo.countryFromRequest(absent), '', JSON.stringify(absent));
  }
});
