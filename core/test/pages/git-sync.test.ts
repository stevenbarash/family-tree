import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { addAndCommit, push } from '../../src/pages/git.ts';
import { makeSyncedRepos } from './helpers.ts';

test('push: uploads a local commit to the remote', async () => {
  const repos = await makeSyncedRepos();
  try {
    const path = join(repos.b, 'note.md');
    writeFileSync(path, 'hello from b\n');
    await addAndCommit(repos.b, [path], { name: 'B', email: 'b@x.test' }, 'add note');

    await push(repos.b, 'origin', 'main');

    const remoteLog = await simpleGit(repos.remote).log();
    assert.equal(remoteLog.latest?.message, 'add note');
  } finally {
    repos.cleanup();
  }
});

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
