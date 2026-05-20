import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { pullRebase, push, RebaseConflictError } from '@core/pages/git.ts';
import { withLock } from '@core/pages/locks.ts';
import {
  WHOAMI_ROOT,
  SEARCH_INDEX_FILE,
  SYNC_PUSH,
  SYNC_INTERVAL_MS,
  DATA_REPO_URL,
  DATA_REPO_TOKEN,
} from '@/lib/env';

/**
 * Lock key shared by the page-write API and the sync scheduler, so a
 * `pullRebase` never rebases while a write is mid-commit. Any constant
 * string works — it only has to be identical on both sides.
 */
export const REPO_LOCK = 'whoami:repo';

const REMOTE = 'origin';
const BRANCH = 'main';

/**
 * Embed an access token into an https git URL. A clone/push from a headless
 * container has no credential helper, so the token rides in the URL.
 */
export function composeAuthedUrl(url: string, token: string): string {
  if (!token || !url.startsWith('https://')) return url;
  return url.replace('https://', `https://x-access-token:${token}@`);
}

/**
 * Clone the data repo onto the persistent disk if it is not there yet.
 * No-op when `WHOAMI_ROOT` is already a git repo — every boot after the
 * first, and always on the Mac Studio.
 */
export async function bootstrapData(): Promise<void> {
  if (existsSync(join(WHOAMI_ROOT, '.git'))) return;
  if (!DATA_REPO_URL) {
    console.error(
      '[sync] WHOAMI_ROOT is not a git repo and WHOAMI_DATA_REPO_URL is unset — cannot bootstrap',
    );
    return;
  }
  console.log('[sync] cloning data repo onto', WHOAMI_ROOT);
  await simpleGit().clone(composeAuthedUrl(DATA_REPO_URL, DATA_REPO_TOKEN), WHOAMI_ROOT);
}

/** One sync cycle: pull upstream, rebuild search if anything moved, push. */
async function syncTick(): Promise<void> {
  try {
    const advanced = await pullRebase(WHOAMI_ROOT, REMOTE, BRANCH);
    if (advanced) {
      const { rebuildSearchIndexFromDisk } = await import('@/lib/server-services');
      await rebuildSearchIndexFromDisk();
    }
  } catch (err) {
    if (err instanceof RebaseConflictError) {
      console.error('[sync] rebase conflict — sync stalled until resolved:', err.message);
    } else {
      console.error('[sync] pull failed:', err);
    }
    return; // never push on a failed pull
  }
  try {
    await push(WHOAMI_ROOT, REMOTE, BRANCH);
  } catch (err) {
    console.warn('[sync] push failed (will retry next tick):', err);
  }
}

let started = false;

/**
 * Run once at server startup (from `instrumentation.ts`): bootstrap the
 * data, ensure the search index exists, and — on the replica only — start
 * the pull/push scheduler.
 */
export async function bootstrapAndStartSync(): Promise<void> {
  if (started) return;
  started = true;

  await bootstrapData();

  if (!existsSync(SEARCH_INDEX_FILE)) {
    const { rebuildSearchIndexFromDisk } = await import('@/lib/server-services');
    await rebuildSearchIndexFromDisk();
  }

  if (!SYNC_PUSH) return; // the scheduler runs on the Render replica only

  // Replica-only git setup — writes the container's global git config,
  // never the Mac Studio's (unreachable when SYNC_PUSH is off):
  //  - safe.directory: the data repo is on a mounted disk git sees as
  //    owned by another uid; without this the dubious-ownership guard
  //    (CVE-2022-24765) refuses every pull/push. Only honoured from
  //    global/system config, never `-c` or per-repo.
  //  - user identity: a fresh container has no committer identity, so
  //    git would fall back to an auto-derived `user@hostname`.
  // Guarded: a config failure must not stop the scheduler from starting —
  // a later pull will surface the cause loudly.
  try {
    const cfg = simpleGit();
    await cfg.raw(['config', '--global', '--add', 'safe.directory', WHOAMI_ROOT]);
    await cfg.raw(['config', '--global', 'user.name', 'whoami sync']);
    await cfg.raw(['config', '--global', 'user.email', 'sync@whoami.local']);
  } catch (err) {
    console.error('[sync] git global config failed — sync may not work:', err);
  }

  // The first clone embeds the access token in origin's URL, and the data
  // disk persists across deploys — so a rotated or renewed token would
  // otherwise never take effect. Re-point origin at the current token.
  if (DATA_REPO_URL && DATA_REPO_TOKEN) {
    try {
      await simpleGit(WHOAMI_ROOT).remote(
        ['set-url', REMOTE, composeAuthedUrl(DATA_REPO_URL, DATA_REPO_TOKEN)],
      );
    } catch (err) {
      console.error('[sync] could not refresh origin url:', err);
    }
  }

  const tick = () => withLock(REPO_LOCK, syncTick);
  await tick(); // initial catch-up pull
  setInterval(() => { void tick(); }, SYNC_INTERVAL_MS);
}

/**
 * Best-effort push after a browser write. The caller already holds
 * `REPO_LOCK`. Never throws — the write has already succeeded; if the push
 * fails the scheduler retries on its next tick.
 */
export async function pushAfterWrite(): Promise<void> {
  if (!SYNC_PUSH) return;
  try {
    await push(WHOAMI_ROOT, REMOTE, BRANCH);
  } catch (err) {
    console.warn('[sync] post-write push failed (scheduler will retry):', err);
  }
}
