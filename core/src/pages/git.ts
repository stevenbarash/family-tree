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
