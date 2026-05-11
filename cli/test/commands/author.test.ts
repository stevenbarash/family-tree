import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAuthor, type AuthorOptions } from '../../src/commands/author.js';

function fakeOpts(over: Partial<AuthorOptions> = {}): AuthorOptions {
  return {
    rootDir: '/repo',
    slug: 'aidele',
    resume: false,
    noWeb: false,
    skipEpisodes: false,
    dryRun: false,
    harness: { invoke: async () => ({ ok: true, result: {} as never }) },
    client: {} as never,
    readFile: () => null,
    writeFile: () => {},
    exists: () => false,
    gitLog: () => '',
    gitAdd: () => {},
    gitCommit: () => {},
    gitHasUncommittedChanges: () => false,
    gitIsRepo: () => true,
    healthz: async () => true,
    now: () => '2026-05-10',
    write: () => {},
    writeErr: () => {},
    ...over,
  };
}

test('author: aborts with 8 when not a git repo', async () => {
  let err = '';
  const code = await runAuthor(fakeOpts({ gitIsRepo: () => false, writeErr: (s) => { err += s; } }));
  assert.equal(code, 8);
  assert.match(err, /not a git repo/);
});

test('author: aborts with 7 when uncommitted changes', async () => {
  const code = await runAuthor(fakeOpts({ gitHasUncommittedChanges: () => true }));
  assert.equal(code, 7);
});

test('author: aborts with 14 when healthz fails', async () => {
  const code = await runAuthor(fakeOpts({ healthz: async () => false }));
  assert.equal(code, 14);
});

test('author --dry-run: prints plan; returns 0', async () => {
  let out = '';
  const code = await runAuthor(fakeOpts({ dryRun: true, write: (s) => { out += s; } }));
  assert.equal(code, 0);
  assert.match(out, /would run phases 1\.\.7/);
});

test('author --resume: cold start when no prior run', async () => {
  let out = '';
  const code = await runAuthor(fakeOpts({ resume: true, gitLog: () => '', write: (s) => { out += s; } }));
  assert.equal(code, 0);
  assert.match(out, /starting fresh/);
});

test('author --resume: picks up at next phase', async () => {
  const log = 'pipeline-run: r1\nphase: 3\nslug: aidele\ninputs: derived,talk\nfabrication-guard: pass';
  let out = '';
  const code = await runAuthor(fakeOpts({ resume: true, gitLog: () => log, write: (s) => { out += s; } }));
  assert.equal(code, 0);
  assert.match(out, /resuming run r1 at phase 4/);
});
