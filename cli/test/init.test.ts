import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInit } from '../src/commands/init.js';

interface FakeFs {
  files: Map<string, string>;
  reads: string[];
  writes: Array<{ path: string; content: string }>;
  dirs: Set<string>;
}

function makeFs(initial: Record<string, string> = {}): FakeFs {
  const files = new Map<string, string>(Object.entries(initial));
  const dirs = new Set<string>();
  for (const p of files.keys()) {
    // Mark all parent dirs as existing
    for (let dir = p.split('/').slice(0, -1).join('/'); dir; dir = dir.split('/').slice(0, -1).join('/')) {
      dirs.add(dir);
    }
  }
  return { files, reads: [], writes: [], dirs };
}

function inject(fs: FakeFs) {
  return {
    readFile: (p: string) => {
      fs.reads.push(p);
      const v = fs.files.get(p);
      if (v === undefined) throw new Error(`ENOENT: ${p}`);
      return v;
    },
    writeFile: (p: string, content: string) => {
      fs.writes.push({ path: p, content });
      fs.files.set(p, content);
    },
    mkdirP: (p: string) => { fs.dirs.add(p); },
    exists: (p: string) => fs.files.has(p) || fs.dirs.has(p),
  };
}

test('init: writes both templates to a clean repo', async () => {
  const fs = makeFs({ '/repo/.git/HEAD': 'ref: refs/heads/main' });
  let out = '';
  const code = await runInit({
    rootDir: '/repo',
    force: false,
    hookOnly: false,
    ciOnly: false,
    ...inject(fs),
    write: (s) => { out += s; },
    writeErr: () => {},
  });
  assert.equal(code, 0);
  assert.ok(fs.files.get('/repo/.git/hooks/pre-commit'));
  assert.ok(fs.files.get('/repo/.github/workflows/check.yml'));
  assert.match(out, /pre-commit/);
  assert.match(out, /check\.yml/);
});

test('init: refuses to overwrite an existing hook without --force', async () => {
  const fs = makeFs({
    '/repo/.git/HEAD': 'ref: refs/heads/main',
    '/repo/.git/hooks/pre-commit': '#!/bin/sh\necho preexisting\n',
  });
  let outErr = '';
  const code = await runInit({
    rootDir: '/repo',
    force: false,
    hookOnly: false,
    ciOnly: false,
    ...inject(fs),
    write: () => {},
    writeErr: (s) => { outErr += s; },
  });
  // Hook is skipped; CI workflow still written.
  assert.equal(code, 1);
  assert.equal(fs.files.get('/repo/.git/hooks/pre-commit'), '#!/bin/sh\necho preexisting\n');
  assert.ok(fs.files.get('/repo/.github/workflows/check.yml'));
  assert.match(outErr, /pre-commit.*exists/i);
});

test('init: --force overwrites existing files', async () => {
  const fs = makeFs({
    '/repo/.git/HEAD': 'ref: refs/heads/main',
    '/repo/.git/hooks/pre-commit': 'old',
    '/repo/.github/workflows/check.yml': 'old',
  });
  const code = await runInit({
    rootDir: '/repo',
    force: true,
    hookOnly: false,
    ciOnly: false,
    ...inject(fs),
    write: () => {},
    writeErr: () => {},
  });
  assert.equal(code, 0);
  assert.notEqual(fs.files.get('/repo/.git/hooks/pre-commit'), 'old');
  assert.notEqual(fs.files.get('/repo/.github/workflows/check.yml'), 'old');
});

test('init --hook-only: writes the hook, skips the workflow', async () => {
  const fs = makeFs({ '/repo/.git/HEAD': 'ref: refs/heads/main' });
  const code = await runInit({
    rootDir: '/repo',
    force: false,
    hookOnly: true,
    ciOnly: false,
    ...inject(fs),
    write: () => {},
    writeErr: () => {},
  });
  assert.equal(code, 0);
  assert.ok(fs.files.get('/repo/.git/hooks/pre-commit'));
  assert.equal(fs.files.get('/repo/.github/workflows/check.yml'), undefined);
});

test('init --ci-only: writes the workflow, skips the hook', async () => {
  const fs = makeFs({ '/repo/.git/HEAD': 'ref: refs/heads/main' });
  const code = await runInit({
    rootDir: '/repo',
    force: false,
    hookOnly: false,
    ciOnly: true,
    ...inject(fs),
    write: () => {},
    writeErr: () => {},
  });
  assert.equal(code, 0);
  assert.equal(fs.files.get('/repo/.git/hooks/pre-commit'), undefined);
  assert.ok(fs.files.get('/repo/.github/workflows/check.yml'));
});

test('init: errors if the rootDir is not a git repo', async () => {
  const fs = makeFs({}); // no .git/
  let outErr = '';
  const code = await runInit({
    rootDir: '/repo',
    force: false,
    hookOnly: false,
    ciOnly: false,
    ...inject(fs),
    write: () => {},
    writeErr: (s) => { outErr += s; },
  });
  assert.equal(code, 2);
  assert.match(outErr, /not a git repo|\.git/i);
});

test('init: idempotent — running twice with --force produces the same result', async () => {
  const fs = makeFs({ '/repo/.git/HEAD': 'ref: refs/heads/main' });
  const opts = {
    rootDir: '/repo',
    force: true,
    hookOnly: false,
    ciOnly: false,
    ...inject(fs),
    write: () => {},
    writeErr: () => {},
  };
  await runInit(opts);
  const firstHook = fs.files.get('/repo/.git/hooks/pre-commit');
  const firstCi = fs.files.get('/repo/.github/workflows/check.yml');
  await runInit(opts);
  assert.equal(fs.files.get('/repo/.git/hooks/pre-commit'), firstHook);
  assert.equal(fs.files.get('/repo/.github/workflows/check.yml'), firstCi);
});
