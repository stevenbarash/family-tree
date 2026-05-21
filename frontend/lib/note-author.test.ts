import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noteAuthorName } from './note-author.ts';

const session = { name: 'Signed-In Member', email: 'member@example.com' };

test('noteAuthorName: auth on ignores a client-supplied `by` (anti-spoof)', () => {
  // On the WHOAMI_AUTH=on replica the only writers are signed-in family
  // members; honouring a client `by` would let one write as another.
  assert.equal(noteAuthorName(true, session, 'someone-else'), 'Signed-In Member');
});

test('noteAuthorName: auth on uses the session identity when no `by` is sent', () => {
  assert.equal(noteAuthorName(true, session, undefined), 'Signed-In Member');
});

test('noteAuthorName: auth off honours the trusted client `by`', () => {
  // Local / Tailscale: the CLI is trusted and records the OS user or an
  // agent's model name via `by` — that attribution must survive.
  assert.equal(noteAuthorName(false, session, 'Claude Opus 4.7'), 'Claude Opus 4.7');
});

test('noteAuthorName: auth off falls back to the session identity when no `by`', () => {
  assert.equal(noteAuthorName(false, session, undefined), 'Signed-In Member');
});
