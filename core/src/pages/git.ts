import { simpleGit, type SimpleGit } from 'simple-git';
import { existsSync, unlinkSync } from 'node:fs';
import type { AuthorIdentity, Revision } from './types.ts';

function client(repoRoot: string): SimpleGit {
  return simpleGit(repoRoot);
}

function validateEmail(email: string): void {
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
    throw new Error(`invalid email format: ${email}`);
  }
}

export async function addAndCommit(
  repoRoot: string,
  paths: string[],
  author: AuthorIdentity,
  summary: string,
): Promise<string> {
  validateEmail(author.email);
  const git = client(repoRoot);
  await git.add(paths);
  const result = await git.commit(summary, paths, {
    '--author': `${author.name} <${author.email}>`,
  });
  if (!result.commit) {
    // simple-git swallows pre-commit hook failures and returns an empty commit
    // string instead of throwing. Surface this as an error so PageStore.write's
    // atomic-rollback path can react and the API can return 500.
    throw new Error(`git commit produced no commit (likely a hook failure or empty change for ${paths.join(', ')})`);
  }
  return result.commit;
}

export async function fileHistory(
  repoRoot: string,
  path: string,
  limit: number,
): Promise<Revision[]> {
  const git = client(repoRoot);
  const log = await git.log({ file: path, maxCount: limit });
  return log.all.map((c) => ({
    sha: c.hash,
    author: c.author_name,
    email: c.author_email,
    date: c.date,
    summary: c.message,
  }));
}

export interface FileVersion {
  body: string;
  commitId: string;
  commitTime: string;
}

/**
 * Return every version of a file in chronological order
 * (oldest commit first). Follows renames. Used by code that needs to
 * reconstruct per-line history from the commit chain — e.g. the
 * note edit-history modal.
 *
 * `relPath` is relative to `repoRoot`. Commits where the file did not
 * exist at the path are skipped; other `git show` errors propagate.
 */
export async function fileVersions(
  repoRoot: string,
  relPath: string,
): Promise<FileVersion[]> {
  const git = client(repoRoot);
  const log = await git.log({ file: relPath, '--follow': null });
  const oldestFirst = [...log.all].reverse();

  const bodies = await Promise.all(
    oldestFirst.map(async (c) => {
      try {
        return await git.show([`${c.hash}:${relPath}`]);
      } catch (err) {
        // `git show` reports a missing path as `exists on disk, but not in
        // <sha>` or `path … does not exist in <sha>`. Anything else
        // (corrupt repo, permission error) should surface.
        const msg = err instanceof Error ? err.message : String(err);
        if (/does not exist in|exists on disk, but not in/i.test(msg)) return null;
        throw err;
      }
    }),
  );

  const out: FileVersion[] = [];
  for (let i = 0; i < oldestFirst.length; i++) {
    const body = bodies[i];
    if (body === null || body === undefined) continue;
    const c = oldestFirst[i]!;
    out.push({ body, commitId: c.hash, commitTime: c.date });
  }
  return out;
}

/**
 * Restore a file to its state at HEAD. If the file was never tracked at HEAD,
 * remove it from the working tree (covers the rollback-after-failed-create case).
 */
export async function restoreFromIndex(repoRoot: string, path: string): Promise<void> {
  const git = client(repoRoot);
  try {
    await git.checkout(['HEAD', '--', path]);
  } catch {
    if (existsSync(path)) unlinkSync(path);
  }
}

/**
 * Thrown by `pullRebase` when a rebase hits a merge conflict. The rebase
 * is aborted before this is thrown, so the repo is left clean at its
 * pre-rebase HEAD — never in a half-rebased state.
 */
export class RebaseConflictError extends Error {
  constructor(public readonly conflictedFiles: string[]) {
    super(
      conflictedFiles.length > 0
        ? `rebase conflict — aborted; ${conflictedFiles.length} file(s) conflicted: ${conflictedFiles.join(', ')}`
        : 'rebase conflict — aborted; conflicted files unknown (git status failed mid-rebase)',
    );
    this.name = 'RebaseConflictError';
  }
}

/**
 * Push committed work on `branch` to `remote`. Throws if the push is
 * rejected (e.g. a non-fast-forward when the remote has commits the
 * local branch lacks) so the caller can pull-rebase and retry.
 */
export async function push(
  repoRoot: string,
  remote: string,
  branch: string,
): Promise<void> {
  await client(repoRoot).push(remote, branch);
}

/**
 * Fetch `remote`/`branch` and rebase the local branch onto it.
 *
 * Returns `true` if the rebase integrated new upstream commits (HEAD
 * moved), `false` if the local branch was already up to date.
 *
 * On a rebase conflict, aborts the rebase and throws
 * `RebaseConflictError` — the working tree is left clean at the
 * pre-rebase HEAD, never half-rebased.
 *
 * Precondition: the working tree is clean (no uncommitted changes).
 * Callers running alongside page writes must hold the page-write lock
 * so a rebase never races an in-flight commit.
 */
export async function pullRebase(
  repoRoot: string,
  remote: string,
  branch: string,
): Promise<boolean> {
  const git = client(repoRoot);
  const before = await git.revparse(['HEAD']);
  await git.fetch(remote, branch);
  try {
    await git.rebase([`${remote}/${branch}`]);
  } catch {
    // Catches ALL git.rebase failures, not only conflicts. After a
    // successful fetch with a clean tree + lock held, a rebase failure
    // is realistically always a conflict; rebase --abort restores the
    // pre-rebase HEAD either way, so the repo is left safe.
    let conflicted: string[] = [];
    try {
      conflicted = (await git.status()).conflicted;
    } catch {
      // `git status` can fail mid-rebase on some git versions; fall through
      // with an empty list rather than masking the conflict.
    }
    try {
      await git.rebase(['--abort']);
    } catch {
      // nothing to abort / already aborted — ignore
    }
    throw new RebaseConflictError(conflicted);
  }
  const after = await git.revparse(['HEAD']);
  return before !== after;
}
