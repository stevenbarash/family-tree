import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runNote } from '../src/commands/note.js';

function fakeClient() {
  const calls: { slug: string; note: string }[] = [];
  return {
    calls,
    note: async (slug: string, note: string) => {
      calls.push({ slug, note });
      const talkSlug = slug.endsWith('.talk') ? slug : `${slug}.talk`;
      return { slug: talkSlug, date: '2026-05-05' };
    },
  };
}

test('note: forwards article slug to the server', async () => {
  const client = fakeClient();
  let out = '';
  await runNote({
    slug: 'grandpa',
    note: 'first note',
    client,
    write: (s) => { out += s; },
  });
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0]!.slug, 'grandpa');
  assert.equal(client.calls[0]!.note, 'first note');
  assert.match(out, /note added to grandpa\.talk \(2026-05-05\)/);
});

test('note: strips .talk suffix before forwarding (canonical client form)', async () => {
  const client = fakeClient();
  await runNote({
    slug: 'grandpa.talk',
    note: 'x',
    client,
    write: () => {},
  });
  assert.equal(client.calls[0]!.slug, 'grandpa');
});

test('note: rejects empty input without hitting the server', async () => {
  const client = fakeClient();
  await assert.rejects(
    runNote({ slug: 'grandpa', note: '   \n\n  ', client, write: () => {} }),
    /note is empty/,
  );
  assert.equal(client.calls.length, 0);
});
