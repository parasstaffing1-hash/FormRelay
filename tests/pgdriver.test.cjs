const assert = require('node:assert/strict');
const test = require('node:test');
const { insertTarget, withReturningId, SERIAL_ID_TABLES, createPgDatabase } = require('../.test-build/pgdriver.js');

/** Records what the adapter sends, and replays canned rows back. */
function fakeClient(rows = [], count) {
  const sent = [];
  const client = {
    sent,
    async unsafe(text, params) {
      sent.push({ text, params });
      const result = rows.slice();
      if (count !== undefined) result.count = count;
      return result;
    },
    async begin(fn) {
      sent.push({ text: 'BEGIN', params: [] });
      return await fn(client);
    },
  };
  return client;
}

test('the insert target is read off the statement', () => {
  assert.equal(insertTarget('INSERT INTO submissions (a) VALUES (?)'), 'submissions');
  assert.equal(insertTarget('INSERT OR IGNORE INTO memberships (a) VALUES (?)'), 'memberships');
  assert.equal(insertTarget('SELECT * FROM submissions'), null);
});

test('RETURNING id is added for serial-id tables', () => {
  assert.match(withReturningId('INSERT INTO submissions (a) VALUES (?)'), /RETURNING id$/);
});

test('RETURNING id is NOT added for tables without an id column', () => {
  // memberships is keyed on (user_id, workspace_id); asking for id is a hard error,
  // not a graceful degradation.
  assert.equal(withReturningId('INSERT INTO memberships (a) VALUES (?)'), 'INSERT INTO memberships (a) VALUES (?)');
  assert.equal(withReturningId('INSERT INTO settings_kv (a) VALUES (?)'), 'INSERT INTO settings_kv (a) VALUES (?)');
});

test('an existing RETURNING clause is not doubled', () => {
  const sql = 'INSERT INTO submissions (a) VALUES (?) RETURNING id, created_at';
  assert.equal(withReturningId(sql), sql);
});

test('every serial-id table in the set is one the schema actually declares', () => {
  // Guards against the set drifting from the schema: adding a table to one and not the
  // other silently breaks last_row_id for it.
  const fs = require('node:fs');
  const path = require('node:path');
  const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.postgres.sql'), 'utf8');
  for (const table of SERIAL_ID_TABLES) {
    const decl = `CREATE TABLE IF NOT EXISTS ${table} (`;
    const at = schema.indexOf(decl);
    assert.notEqual(at, -1, `${table} should exist in schema.postgres.sql`);
    const body = schema.slice(at, at + decl.length + 80);
    assert.ok(body.includes('id BIGSERIAL PRIMARY KEY'), `${table} should declare id BIGSERIAL PRIMARY KEY`);
  }
});

test('last_row_id comes back from RETURNING id, so new submissions get an id', async () => {
  // The regression this exists to prevent: a null id silently stored on every submission.
  const db = createPgDatabase(fakeClient([{ id: 4242 }], 1));
  const result = await db.prepare('INSERT INTO submissions (a) VALUES (?)').bind('x').run();
  assert.equal(result.meta.last_row_id, 4242);
  assert.equal(result.meta.changes, 1);
});

test('a bigint id returned as a string is still a number', async () => {
  const db = createPgDatabase(fakeClient([{ id: '900001' }], 1));
  const result = await db.prepare('INSERT INTO submissions (a) VALUES (?)').run();
  assert.equal(result.meta.last_row_id, 900001);
});

test('an insert with no id returns null rather than inventing one', async () => {
  const db = createPgDatabase(fakeClient([], 1));
  const result = await db.prepare('INSERT INTO memberships (a) VALUES (?)').run();
  assert.equal(result.meta.last_row_id, null);
  assert.equal(result.meta.changes, 1);
});

test('meta.changes reports affected rows for updates', async () => {
  const db = createPgDatabase(fakeClient([], 7));
  const result = await db.prepare('UPDATE submissions SET a = ?').bind(1).run();
  assert.equal(result.meta.changes, 7);
});

test('statements reach the driver translated, with numbered placeholders', async () => {
  const client = fakeClient([{ id: 1 }], 1);
  const db = createPgDatabase(client);
  await db.prepare('SELECT * FROM forms WHERE id = ? AND name LIKE ?').bind('a', 'b%').all();
  assert.equal(client.sent[0].text, 'SELECT * FROM forms WHERE id = $1 AND name ILIKE $2');
  assert.deepEqual(client.sent[0].params, ['a', 'b%']);
});

test('all() returns the D1 result shape', async () => {
  const db = createPgDatabase(fakeClient([{ id: 1 }, { id: 2 }]));
  const out = await db.prepare('SELECT * FROM forms').all();
  assert.equal(out.success, true);
  assert.deepEqual(out.results.map((r) => r.id), [1, 2]);
});

test('first() returns a single row, or null when empty', async () => {
  assert.equal((await createPgDatabase(fakeClient([{ id: 9 }])).prepare('SELECT 1').first()).id, 9);
  assert.equal(await createPgDatabase(fakeClient([])).prepare('SELECT 1').first(), null);
});

test('bind() does not mutate the prepared statement it came from', async () => {
  const client = fakeClient([], 0);
  const db = createPgDatabase(client);
  const base = db.prepare('SELECT * FROM t WHERE a = ?');
  await base.bind('first').all();
  await base.bind('second').all();
  assert.deepEqual(client.sent.map((s) => s.params), [['first'], ['second']]);
});

test('batch runs inside a transaction, preserving the atomicity ownership transfer needs', async () => {
  const client = fakeClient([], 1);
  const db = createPgDatabase(client);
  const out = await db.batch([
    db.prepare("UPDATE memberships SET role = 'owner' WHERE user_id = ?").bind('a'),
    db.prepare("UPDATE memberships SET role = 'editor' WHERE user_id = ?").bind('b'),
  ]);
  assert.equal(client.sent[0].text, 'BEGIN');
  assert.equal(out.length, 2);
  assert.equal(client.sent.length, 3);
});
