import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runNote } from '../src/commands/note.js';

type NoteKind = 'human' | 'agent' | 'interview' | 'research' | 'transcript';

interface Calls {
  note: { slug: string; note: string; by?: string; kind?: NoteKind }[];
  edit: { slug: string; id: string; note: string; by?: string }[];
  del: { slug: string; id: string; by?: string }[];
  restore: { slug: string; id: string }[];
  list: { slug: string }[];
}

type FakeClient = {
  note: (s: string, n: string, o?: { by?: string; kind?: NoteKind }) => Promise<{ slug: string; date: string; id: string }>;
  editNote: (s: string, id: string, n: string, o?: { by?: string }) => Promise<{ slug: string; id: string; editedAt: string }>;
  deleteNote: (s: string, id: string, o?: { by?: string }) => Promise<{ slug: string; id: string; deletedAt: string }>;
  restoreNote: (s: string, id: string) => Promise<{ slug: string; id: string }>;
  listNotes: (s: string) => Promise<unknown[]>;
  calls: Calls;
};

function fakeClient(): FakeClient {
  const calls: Calls = { note: [], edit: [], del: [], restore: [], list: [] };
  return {
    calls,
    note: async (slug, note, opts = {}) => {
      calls.note.push({ slug, note, ...opts });
      return { slug: slug.endsWith('.talk') ? slug : `${slug}.talk`, date: '2026-05-06', id: 'n_a1b2c3d4' };
    },
    editNote: async (slug, id, note, opts = {}) => {
      calls.edit.push({ slug, id, note, ...opts });
      return { slug: `${slug}.talk`, id, editedAt: '2026-05-06T16:00:00Z' };
    },
    deleteNote: async (slug, id, opts = {}) => {
      calls.del.push({ slug, id, ...opts });
      return { slug: `${slug}.talk`, id, deletedAt: '2026-05-06T17:00:00Z' };
    },
    restoreNote: async (slug, id) => {
      calls.restore.push({ slug, id });
      return { slug: `${slug}.talk`, id };
    },
    listNotes: async (slug) => {
      calls.list.push({ slug });
      return [
        { id: 'n_a1', date: '2026-05-06', text: 'first', by: 'steven', kind: 'human', createdAt: '2026-05-06T14:00:00Z', editedAt: null, editedBy: null, deletedAt: null, deletedBy: null, isLegacy: false },
        { id: 'n_b2', date: '2026-05-06', text: 'deleted', by: 'steven', kind: 'human', createdAt: '2026-05-06T14:30:00Z', editedAt: null, editedBy: null, deletedAt: '2026-05-06T15:00:00Z', deletedBy: 'steven', isLegacy: false },
      ];
    },
  };
}

test('note: append forwards by/kind from options', async () => {
  const c = fakeClient();
  let out = '';
  await runNote({ slug: 'grandpa', mode: 'append', note: 'hi', by: 'alice', kind: 'agent', client: c, write: (s) => { out += s; } });
  assert.equal(c.calls.note.length, 1);
  assert.deepEqual(c.calls.note[0], { slug: 'grandpa', note: 'hi', by: 'alice', kind: 'agent' });
  assert.match(out, /note added to grandpa\.talk \(2026-05-06, n_a1b2c3d4\)/);
});

test('note: edit mode forwards id and text', async () => {
  const c = fakeClient();
  let out = '';
  await runNote({ slug: 'grandpa', mode: 'edit', id: 'n_a1b2c3d4', note: 'rewritten', client: c, write: (s) => { out += s; } });
  assert.equal(c.calls.edit.length, 1);
  assert.deepEqual(c.calls.edit[0], { slug: 'grandpa', id: 'n_a1b2c3d4', note: 'rewritten' });
  assert.match(out, /note n_a1b2c3d4 edited/);
});

test('note: delete mode forwards id', async () => {
  const c = fakeClient();
  let out = '';
  await runNote({ slug: 'grandpa', mode: 'delete', id: 'n_a1b2c3d4', client: c, write: (s) => { out += s; } });
  assert.equal(c.calls.del.length, 1);
  assert.deepEqual(c.calls.del[0], { slug: 'grandpa', id: 'n_a1b2c3d4' });
  assert.match(out, /note n_a1b2c3d4 retracted/);
});

test('note: restore mode forwards id', async () => {
  const c = fakeClient();
  let out = '';
  await runNote({ slug: 'grandpa', mode: 'restore', id: 'n_a1b2c3d4', client: c, write: (s) => { out += s; } });
  assert.equal(c.calls.restore.length, 1);
  assert.deepEqual(c.calls.restore[0], { slug: 'grandpa', id: 'n_a1b2c3d4' });
  assert.match(out, /note n_a1b2c3d4 restored/);
});

test('note: list prints id + date + preview, marks deleted', async () => {
  const c = fakeClient();
  let out = '';
  await runNote({ slug: 'grandpa', mode: 'list', client: c, write: (s) => { out += s; } });
  assert.match(out, /n_a1\s+2026-05-06\s+first/);
  assert.match(out, /\[deleted\]\s+n_b2\s+2026-05-06\s+deleted/);
});

test('note: list --json prints structured array', async () => {
  const c = fakeClient();
  let out = '';
  await runNote({ slug: 'grandpa', mode: 'list', json: true, client: c, write: (s) => { out += s; } });
  const arr = JSON.parse(out);
  assert.equal(arr.length, 2);
  assert.equal(arr[0].id, 'n_a1');
});

test('note: rejects empty input on append', async () => {
  const c = fakeClient();
  await assert.rejects(
    runNote({ slug: 'grandpa', mode: 'append', note: '   \n  ', client: c, write: () => {} }),
    /note is empty/,
  );
});

test('note: rejects empty input on edit', async () => {
  const c = fakeClient();
  await assert.rejects(
    runNote({ slug: 'grandpa', mode: 'edit', id: 'n_a1b2c3d4', note: '', client: c, write: () => {} }),
    /note is empty/,
  );
});

test('note: append still strips .talk suffix from slug', async () => {
  const c = fakeClient();
  await runNote({ slug: 'grandpa.talk', mode: 'append', note: 'x', client: c, write: () => {} });
  assert.equal(c.calls.note[0]!.slug, 'grandpa');
});

test('note: append accepts kind=interview', async () => {
  const c = fakeClient();
  let out = '';
  await runNote({ slug: 'aidele', mode: 'append', note: 'q&a body', kind: 'interview', client: c, write: (s) => { out += s; } });
  assert.equal(c.calls.note.length, 1);
  assert.equal(c.calls.note[0]!.kind, 'interview');
});

test('note: append accepts kind=research', async () => {
  const c = fakeClient();
  let out = '';
  await runNote({ slug: 'aidele', mode: 'append', note: 'src', kind: 'research', client: c, write: (s) => { out += s; } });
  assert.equal(c.calls.note[0]!.kind, 'research');
});

test('note: append accepts kind=transcript', async () => {
  const c = fakeClient();
  let out = '';
  await runNote({ slug: 'aidele', mode: 'append', note: 't', kind: 'transcript', client: c, write: (s) => { out += s; } });
  assert.equal(c.calls.note[0]!.kind, 'transcript');
});

test('note: rejects empty slug without calling the API', async () => {
  const client = fakeClient();
  await assert.rejects(
    () => runNote({ slug: '', mode: 'append', note: 'hello', client: client as any, write: () => {} }),
    /slug/i,
  );
  assert.equal(client.calls.note.length, 0);
});
