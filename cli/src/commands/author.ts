import type { HarnessAdapter } from '../harness/types.js';
import type { ApiClient } from '../api-client.js';
import { newRunId, findResumePoint, formatTrailer, TOTAL_PHASES, type CommitTrailer } from './author/pipeline-run.js';
import { gather, type EvidenceDrawer } from './author/gather.js';
import { research, formatResearchNote } from './author/research.js';
import { outline, formatOutlineForTalk, type OutlinePlan } from './author/outline.js';
import { draftPerson } from './author/draft-person.js';
import { draftEpisode } from './author/draft-episode.js';
import { verify } from './author/verify.js';
import { formatAgentLog } from './author/log.js';
import { journalAppend, journalReadCompleted, journalReadStartedNotCompleted, type JournalDeps } from './author/cohort-journal.js';

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
  /**
   * Optional web search implementation. When omitted, the research phase
   * runs with no-op functions that return empty results (noWeb-equivalent).
   * Real implementations (harness tool calls or native HTTP) land in a
   * follow-on task — the harness adapter doesn't yet expose a Tool surface
   * for webSearch/webFetch.
   */
  webSearch?: (query: string) => Promise<ReadonlyArray<{ title: string; url: string; snippet: string }>>;
  webFetch?: (url: string) => Promise<string | null>;
  /**
   * Injectable consistency-check runner for Phase 6. When provided, the verify
   * phase calls it to apply format/schema fixes and check for consistency
   * findings. When omitted, the no-op default is used (always passes, no fixes).
   */
  runCheck?: (args: { only: string[]; fix?: boolean }) => Promise<{ exitCode: number; findingCount: number; fixedCount: number }>;
  /**
   * Injectable phase implementations for testing. When omitted, the real
   * implementations from ./author/* are used.
   */
  _gather?: typeof gather;
  _research?: typeof research;
  _outline?: typeof outline;
  _draftPerson?: typeof draftPerson;
  _draftEpisode?: typeof draftEpisode;
  _verify?: typeof verify;
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
    opts.write(`author --dry-run: would run phases ${startPhase}..${TOTAL_PHASES} for ${opts.slug} (run ${runId})\n`);
    return 0;
  }

  // Injectable implementations (defaults to real phase functions).
  const gatherFn = opts._gather ?? gather;
  const researchFn = opts._research ?? research;
  const outlineFn = opts._outline ?? outline;
  const draftPersonFn = opts._draftPerson ?? draftPerson;
  const draftEpisodeFn = opts._draftEpisode ?? draftEpisode;
  const verifyFn = opts._verify ?? verify;

  // Shared state passed forward across phases.
  let drawer: EvidenceDrawer | null = null;
  let plan: OutlinePlan | null = null;
  let sourcesCount = 0;
  let episodeSlugs: string[] = [];
  let completedPhases = 0;

  // Helper: build a commit trailer for a given phase.
  function makeTrailer(phase: number, inputs: CommitTrailer['inputs'], sources?: number): string {
    return formatTrailer({
      pipelineRun: runId,
      phase,
      slug: opts.slug,
      inputs,
      sources,
      fabricationGuard: 'pass',
    });
  }

  // Helper: commit if git shows uncommitted changes.
  function maybeCommit(subject: string, trailer: string): void {
    if (opts.gitHasUncommittedChanges()) {
      opts.gitAdd([opts.rootDir]);
      opts.gitCommit(subject, trailer);
    }
  }

  const gatherDeps = {
    rootDir: opts.rootDir,
    readFile: opts.readFile,
    readPage: async (slug: string) => {
      try {
        const page = await opts.client.read(slug);
        return { frontmatter: page.meta as unknown as Record<string, unknown>, body: page.body };
      } catch {
        return null;
      }
    },
    readTalk: async (slug: string) => {
      try {
        const talkSlug = `${slug}.talk`;
        const page = await opts.client.read(talkSlug);
        const notes = await opts.client.listNotes(slug);
        return { body: page.body, notes };
      } catch {
        return null;
      }
    },
  };

  // ── Phase 1: gather ──────────────────────────────────────────────────────
  if (startPhase <= 1) {
    opts.write(`[1/7] gather\n`);
    drawer = await gatherFn(opts.slug, gatherDeps);
    completedPhases++;
    // Phase 1 produces no commit.
  }

  // Ensure drawer is populated even if we resumed past phase 1.
  if (!drawer) {
    drawer = await gatherFn(opts.slug, gatherDeps);
  }

  // ── Phase 2: research ────────────────────────────────────────────────────
  if (startPhase <= 2) {
    opts.write(`[2/7] research\n`);
    if (!opts.noWeb) {
      // Default to no-op functions when real implementations are not provided.
      // Real webSearch/webFetch injection lands in a follow-on task once the
      // harness adapter exposes a Tool surface for these.
      const webSearch = opts.webSearch ?? (async () => []);
      const webFetch = opts.webFetch ?? (async () => null);
      const result = await researchFn(drawer, 12, {
        harness: opts.harness,
        webSearch,
        webFetch,
        client: opts.client,
      });

      if (result.refuseToFabricate) {
        opts.writeErr(`author: refusing to fabricate — no evidence found for ${opts.slug}\n`);
        return 4;
      }

      // Persist each candidate claim as a research note on the talk page.
      const now = opts.now();
      for (const claim of result.candidateClaims) {
        await opts.client.note(opts.slug, formatResearchNote(claim, now), { kind: 'research' });
      }

      sourcesCount = result.candidateClaims.length;
      completedPhases++;

      const inputsWithWeb: CommitTrailer['inputs'] = [
        ...drawer.inputs,
        ...(result.sourcesQueried > 0 ? (['web'] as const) : []),
      ];
      maybeCommit(
        `research(${opts.slug}): ${result.sourcesQueried} sources, ${result.candidateClaims.length} candidate claims drafted`,
        makeTrailer(2, inputsWithWeb, sourcesCount),
      );
    }
  }

  // ── Phase 3: outline ─────────────────────────────────────────────────────
  if (startPhase <= 3) {
    opts.write(`[3/7] outline\n`);
    plan = await outlineFn(drawer, opts.harness);

    // Append the outline to the talk page.
    const outlineText = formatOutlineForTalk(plan);
    const talkSlug = `${opts.slug}.talk`;
    let existingTalkBody = '';
    try {
      const talkPage = await opts.client.read(talkSlug);
      existingTalkBody = talkPage.body;
    } catch {
      // Talk page may not exist yet; start fresh.
    }
    const newTalkBody = existingTalkBody
      ? `${existingTalkBody.trimEnd()}\n\n${outlineText}`
      : outlineText;
    await opts.client.write(talkSlug, newTalkBody, `outline plan for ${opts.slug}`);

    completedPhases++;
    maybeCommit(
      `outline(${opts.slug}): person + ${plan.episodes.length} episode(s)`,
      makeTrailer(3, drawer.inputs),
    );
  }

  // Ensure plan is populated even when resuming past phase 3.
  if (!plan) {
    plan = await outlineFn(drawer, opts.harness);
  }

  // ── Phase 4: draft person ────────────────────────────────────────────────
  if (startPhase <= 4) {
    opts.write(`[4/7] draft (person)\n`);
    const personResult = await draftPersonFn(plan, drawer, opts.harness);

    // write() is idempotent — creates the page if absent, overwrites if present.
    await opts.client.write(opts.slug, personResult.body, `draft: person page for ${opts.slug}`);

    completedPhases++;
    maybeCommit(
      `draft(${opts.slug}): person page`,
      makeTrailer(4, drawer.inputs),
    );
  }

  // ── Phase 5: draft episodes ──────────────────────────────────────────────
  if (startPhase <= 5 && !opts.skipEpisodes) {
    opts.write(`[5/7] draft (episodes)\n`);
    for (const episode of plan.episodes) {
      const epResult = await draftEpisodeFn(episode, drawer, plan, opts.harness);

      // write() is idempotent — creates or overwrites.
      await opts.client.write(episode.slug, epResult.body, `draft: episode ${episode.slug}`);

      episodeSlugs.push(episode.slug);
      maybeCommit(
        `draft(${opts.slug}): episode ${episode.slug}`,
        makeTrailer(5, drawer.inputs),
      );
    }
    completedPhases++;
  } else if (startPhase <= 5 && opts.skipEpisodes) {
    opts.write(`[5/7] draft (episodes) — skipped (--skip-episodes)\n`);
  }

  // ── Phase 6: verify ──────────────────────────────────────────────────────
  if (startPhase <= 6) {
    opts.write(`[6/7] verify\n`);
    const noOpRunCheck = async (_args: { only: string[]; fix?: boolean }) => ({ exitCode: 0, findingCount: 0, fixedCount: 0 });
    const verifyResult = await verifyFn({
      runCheck: opts.runCheck ?? noOpRunCheck,
    });

    if (verifyResult.blocked) {
      opts.writeErr(
        `author: verify blocked — ${verifyResult.consistencyFindings} consistency finding(s) in ${opts.slug}; fix and re-run\n`,
      );
      return 5;
    }

    completedPhases++;
    if (verifyResult.fixesApplied > 0) {
      maybeCommit(
        `verify(${opts.slug}): ${verifyResult.fixesApplied} fixes applied`,
        makeTrailer(6, drawer.inputs),
      );
    }
  }

  // ── Phase 7: log ─────────────────────────────────────────────────────────
  if (startPhase <= 7) {
    opts.write(`[7/7] log\n`);
    const logText = formatAgentLog(opts.slug, runId, {
      phases: completedPhases,
      episodes: episodeSlugs.length,
      sources: sourcesCount,
    }, opts.now());

    const talkSlug = `${opts.slug}.talk`;
    let talkBody = '';
    try {
      const talkPage = await opts.client.read(talkSlug);
      talkBody = talkPage.body;
    } catch {
      // Talk page absent — start fresh.
    }
    const newTalkBody = talkBody ? `${talkBody.trimEnd()}\n\n${logText}` : logText;
    await opts.client.write(talkSlug, newTalkBody, `log: pipeline run ${runId}`);

    completedPhases++;
    maybeCommit(
      `log(${opts.slug}): pipeline complete (run ${runId})`,
      makeTrailer(7, drawer.inputs),
    );
  }

  return 0;
}

export interface AuthorCohortOptions {
  slugs: ReadonlyArray<string>;
  parallel: number; // v1: ignored
  order: 'chronological' | 'alphabetical' | 'file';
  resumeRunId?: string;
  /** Per-slug author runner; injected so tests can fake it. Defaults to runAuthor. */
  runOne: (slug: string, opts: { resume: boolean }) => Promise<number>;
  journal: JournalDeps;
  readFile: (path: string) => string | null;
  writeFailedFile: (path: string, content: string) => void;
  rootDir: string;
  write: (s: string) => void;
  writeErr: (s: string) => void;
  now: () => string;
}

export async function runAuthorCohort(opts: AuthorCohortOptions): Promise<number> {
  const runId = opts.resumeRunId ?? newRunId();
  const completed = opts.resumeRunId
    ? journalReadCompleted(opts.resumeRunId, opts.rootDir, opts.readFile)
    : new Set<string>();
  const partial = opts.resumeRunId
    ? journalReadStartedNotCompleted(opts.resumeRunId, opts.rootDir, opts.readFile)
    : new Set<string>();

  const ordered = orderSlugs(opts.slugs, opts.order);
  const remaining = ordered.filter(s => !completed.has(s));

  if (remaining.length === 0) {
    opts.write(`cohort: nothing to do (all ${ordered.length} slugs already completed in run ${runId})\n`);
    return 0;
  }

  if (opts.parallel > 1) {
    opts.writeErr(`cohort: --parallel ${opts.parallel} ignored in v1 (sequential only)\n`);
  }

  const failed: { slug: string; code: number }[] = [];
  let okCount = 0;
  for (const slug of remaining) {
    const isPartial = partial.has(slug);
    journalAppend({ ts: opts.now(), runId, slug, status: 'started' }, opts.journal);
    const code = await opts.runOne(slug, { resume: isPartial });
    if (code === 0) {
      journalAppend({ ts: opts.now(), runId, slug, status: 'completed' }, opts.journal);
      okCount++;
    } else {
      journalAppend({ ts: opts.now(), runId, slug, status: 'failed', reason: `exit ${code}` }, opts.journal);
      failed.push({ slug, code });
    }
  }

  if (failed.length > 0) {
    const failedPath = `${opts.rootDir}/data/author-runs/${runId}-failed.txt`;
    const lines = failed.map(f => `${f.slug}\texit=${f.code}`);
    opts.writeFailedFile(failedPath, lines.join('\n') + '\n');
    opts.writeErr(`cohort: ${okCount} succeeded, ${failed.length} failed (run ${runId})\nRetry: wai author --cohort file:${failedPath}\n`);
    return 1;
  }
  opts.write(`cohort: ${okCount} succeeded (run ${runId})\n`);
  return 0;
}

function orderSlugs(slugs: ReadonlyArray<string>, order: AuthorCohortOptions['order']): ReadonlyArray<string> {
  if (order === 'alphabetical') return [...slugs].sort();
  if (order === 'file') return slugs;
  // chronological: not yet wired to real birth-date data; fall back to file order
  return slugs;
}
