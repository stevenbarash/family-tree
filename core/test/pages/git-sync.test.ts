import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { addAndCommit, push, pullRebase, RebaseConflictError } from '../../src/pages/git.ts';
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

test('pullRebase: integrates upstream commits and returns true', async () => {
  const repos = await makeSyncedRepos();
  try {
    // B commits a new file and pushes it.
    const bPath = join(repos.b, 'from-b.md');
    writeFileSync(bPath, 'b\n');
    await addAndCommit(repos.b, [bPath], { name: 'B', email: 'b@x.test' }, 'b adds file');
    await push(repos.b, 'origin', 'main');

    // A pulls — must integrate B's commit and report HEAD advanced.
    const advanced = await pullRebase(repos.a, 'origin', 'main');
    assert.equal(advanced, true);
    assert.equal(readFileSync(join(repos.a, 'from-b.md'), 'utf-8'), 'b\n');
  } finally {
    repos.cleanup();
  }
});

test('pullRebase: returns false when already up to date', async () => {
  const repos = await makeSyncedRepos();
  try {
    const advanced = await pullRebase(repos.a, 'origin', 'main');
    assert.equal(advanced, false);
  } finally {
    repos.cleanup();
  }
});

test('pullRebase: path-disjoint local + upstream edits rebase cleanly', async () => {
  // The sync design partitions writes — the replica only writes talk/notes,
  // the Mac Studio writes articles. Disjoint paths must rebase without conflict.
  const repos = await makeSyncedRepos();
  try {
    // A (Mac Studio) edits an article and pushes.
    const article = join(repos.a, 'article.md');
    writeFileSync(article, 'article by a\n');
    await addAndCommit(repos.a, [article], { name: 'A', email: 'a@x.test' }, 'a: article');
    await push(repos.a, 'origin', 'main');

    // B (replica) commits a *different* file locally, not yet pushed.
    const talk = join(repos.b, 'page.talk.md');
    writeFileSync(talk, 'talk by b\n');
    await addAndCommit(repos.b, [talk], { name: 'B', email: 'b@x.test' }, 'b: talk');

    const advanced = await pullRebase(repos.b, 'origin', 'main');
    assert.equal(advanced, true);
    assert.equal(readFileSync(join(repos.b, 'article.md'), 'utf-8'), 'article by a\n');
    assert.equal(readFileSync(join(repos.b, 'page.talk.md'), 'utf-8'), 'talk by b\n');
  } finally {
    repos.cleanup();
  }
});

test('pullRebase: same-file divergent edits throw RebaseConflictError and leave the repo clean', async () => {
  // A conflicting rebase must abort, not leave a half-rebased repo — a wrong
  // genealogy merge is worse than a stalled sync (fail loud, Rule 12).
  const repos = await makeSyncedRepos();
  try {
    // B edits seed.md and pushes.
    const bSeed = join(repos.b, 'seed.md');
    writeFileSync(bSeed, 'seed edited by b\n');
    await addAndCommit(repos.b, [bSeed], { name: 'B', email: 'b@x.test' }, 'b: seed');
    await push(repos.b, 'origin', 'main');

    // A edits the SAME file differently, locally.
    const aSeed = join(repos.a, 'seed.md');
    writeFileSync(aSeed, 'seed edited by a\n');
    await addAndCommit(repos.a, [aSeed], { name: 'A', email: 'a@x.test' }, 'a: seed');
    const headBefore = await simpleGit(repos.a).revparse(['HEAD']);

    await assert.rejects(
      () => pullRebase(repos.a, 'origin', 'main'),
      (err: unknown) => {
        assert.ok(err instanceof RebaseConflictError, 'expected RebaseConflictError');
        assert.deepEqual(err.conflictedFiles, ['seed.md']);
        return true;
      },
    );

    // Repo is clean (not mid-rebase) at the pre-rebase HEAD.
    const status = await simpleGit(repos.a).status();
    assert.equal(status.conflicted.length, 0);
    assert.equal(status.isClean(), true);
    assert.equal(await simpleGit(repos.a).revparse(['HEAD']), headBefore);
  } finally {
    repos.cleanup();
  }
});
