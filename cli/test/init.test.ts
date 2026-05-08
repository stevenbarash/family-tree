import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInit } from '../src/commands/init.js';

interface FakeFs {
  files: Map<string, string>;
  reads: string[];
  writes: Array<{ path: string; content: string }>;
  dirs: Set<string>;
  configs: Array<{ key: string; value: string }>;
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
  return { files, reads: [], writes: [], dirs, configs: [] };
}

function inject(fs: FakeFs) {
  return {
    writeFile: (p: string, content: string) => {
      fs.writes.push({ path: p, content });
      fs.files.set(p, content);
    },
    mkdirP: (p: string) => { fs.dirs.add(p); },
    exists: (p: string) => fs.files.has(p) || fs.dirs.has(p),
    setGitConfig: (key: string, value: string) => { fs.configs.push({ key, value }); },
  };
}

test('init: writes hook to .githooks/ and CI workflow to .github/workflows/', async () => {
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
  assert.ok(fs.files.get('/repo/.githooks/pre-commit'));
  assert.ok(fs.files.get('/repo/.github/workflows/check.yml'));
  assert.match(out, /pre-commit/);
  assert.match(out, /check\.yml/);
});

test('init: sets core.hooksPath to .githooks after writing the hook', async () => {
  const fs = makeFs({ '/repo/.git/HEAD': 'ref: refs/heads/main' });
  await runInit({
    rootDir: '/repo',
    force: false,
    hookOnly: false,
    ciOnly: false,
    ...inject(fs),
    write: () => {},
    writeErr: () => {},
  });
  assert.deepEqual(fs.configs, [{ key: 'core.hooksPath', value: '.githooks' }]);
});

test('init: refuses to overwrite an existing hook without --force', async () => {
  const fs = makeFs({
    '/repo/.git/HEAD': 'ref: refs/heads/main',
    '/repo/.githooks/pre-commit': '#!/bin/sh\necho preexisting\n',
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
  // Hook is skipped (and core.hooksPath is NOT set since the hook write didn't happen);
  // CI workflow is still written.
  assert.equal(code, 1);
  assert.equal(fs.files.get('/repo/.githooks/pre-commit'), '#!/bin/sh\necho preexisting\n');
  assert.ok(fs.files.get('/repo/.github/workflows/check.yml'));
  assert.match(outErr, /pre-commit.*exists/i);
  assert.equal(fs.configs.length, 0);
});

test('init: --force overwrites existing files', async () => {
  const fs = makeFs({
    '/repo/.git/HEAD': 'ref: refs/heads/main',
    '/repo/.githooks/pre-commit': 'old',
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
  assert.notEqual(fs.files.get('/repo/.githooks/pre-commit'), 'old');
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
  assert.ok(fs.files.get('/repo/.githooks/pre-commit'));
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
  assert.equal(fs.files.get('/repo/.githooks/pre-commit'), undefined);
  assert.ok(fs.files.get('/repo/.github/workflows/check.yml'));
  // No hook → no core.hooksPath set
  assert.equal(fs.configs.length, 0);
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
  const firstHook = fs.files.get('/repo/.githooks/pre-commit');
  const firstCi = fs.files.get('/repo/.github/workflows/check.yml');
  await runInit(opts);
  assert.equal(fs.files.get('/repo/.githooks/pre-commit'), firstHook);
  assert.equal(fs.files.get('/repo/.github/workflows/check.yml'), firstCi);
});
