const assert = require('node:assert/strict');
const test = require('node:test');
const { getForm, getFormInWorkspace, listForms, listFormsWithStats, createForm, duplicateForm, DEFAULT_WORKSPACE } = require('../.test-build/db.js');

/**
 * D1 stand-in that actually honours the WHERE clause for the columns these queries filter
 * on. It is deliberately literal about the SQL: if a query stops mentioning workspace_id,
 * these tests fail rather than quietly passing.
 */
function fakeDb(forms = []) {
  const rows = forms.slice();
  const seen = [];
  return {
    rows,
    seen,
    prepare(sql) {
      seen.push(sql.replace(/\s+/g, ' ').trim());
      return {
        bind(...args) {
          return {
            async first() {
              if (/WHERE id = \? AND workspace_id = \?/.test(sql)) {
                const [id, ws] = args;
                return rows.find((r) => r.id === id && r.workspace_id === ws) ?? null;
              }
              if (/WHERE id = \?/.test(sql)) return rows.find((r) => r.id === args[0]) ?? null;
              return null;
            },
            async all() {
              if (/f\.workspace_id = \? AND f\.name LIKE \?/.test(sql)) {
                const [ws, like] = args;
                const needle = String(like).replace(/%/g, '').toLowerCase();
                return { results: rows.filter((r) => r.workspace_id === ws && r.name.toLowerCase().includes(needle)) };
              }
              if (/workspace_id = \?/.test(sql)) return { results: rows.filter((r) => r.workspace_id === args[0]) };
              return { results: rows.slice() };
            },
            async run() {
              if (/INSERT INTO forms/.test(sql)) {
                // Column order in the INSERT puts workspace_id last.
                rows.push({ id: args[0], name: args[1], workspace_id: args[args.length - 1] });
              }
              return { success: true };
            },
          };
        },
      };
    },
  };
}

const FIXTURE = [
  { id: 'f_mine', name: 'Contact', workspace_id: 'ws_a' },
  { id: 'f_theirs', name: 'Payroll', workspace_id: 'ws_b' },
  { id: 'f_legacy', name: 'Legacy', workspace_id: DEFAULT_WORKSPACE },
];

test('a form from another workspace reads as absent, not as forbidden', async () => {
  const db = fakeDb(FIXTURE);
  assert.equal((await getFormInWorkspace(db, 'f_mine', 'ws_a')).id, 'f_mine');
  // The distinction matters: returning null rather than throwing means a caller's ordinary
  // 404 fires, so form ids cannot be probed for existence across tenants.
  assert.equal(await getFormInWorkspace(db, 'f_theirs', 'ws_a'), null);
});

test('the workspace predicate is in the SQL, not applied after the fact', async () => {
  const db = fakeDb(FIXTURE);
  await getFormInWorkspace(db, 'f_mine', 'ws_a');
  assert.match(db.seen.at(-1), /WHERE id = \? AND workspace_id = \?/);
});

test('the unscoped read still exists for the public surface', async () => {
  const db = fakeDb(FIXTURE);
  // /f/:id and /r/:token are reached by anonymous visitors who have no workspace.
  assert.equal((await getForm(db, 'f_theirs')).id, 'f_theirs');
});

test('listings return only the calling workspace', async () => {
  const db = fakeDb(FIXTURE);
  assert.deepEqual((await listForms(db, 'ws_a')).map((f) => f.id), ['f_mine']);
  assert.deepEqual((await listForms(db, 'ws_b')).map((f) => f.id), ['f_theirs']);
});

test('listForms without an explicit workspace falls back to the bootstrap one, not to everything', async () => {
  const db = fakeDb(FIXTURE);
  const rows = await listForms(db);
  assert.deepEqual(rows.map((f) => f.id), ['f_legacy']);
});

test('a search term narrows within the workspace and cannot escape it', async () => {
  const db = fakeDb(FIXTURE);
  // "Payroll" exists, but not in ws_a — searching for it must not surface it.
  assert.deepEqual((await listFormsWithStats(db, 'Payroll', 'ws_a')).map((f) => f.id), []);
  assert.deepEqual((await listFormsWithStats(db, 'Payroll', 'ws_b')).map((f) => f.id), ['f_theirs']);
  assert.match(db.seen.at(-1), /f\.workspace_id = \? AND f\.name LIKE \?/);
});

test('a new form is written into the creating workspace, not left to the column default', async () => {
  const db = fakeDb([]);
  const row = await createForm(db, { name: 'New', workspaceId: 'ws_a' });
  assert.equal(row.workspace_id, 'ws_a');
  assert.equal(db.rows[0].workspace_id, 'ws_a');
});

test('a copy stays in its source workspace', async () => {
  const db = fakeDb([]);
  const copy = await duplicateForm(db, { id: 'f_theirs', name: 'Payroll', workspace_id: 'ws_b', redirect_url: '', schema_json: null });
  assert.equal(copy.workspace_id, 'ws_b');
});

test('a form created without a workspace lands in the bootstrap workspace', async () => {
  const db = fakeDb([]);
  const row = await createForm(db, { name: 'New' });
  assert.equal(row.workspace_id, DEFAULT_WORKSPACE);
});

/* ---------- ownership transfer ---------- */

const { transferOwnership } = require('../.test-build/db.js');

/** D1 stand-in for the memberships table, including batch-as-transaction semantics. */
function membershipDb(members) {
  const rows = members.slice();
  let batched = 0;
  const api = {
    rows,
    get batches() { return batched; },
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              const [userId, ws] = args;
              return rows.find((r) => r.user_id === userId && r.workspace_id === ws) ?? null;
            },
            _apply() {
              const role = /role = 'owner'/.test(sql) ? 'owner' : 'editor';
              const [userId, ws] = args;
              const row = rows.find((r) => r.user_id === userId && r.workspace_id === ws);
              if (row) row.role = role;
            },
          };
        },
      };
    },
    async batch(statements) {
      batched++;
      // D1 applies a batch as one transaction; model that by applying all or nothing.
      for (const st of statements) st._apply();
      return statements.map(() => ({ success: true }));
    },
  };
  return api;
}

const MEMBERS = () => [
  { user_id: 'u_owner', workspace_id: 'ws_a', role: 'owner' },
  { user_id: 'u_editor', workspace_id: 'ws_a', role: 'editor' },
  { user_id: 'u_other', workspace_id: 'ws_b', role: 'owner' },
];

test('transfer promotes the target and demotes the previous owner in one batch', async () => {
  const db = membershipDb(MEMBERS());
  assert.equal(await transferOwnership(db, 'ws_a', 'u_owner', 'u_editor'), true);
  assert.equal(db.rows.find((r) => r.user_id === 'u_editor').role, 'owner');
  assert.equal(db.rows.find((r) => r.user_id === 'u_owner').role, 'editor');
  // One batch, so the workspace is never observably ownerless or double-owned.
  assert.equal(db.batches, 1);
});

test('the workspace always ends with exactly one owner', async () => {
  const db = membershipDb(MEMBERS());
  await transferOwnership(db, 'ws_a', 'u_owner', 'u_editor');
  const owners = db.rows.filter((r) => r.workspace_id === 'ws_a' && r.role === 'owner');
  assert.equal(owners.length, 1);
});

test('ownership cannot be pushed onto a member of another workspace', async () => {
  const db = membershipDb(MEMBERS());
  assert.equal(await transferOwnership(db, 'ws_a', 'u_owner', 'u_other'), false);
  assert.equal(db.rows.find((r) => r.user_id === 'u_other').role, 'owner');
  assert.equal(db.batches, 0);
});

test('a non-owner cannot transfer ownership', async () => {
  const db = membershipDb(MEMBERS());
  assert.equal(await transferOwnership(db, 'ws_a', 'u_editor', 'u_owner'), false);
  assert.equal(db.batches, 0);
});

test('transferring to yourself is refused rather than demoting you to editor', async () => {
  const db = membershipDb(MEMBERS());
  assert.equal(await transferOwnership(db, 'ws_a', 'u_owner', 'u_owner'), false);
  assert.equal(db.rows.find((r) => r.user_id === 'u_owner').role, 'owner');
  assert.equal(db.batches, 0);
});

test('an unknown target is refused without writing', async () => {
  const db = membershipDb(MEMBERS());
  assert.equal(await transferOwnership(db, 'ws_a', 'u_owner', 'u_ghost'), false);
  assert.equal(db.batches, 0);
});

/* ---------- listings reached through a form ---------- */

const { listWebhooks, listDeadLetters, listContacts, countContacts } = require('../.test-build/db.js');
const { getFiles, countFiles } = require('../.test-build/files.js');

/** Captures the SQL so the tests assert on the join, not just the returned rows. */
function sqlSpy(rows = []) {
  const seen = [];
  return {
    seen,
    prepare(sql) {
      seen.push(sql.replace(/\s+/g, ' ').trim());
      return {
        bind(...args) {
          seen[seen.length - 1] += ` -- binds:${JSON.stringify(args)}`;
          return {
            async all() { return { results: rows }; },
            async first() { return rows[0] ?? { n: 0 }; },
          };
        },
      };
    },
  };
}

test('the global webhook list is joined to forms and filtered by workspace', async () => {
  // Before this, the list showed every tenant's endpoints -- including their URLs.
  const db = sqlSpy();
  await listWebhooks(db, undefined, 'ws_a');
  assert.match(db.seen[0], /JOIN forms f ON f\.id = w\.form_id WHERE f\.workspace_id = \?/);
  assert.match(db.seen[0], /binds:\["ws_a"\]/);
});

test('a per-form webhook list still checks the form belongs to the workspace', async () => {
  const db = sqlSpy();
  await listWebhooks(db, 'f_1', 'ws_a');
  assert.match(db.seen[0], /w\.form_id = \? AND f\.workspace_id = \?/);
});

test('dead letters are scoped through their form', async () => {
  const db = sqlSpy();
  await listDeadLetters(db, 50, 'ws_a');
  assert.match(db.seen[0], /JOIN forms f ON f\.id = d\.form_id/);
  assert.match(db.seen[0], /f\.workspace_id = \?/);
});

test('contacts filter on their own workspace column, unconditionally', async () => {
  const db = sqlSpy();
  await listContacts(db, { workspaceId: 'ws_a' });
  assert.match(db.seen[0], /WHERE workspace_id = \?/);
  // A search term must narrow within the workspace, never replace the predicate.
  const db2 = sqlSpy();
  await listContacts(db2, { workspaceId: 'ws_a', q: 'bob' });
  assert.match(db2.seen[0], /workspace_id = \? AND \(email/);
});

test('the contact count uses the same predicate as the listing', async () => {
  // If these disagree, pagination shows page counts for rows the user cannot see.
  const db = sqlSpy();
  await countContacts(db, { workspaceId: 'ws_a' });
  assert.match(db.seen[0], /WHERE workspace_id = \?/);
});

test('files are scoped through their form with an inner join', async () => {
  const db = sqlSpy();
  await getFiles(db, { workspaceId: 'ws_a' });
  // Inner join, not left: a file whose form is gone belongs to no workspace and must not
  // surface in whichever tenant happens to be listing.
  assert.match(db.seen[0], /FROM files fi JOIN forms fo ON fo\.id = fi\.form_id/);
  assert.doesNotMatch(db.seen[0], /LEFT JOIN/);
  assert.match(db.seen[0], /fo\.workspace_id = \?/);
});

test('the file count matches the file listing', async () => {
  const db = sqlSpy();
  await countFiles(db, { workspaceId: 'ws_a' });
  assert.match(db.seen[0], /JOIN forms fo ON fo\.id = fi\.form_id WHERE fo\.workspace_id = \?/);
});
