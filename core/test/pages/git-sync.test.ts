import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { makeSyncedRepos } from './helpers.ts';

test('makeSyncedRepos: builds a bare remote and two seeded clones', async () => {
  const repos = await makeSyncedRepos();
  try {
    // bare remote exists and has the seed commit
    const remoteLog = await simpleGit(repos.remote).log();
    assert.equal(remoteLog.latest?.message, 'seed');
    // both clones have the seed file checked out
    assert.equal(readFileSync(join(repos.a, 'seed.md'), 'utf-8'), 'seed\n');
    assert.equal(readFileSync(join(repos.b, 'seed.md'), 'utf-8'), 'seed\n');
    // both clones are on main and clean
    assert.equal((await simpleGit(repos.a).status()).current, 'main');
    assert.equal((await simpleGit(repos.b).status()).current, 'main');
  } finally {
    repos.cleanup();
    assert.equal(existsSync(repos.a), false);
  }
});
