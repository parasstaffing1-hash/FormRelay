const assert = require('node:assert/strict');
const test = require('node:test');
const {
  resendProvider, httpProvider, selectProvider, senderAddress,
  sendNotification, sendAutoReply, EmailDeliveryError,
  submissionEmailHtml, submissionEmailText,
} = require('../.test-build/email.js');

const FORM = { id: 'f1', name: 'Contact', notify_email: 'owner@acme.com', auto_reply: 1 };
const DATA = { name: 'Ada', email: 'ada@acme.com', message: 'Hello' };

/** Swaps global fetch for the duration of one call. */
async function withFetch(impl, run) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await run(); } finally { globalThis.fetch = original; }
}

const okResponse = (body = { id: 'msg_1' }) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

/* ------------------------------------------------------- failure reporting */

test('a provider error is reported as failure, not success', async () => {
  const result = await withFetch(
    async () => new Response(JSON.stringify({ message: 'API key is invalid' }), { status: 401 }),
    () => resendProvider('bad-key').send({ to: 'a@b.com', from: 'x@y.com', subject: 's', html: '<p>h</p>' })
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.match(result.error, /401/);
  assert.match(result.error, /API key is invalid/);
});

test('sendNotification throws on provider failure so callers cannot record success', async () => {
  await withFetch(
    async () => new Response('upstream exploded', { status: 500 }),
    async () => {
      await assert.rejects(
        () => sendNotification({ RESEND_API_KEY: 'k' }, FORM, DATA),
        (err) => {
          assert.ok(err instanceof EmailDeliveryError, 'must be an EmailDeliveryError');
          assert.equal(err.result.ok, false);
          assert.equal(err.result.status, 500);
          return true;
        }
      );
    }
  );
});

test('a network error is a failure, not a silent pass', async () => {
  const result = await withFetch(
    async () => { throw new Error('connection reset'); },
    () => resendProvider('k').send({ to: 'a@b.com', from: 'x@y.com', subject: 's', html: '<p>h</p>' })
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /connection reset/);
});

test('a non-JSON error body still yields a usable message', async () => {
  const result = await withFetch(
    async () => new Response('<html>502 Bad Gateway</html>', { status: 502 }),
    () => resendProvider('k').send({ to: 'a@b.com', from: 'x@y.com', subject: 's', html: '<p>h</p>' })
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /502/);
});

/* ---------------------------------------------------------------- success */

test('a successful send reports the provider and message id', async () => {
  const outcome = await withFetch(
    async () => okResponse({ id: 'msg_abc' }),
    () => sendNotification({ RESEND_API_KEY: 'k' }, FORM, DATA)
  );
  assert.equal(outcome.sent, true);
  assert.equal(outcome.result.provider, 'resend');
  assert.equal(outcome.result.id, 'msg_abc');
});

test('reply-to is set from the respondent address when it is valid', async () => {
  let sentBody = null;
  await withFetch(
    async (_url, init) => { sentBody = JSON.parse(init.body); return okResponse(); },
    () => sendNotification({ RESEND_API_KEY: 'k' }, FORM, DATA)
  );
  assert.equal(sentBody.reply_to, 'ada@acme.com');
  assert.ok(sentBody.text, 'a plaintext alternative must be included');
});

/* ------------------------------------------------------------------ skips */

test('no configured provider is a skip, not a failure and not a success', async () => {
  const outcome = await sendNotification({}, FORM, DATA);
  assert.equal(outcome.sent, false);
  assert.match(outcome.skipped, /no email provider/);
});

test('missing recipient and disabled autoresponder are skips with reasons', async () => {
  const noRecipient = await sendNotification({ RESEND_API_KEY: 'k' }, { ...FORM, notify_email: '' }, DATA);
  assert.equal(noRecipient.sent, false);
  assert.match(noRecipient.skipped, /recipient/);

  const off = await sendAutoReply({ RESEND_API_KEY: 'k' }, { ...FORM, auto_reply: 0 }, DATA);
  assert.equal(off.sent, false);
  assert.match(off.skipped, /disabled/);

  const noAddress = await sendAutoReply({ RESEND_API_KEY: 'k' }, FORM, { message: 'no address here' });
  assert.equal(noAddress.sent, false);
  assert.match(noAddress.skipped, /address/);
});

/* -------------------------------------------------------- provider choice */

test('provider selection honours configuration and falls back sensibly', () => {
  assert.equal(selectProvider({ RESEND_API_KEY: 'k' }).name, 'resend');
  assert.equal(selectProvider({ EMAIL_API_URL: 'https://mail.internal/send' }).name, 'http');
  assert.equal(selectProvider({ EMAIL_PROVIDER: 'http', EMAIL_API_URL: 'https://x/send' }).name, 'http');
  assert.equal(selectProvider({}), null, 'no configuration means no provider');
});

test('an alternative HTTP provider works through the same interface', async () => {
  let target = null;
  const result = await withFetch(
    async (url) => { target = url; return new Response('', { status: 202 }); },
    () => httpProvider('https://mail.internal/send', 'tok').send({ to: 'a@b.com', from: 'x@y.com', subject: 's', html: '<p>h</p>' })
  );
  assert.equal(result.ok, true);
  assert.equal(target, 'https://mail.internal/send');
});

test('sender address falls back when MAIL_FROM is unset', () => {
  assert.equal(senderAddress({ MAIL_FROM: 'Me <me@acme.com>' }), 'Me <me@acme.com>');
  assert.match(senderAddress({}), /@/);
});

/* ---------------------------------------------------------------- content */

test('submission content escapes field values in both formats', () => {
  const html = submissionEmailHtml('Contact', { note: '<script>alert(1)</script>' });
  assert.ok(!html.includes('<script>'), 'HTML body must escape user content');
  assert.match(submissionEmailText('Contact', { note: 'plain' }), /note: plain/);
});
