import type { HarnessAdapter } from '../harness/types.js';
import type { ApiClient } from '../api-client.js';
import { newRunId, findResumePoint } from './author/pipeline-run.js';

export interface AuthorOptions {
  rootDir: string;
  slug: string;
  resume: boolean;
  noWeb: boolean;
  skipEpisodes: boolean;
  dryRun: boolean;
  branch?: string;
  harness: HarnessAdapter;
  client: ApiClient;
  // Real I/O:
  readFile: (p: string) => string | null;
  writeFile: (p: string, c: string) => void;
  exists: (p: string) => boolean;
  gitLog: (rootDir: string, grep: string) => string;
  gitAdd: (paths: string[]) => void;
  gitCommit: (subject: string, body: string) => void;
  gitHasUncommittedChanges: () => boolean;
  gitIsRepo: () => boolean;
  healthz: () => Promise<boolean>;
  now: () => string;
  write: (s: string) => void;
  writeErr: (s: string) => void;
}

export async function runAuthor(opts: AuthorOptions): Promise<number> {
  // Pre-flight
  if (!opts.gitIsRepo()) {
    opts.writeErr(`author: ${opts.rootDir} is not a git repo\n`);
    return 8;
  }
  if (opts.gitHasUncommittedChanges()) {
    opts.writeErr(`author: ${opts.rootDir} has uncommitted changes; commit or stash first\n`);
    return 7;
  }
  if (!(await opts.healthz())) {
    opts.writeErr(`author: frontend server not reachable; cannot author\n`);
    return 14;
  }

  // Resume detection
  let runId: string;
  let startPhase: number;
  if (opts.resume) {
    const log = opts.gitLog(opts.rootDir, `slug: ${opts.slug}`);
    const found = findResumePoint(log, opts.slug);
    if (found) {
      runId = found.runId;
      startPhase = found.nextPhase;
      opts.write(`author: resuming run ${runId} at phase ${startPhase}\n`);
    } else {
      runId = newRunId();
      startPhase = 1;
      opts.write(`author: no prior run for ${opts.slug}; starting fresh (run ${runId})\n`);
    }
  } else {
    runId = newRunId();
    startPhase = 1;
  }

  if (opts.dryRun) {
    opts.write(`author --dry-run: would run phases ${startPhase}..7 for ${opts.slug} (run ${runId})\n`);
    return 0;
  }

  // Phase loop scaffold (Tasks 4-10 fill these in).
  const PHASES = [
    { n: 1, name: 'gather' },
    { n: 2, name: 'research' },
    { n: 3, name: 'outline' },
    { n: 4, name: 'draft (person)' },
    { n: 5, name: 'draft (episodes)' },
    { n: 6, name: 'verify' },
    { n: 7, name: 'log' },
  ];
  for (const p of PHASES) {
    if (p.n < startPhase) continue;
    opts.write(`[${p.n}/7] ${p.name} … (skeleton; Plan 2 tasks 4-10 fill this in)\n`);
  }
  return 0;
}
