import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { simpleGit } from 'simple-git';

export interface TestRepo {
  root: string;
  pagesDir: string;
  cleanup: () => void;
}

/** Create a temp dir with a git-initialized empty wiki structure for tests. */
export async function makeTestRepo(): Promise<TestRepo> {
  const root = mkdtempSync(join(tmpdir(), 'pages-test-'));
  const pagesDir = join(root, 'pages');
  mkdirSync(pagesDir, { recursive: true });
  writeFileSync(join(root, '.gitignore'), '');

  const git = simpleGit(root);
  await git.init();
  await git.addConfig('user.name', 'Test Runner');
  await git.addConfig('user.email', 'test@example.com');
  await git.add('.gitignore');
  await git.commit('initial');

  return {
    root,
    pagesDir,
    cleanup: () => {
      try { rmSync(root, { recursive: true, force: true }); } catch {}
    },
  };
}

export interface SyncedRepos {
  /** Path to the bare repo that stands in for the GitHub data repo. */
  remote: string;
  /** Working clone A — stands in for the Mac Studio (canonical). */
  a: string;
  /** Working clone B — stands in for the Render replica. */
  b: string;
  cleanup: () => void;
}

/**
 * Build a bare remote plus two working clones, each with an identical
 * `seed.md` initial commit on `main`. Models the Mac Studio + Render
 * replica both cloned from the GitHub data repo.
 */
export async function makeSyncedRepos(): Promise<SyncedRepos> {
  const base = mkdtempSync(join(tmpdir(), 'git-sync-test-'));
  const remote = join(base, 'remote.git');
  mkdirSync(remote, { recursive: true });
  await simpleGit(remote).init(['--bare', '--initial-branch=main']);

  // Clone A: seed an initial commit, force the branch name to `main`, push.
  const a = join(base, 'a');
  await simpleGit(base).clone(remote, a);
  const ga = simpleGit(a);
  await ga.addConfig('user.name', 'Clone A');
  await ga.addConfig('user.email', 'a@example.com');
  writeFileSync(join(a, 'seed.md'), 'seed\n');
  await ga.add('seed.md');
  await ga.commit('seed');
  await ga.branch(['-M', 'main']);
  await ga.push(['-u', 'origin', 'main']);

  // Clone B: clone the now-seeded remote.
  const b = join(base, 'b');
  await simpleGit(base).clone(remote, b);
  const gb = simpleGit(b);
  await gb.addConfig('user.name', 'Clone B');
  await gb.addConfig('user.email', 'b@example.com');

  return {
    remote,
    a,
    b,
    cleanup: () => {
      try { rmSync(base, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}
