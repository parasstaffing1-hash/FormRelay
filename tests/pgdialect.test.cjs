const assert = require('node:assert/strict');
const test = require('node:test');
const { numberPlaceholders, translateInsertOr, translateLike, assertTranslatable, toPostgres, coerceRow } = require('../.test-build/pgdialect.js');

test('positional markers become $1..$n in order', () => {
  assert.equal(
    numberPlaceholders('SELECT * FROM forms WHERE id = ? AND workspace_id = ?'),
    'SELECT * FROM forms WHERE id = $1 AND workspace_id = $2'
  );
});

test('a question mark inside a string literal is not a placeholder', () => {
  // This is the failure that would corrupt rather than break: every later parameter
  // would shift by one and the query would run against the wrong values.
  assert.equal(
    numberPlaceholders("SELECT * FROM t WHERE note = 'why?' AND id = ?"),
    "SELECT * FROM t WHERE note = 'why?' AND id = $1"
  );
});

test('an escaped quote inside a literal does not end the literal', () => {
  assert.equal(
    numberPlaceholders("SELECT * FROM t WHERE a = 'it''s ok? really' AND b = ?"),
    "SELECT * FROM t WHERE a = 'it''s ok? really' AND b = $1"
  );
});

test('quoted identifiers are left alone', () => {
  assert.equal(
    numberPlaceholders('SELECT "weird?col" FROM t WHERE id = ?'),
    'SELECT "weird?col" FROM t WHERE id = $1'
  );
});

test('INSERT OR IGNORE becomes ON CONFLICT DO NOTHING', () => {
  const out = translateInsertOr("INSERT OR IGNORE INTO memberships (user_id) VALUES (?)");
  assert.match(out, /^INSERT INTO memberships/);
  assert.match(out, /ON CONFLICT DO NOTHING$/);
});

test('an existing ON CONFLICT clause is not doubled', () => {
  const sql = "INSERT OR IGNORE INTO t (a) VALUES (?) ON CONFLICT(a) DO UPDATE SET a = 1";
  const out = translateInsertOr(sql);
  assert.equal((out.match(/ON CONFLICT/gi) || []).length, 1);
});

test('the conflict clause is placed before RETURNING, which must stay last', () => {
  const out = translateInsertOr("INSERT OR IGNORE INTO t (a) VALUES (?) RETURNING id");
  assert.match(out, /ON CONFLICT DO NOTHING RETURNING id$/);
});

test('INSERT OR REPLACE is refused rather than guessed at', () => {
  // Postgres needs an explicit conflict target; inventing one would silently change
  // which row wins. Better to fail at translation time.
  assert.throws(() => translateInsertOr("INSERT OR REPLACE INTO t (a) VALUES (?)"), /no safe automatic translation/);
});

test('LIKE becomes ILIKE, preserving SQLite case-insensitive search', () => {
  // The silent one: without this, form search keeps working but quietly matches less.
  assert.equal(translateLike('WHERE f.name LIKE ?'), 'WHERE f.name ILIKE $?'.replace('$?', '?'));
  assert.match(translateLike('WHERE name LIKE ?'), /ILIKE/);
});

test('NOT LIKE stays a single negation', () => {
  assert.equal(translateLike('WHERE a NOT LIKE ?'), 'WHERE a NOT ILIKE ?');
});

test('SQLite-only constructs are rejected loudly, not mistranslated', () => {
  for (const sql of [
    'PRAGMA table_info(forms)',
    'SELECT GROUP_CONCAT(name) FROM forms',
    "SELECT datetime(created_at) FROM forms",
    "SELECT strftime('%Y', created_at) FROM forms",
  ]) {
    assert.throws(() => assertTranslatable(sql), /Untranslatable SQL/, sql);
  }
});

test('a full translation applies every rule in the right order', () => {
  const out = toPostgres("INSERT OR IGNORE INTO t (a, b) VALUES (?, ?)");
  assert.equal(out, 'INSERT INTO t (a, b) VALUES ($1, $2) ON CONFLICT DO NOTHING');
});

test('the real listFormsWithStats query translates correctly', () => {
  const out = toPostgres(
    'SELECT f.*, COUNT(s.id) AS submission_count FROM forms f LEFT JOIN submissions s ON s.form_id = f.id WHERE f.workspace_id = ? AND f.name LIKE ? GROUP BY f.id'
  );
  assert.match(out, /f\.workspace_id = \$1 AND f\.name ILIKE \$2/);
});

test('bigint counts come back as numbers, not strings', () => {
  // COUNT(*) is bigint in Postgres and arrives as a string; the app does arithmetic on it.
  assert.equal(coerceRow({ n: 42n }).n, 42);
  assert.equal(coerceRow({ submission_count: '17' }).submission_count, 17);
});

test('a bigint too large for a JS number stays a string rather than losing precision', () => {
  const huge = BigInt(Number.MAX_SAFE_INTEGER) + 10n;
  assert.equal(coerceRow({ n: huge }).n, huge.toString());
});

test('numeric-looking form answers are not silently converted', () => {
  // A postcode with a leading zero, or a phone number, must survive as text.
  assert.equal(coerceRow({ data: '01234' }).data, '01234');
  assert.equal(coerceRow({ note: '12345' }).note, '12345');
});

test('a null row stays null', () => {
  assert.equal(coerceRow(null), null);
});

/* ---------- analytics: date bucketing and JSON extraction ---------- */

test('the analytics day-bucket expression translates to Postgres', () => {
  // This exact query drives the /admin dashboard. Untranslated, the whole page 500s.
  const out = toPostgres(
    "SELECT strftime('%Y-%m-%d', datetime(created_at/1000, 'unixepoch')) AS d, COUNT(*) AS c FROM form_events GROUP BY d"
  );
  assert.match(out, /to_char\(to_timestamp\(created_at\/1000\), 'YYYY-MM-DD'\) AS d/);
  assert.doesNotMatch(out, /strftime|datetime/);
});

test('json_extract becomes a Postgres JSON accessor', () => {
  const out = toPostgres("SELECT json_extract(metadata_json, '$.utm_source') AS source FROM form_events");
  assert.match(out, /\(metadata_json::json->>'utm_source'\) AS source/);
  assert.doesNotMatch(out, /json_extract/);
});

test('all three UTM extractions in one statement translate', () => {
  const out = toPostgres(
    "SELECT json_extract(metadata_json, '$.utm_source') AS source, json_extract(metadata_json, '$.utm_medium') AS medium, json_extract(metadata_json, '$.utm_campaign') AS campaign FROM form_events"
  );
  assert.equal((out.match(/::json->>/g) || []).length, 3);
});

test('an unmapped date format is refused rather than guessed at', () => {
  // A wrong bucket returns plausible numbers, which is the worst possible failure for
  // analytics -- so anything outside SQLITE_DATE_FORMATS must not translate.
  assert.throws(
    () => toPostgres("SELECT strftime('%W', datetime(created_at/1000, 'unixepoch')) FROM form_events"),
    /Untranslatable SQL/
  );
});

test('a nested json path is refused rather than silently returning null', () => {
  assert.throws(
    () => toPostgres("SELECT json_extract(metadata_json, '$.a.b') FROM form_events"),
    /Untranslatable SQL/
  );
});
