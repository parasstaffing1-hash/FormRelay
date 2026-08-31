const assert = require('node:assert/strict');
const test = require('node:test');
const { windowStartFor, verdictFor, rateLimitHeaders, consume, sweepRateCounters } = require('../.test-build/ratelimit.js');

const WINDOW = 60_000;

/** Minimal D1 stand-in implementing the one UPSERT..RETURNING the limiter uses. */
function fakeDb() {
  const rows = new Map();
  const calls = { deletes: [] };
  return {
    rows,
    calls,
    prepare(sql) {
      const self = this;
      return {
        bind(...args) {
          return {
            async first() {
              if (!/INSERT INTO rate_counters/.test(sql)) throw new Error('unexpected sql');
              const [bucket, start] = args;
              const existing = rows.get(bucket);
              const count = existing && existing.window_start === start ? existing.count + 1 : 1;
              rows.set(bucket, { window_start: start, count });
              return { count };
            },
            async run() {
              if (!/DELETE FROM rate_counters/.test(sql)) throw new Error('unexpected sql');
              const [cutoff] = args;
              calls.deletes.push(cutoff);
              for (const [k, v] of rows) if (v.window_start < cutoff) rows.delete(k);
              return { success: true };
            },
          };
        },
      };
    },
  };
}

test('windows are aligned to the epoch, so every isolate agrees on the boundary', () => {
  assert.equal(windowStartFor(0, WINDOW), 0);
  assert.equal(windowStartFor(59_999, WINDOW), 0);
  assert.equal(windowStartFor(60_000, WINDOW), 60_000);
  assert.equal(windowStartFor(60_001, WINDOW), 60_000);
  // Two isolates computing from the same clock must land on the same window.
  assert.equal(windowStartFor(1_700_000_123_456, WINDOW), windowStartFor(1_700_000_150_000, WINDOW));
});

test('the limit admits exactly `limit` requests and rejects the next', () => {
  assert.equal(verdictFor(1, 60, 0, WINDOW, 0).allowed, true);
  assert.equal(verdictFor(60, 60, 0, WINDOW, 0).allowed, true);
  assert.equal(verdictFor(61, 60, 0, WINDOW, 0).allowed, false);
});

test('remaining never goes negative once the limit is blown through', () => {
  assert.equal(verdictFor(60, 60, 0, WINDOW, 0).remaining, 0);
  assert.equal(verdictFor(200, 60, 0, WINDOW, 0).remaining, 0);
});

test('retry-after is whole seconds to the window edge, and never zero', () => {
  assert.equal(verdictFor(61, 60, 0, WINDOW, 0).retryAfter, 60);
  assert.equal(verdictFor(61, 60, 0, WINDOW, 59_500).retryAfter, 1);
  // A request landing on the last millisecond must still be told to wait, not "wait 0".
  assert.equal(verdictFor(61, 60, 0, WINDOW, 59_999).retryAfter, 1);
});

test('Retry-After is sent only on rejection', () => {
  assert.equal('Retry-After' in rateLimitHeaders(60, verdictFor(1, 60, 0, WINDOW, 0)), false);
  assert.equal(rateLimitHeaders(60, verdictFor(61, 60, 0, WINDOW, 0))['Retry-After'], '60');
  assert.equal(rateLimitHeaders(60, verdictFor(5, 60, 0, WINDOW, 0))['X-RateLimit-Remaining'], '55');
});

test('counting is shared, so a caller cannot reset by reaching a fresh isolate', async () => {
  const db = fakeDb();
  for (let i = 0; i < 60; i++) {
    const v = await consume(db, 'api:k1', 60, WINDOW, 1_000);
    assert.equal(v.allowed, true, `request ${i + 1} should be allowed`);
  }
  // A "different isolate" is just another call against the same D1 row.
  const over = await consume(db, 'api:k1', 60, WINDOW, 1_000);
  assert.equal(over.allowed, false);
  assert.equal(over.remaining, 0);
});

test('a new window resets the count instead of accumulating on a stale one', async () => {
  const db = fakeDb();
  for (let i = 0; i < 60; i++) await consume(db, 'api:k1', 60, WINDOW, 1_000);
  assert.equal((await consume(db, 'api:k1', 60, WINDOW, 1_000)).allowed, false);
  const next = await consume(db, 'api:k1', 60, WINDOW, 61_000);
  assert.equal(next.allowed, true);
  assert.equal(next.remaining, 59);
});

test('buckets are independent, so one key cannot exhaust another', async () => {
  const db = fakeDb();
  for (let i = 0; i < 60; i++) await consume(db, 'api:k1', 60, WINDOW, 1_000);
  assert.equal((await consume(db, 'api:k1', 60, WINDOW, 1_000)).allowed, false);
  assert.equal((await consume(db, 'api:k2', 60, WINDOW, 1_000)).allowed, true);
});

test('a database failure allows the request rather than locking out the API', async () => {
  const broken = { prepare() { return { bind() { return { async first() { throw new Error('D1 down'); } }; } }; } };
  const v = await consume(broken, 'api:k1', 60, WINDOW, 1_000);
  assert.equal(v.allowed, true);
  assert.equal(v.remaining, 59);
});

test('the sweep drops closed windows but keeps the live one', async () => {
  const db = fakeDb();
  await consume(db, 'api:old', 60, WINDOW, 1_000);
  await consume(db, 'api:live', 60, WINDOW, 121_000);
  await sweepRateCounters(db, WINDOW, 121_000);
  assert.equal(db.rows.has('api:old'), false);
  assert.equal(db.rows.has('api:live'), true);
});
