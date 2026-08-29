const assert = require('node:assert/strict');
const test = require('node:test');
const { guardSelect, cohortFor, applyMigration, migrateSchemaBlocks, isSealed } = require('../.test-build/ops.js');

test('allows a plain SELECT and imposes a limit', () => {
  const v = guardSelect('SELECT id, created_at FROM submissions');
  assert.equal(v.ok, true);
  assert.match(v.sql, /LIMIT 1000$/);
  assert.equal(guardSelect('SELECT id FROM submissions LIMIT 5').sql, 'SELECT id FROM submissions LIMIT 5');
});

test('refuses writes, chaining, and schema verbs', () => {
  for (const sql of [
    'DELETE FROM submissions',
    'SELECT 1 FROM submissions; DROP TABLE forms',
    'UPDATE submissions SET data = 1',
    'PRAGMA table_info(forms)',
    'ATTACH DATABASE x AS y',
  ]) {
    assert.equal(guardSelect(sql).ok, false, sql);
  }
});

test('refuses to read auth and secret tables', () => {
  for (const table of ['users', 'api_keys', 'memberships', 'invitations', 'login_attempts']) {
    const v = guardSelect(`SELECT * FROM ${table}`);
    assert.equal(v.ok, false, table);
    assert.match(v.reason, /not readable|readable table/);
  }
});

test('a column named like a verb is not mistaken for one', () => {
  assert.equal(guardSelect('SELECT updated_at, created_at FROM submissions').ok, true);
});

test('cohorts group by UTC period', () => {
  const when = Date.UTC(2026, 1, 26, 12, 0, 0); // Thursday 26 Feb 2026
  assert.equal(cohortFor(when, 'daily'), '2026-02-26');
  assert.equal(cohortFor(when, 'monthly'), '2026-02');
  assert.equal(cohortFor(when, 'weekly'), '2026-W09');
  assert.equal(cohortFor(when, 'off'), '');
  // Same ISO week, different days, must share a cohort.
  assert.equal(cohortFor(Date.UTC(2026, 1, 23), 'weekly'), cohortFor(Date.UTC(2026, 1, 27), 'weekly'));
});

test('rename carries the label across and drops the old key', () => {
  const out = applyMigration({ old_id: 'Ada', other: 'x', _labels: { old_id: 'Full name', other: 'Other' } }, { kind: 'rename', from: 'old_id', to: 'new_id' });
  assert.equal(out.new_id, 'Ada');
  assert.equal('old_id' in out, false);
  assert.equal(out._labels.new_id, 'Full name');
  assert.equal('old_id' in out._labels, false);
  assert.equal(out.other, 'x', 'unrelated fields are untouched');
});

test('merge joins present values and skips blanks', () => {
  const out = applyMigration({ first: 'Ada', last: 'Lovelace' }, { kind: 'merge', from: ['first', 'last'], to: 'name', separator: ' ' });
  assert.equal(out.name, 'Ada Lovelace');
  assert.equal('first' in out, false);

  const partial = applyMigration({ first: 'Ada', last: '' }, { kind: 'merge', from: ['first', 'last'], to: 'name', separator: ' ' });
  assert.equal(partial.name, 'Ada', 'a blank part must not leave a trailing separator');
});

test('split divides on the first separator only', () => {
  const out = applyMigration({ name: 'Ada Byron Lovelace' }, { kind: 'split', from: 'name', to: ['first', 'last'], separator: ' ' });
  assert.equal(out.first, 'Ada');
  assert.equal(out.last, 'Byron Lovelace');

  const none = applyMigration({ name: 'Ada' }, { kind: 'split', from: 'name', to: ['first', 'last'], separator: ' ' });
  assert.equal(none.first, 'Ada');
  assert.equal(none.last, '');
});

test('a migration with no matching field is a no-op', () => {
  const input = { a: '1' };
  assert.deepEqual(applyMigration(input, { kind: 'rename', from: 'missing', to: 'b' }), input);
});

test('schema block ids migrate alongside the data', () => {
  const schema = JSON.stringify({ blocks: [{ id: 'old_id', type: 'short_text', label: 'Name' }] });
  const out = JSON.parse(migrateSchemaBlocks(schema, { kind: 'rename', from: 'old_id', to: 'new_id' }));
  assert.equal(out.blocks[0].id, 'new_id');
  assert.equal(migrateSchemaBlocks(null, { kind: 'rename', from: 'a', to: 'b' }), null);
  assert.equal(migrateSchemaBlocks('not json', { kind: 'rename', from: 'a', to: 'b' }), 'not json');
});

test('sealing is time-bounded', () => {
  const now = Date.now();
  assert.equal(isSealed(now + 10000, now), true);
  assert.equal(isSealed(now - 10000, now), false);
  assert.equal(isSealed(null, now), false);
});
