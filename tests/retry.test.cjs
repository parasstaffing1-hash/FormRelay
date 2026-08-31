const test = require("node:test");
const assert = require("node:assert");

const { isRetryable, nextAttemptAt, MAX_ATTEMPTS } = require("../.test-build/retry.js");

/* Which failures earn another attempt. The distinction matters: a 400 means the receiver
   read the payload and rejected it, so a day of retries changes nothing but burns quota. */
test("retries transport failures and timeouts", () => {
  assert.equal(isRetryable(null), true);
});

test("retries 5xx", () => {
  for (const s of [500, 502, 503, 504]) {
    assert.equal(isRetryable(s), true, `${s} should retry`);
  }
});

test("retries 408 and 429 but no other 4xx", () => {
  assert.equal(isRetryable(408), true);
  assert.equal(isRetryable(429), true);
  for (const s of [400, 401, 403, 404, 410, 422]) {
    assert.equal(isRetryable(s), false, `${s} should not retry`);
  }
});

test("2xx and 3xx are never retried", () => {
  for (const s of [200, 201, 204, 301, 302]) {
    assert.equal(isRetryable(s), false, `${s} should not retry`);
  }
});

/* The backoff schedule must terminate. A driver that always returns a next attempt
   retries forever and the queue never drains. */
test("backoff grows and then gives up", () => {
  const now = 1_000_000;
  let prev = 0;
  for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
    const at = nextAttemptAt(attempt, now);
    assert.notEqual(at, null, `attempt ${attempt} should still schedule`);
    const delay = at - now;
    assert.ok(delay > prev, `attempt ${attempt} delay ${delay} should exceed previous ${prev}`);
    prev = delay;
  }
  assert.equal(nextAttemptAt(MAX_ATTEMPTS, now), null, "final attempt must not reschedule");
  assert.equal(nextAttemptAt(MAX_ATTEMPTS + 5, now), null, "past the end stays null");
});

test("first retry is a minute out, last is a day", () => {
  const now = 0;
  assert.equal(nextAttemptAt(1, now), 60_000);
  assert.equal(nextAttemptAt(MAX_ATTEMPTS - 1, now), 24 * 60 * 60_000);
});
