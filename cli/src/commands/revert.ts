/**
 * wai revert — Friendly wrapper over git revert filtered by pipeline-run trailer.
 *
 * Modes:
 *   slug-latest   Undo the most recent pipeline run for a slug.
 *   slug-run      Undo a specific run (by UUID).
 *   slug-phase    Undo just one phase's commit(s) from the most recent run.
 *   last          Undo most recent pipeline activity across any slug.
 *   list          Print a table of runs for a slug; no revert.
 *
 * Phase name → number mapping (from pipeline-run.ts):
 *   2 = research
 *   3 = outline
 *   4 = draft (person hub)
 *   5 = draft (episode pages)
 *   6 = verify
 *   7 = log
 *
 * "draft" matches both 4 and 5.
 */

import { phaseNumberToName } from './author/pipeline-run.js';

export type RevertMode =
  | { kind: 'slug-latest'; slug: string }
  | { kind: 'slug-run'; slug: string; runId: string }
  | { kind: 'slug-phase'; slug: string; phase: string }
  | { kind: 'last' }
  | { kind: 'list'; slug: string };

export interface RevertDeps {
  rootDir: string;
  /**
   * Returns formatted git log: each commit as "<sha>\n<subject>\n<body>\n---\n".
   * Caller decides the --format and args; this just executes git log.
   */
  gitLog: (rootDir: string, args: string[]) => string;
  /**
   * Apply `git revert --no-commit <shas...>` then commit with the given message.
   */
  gitRevert: (rootDir: string, shas: ReadonlyArray<string>, message: string) => void;
  dryRun: boolean;
  write: (s: string) => void;
  writeErr: (s: string) => void;
}

export interface LogBlock {
  sha: string;
  subject: string;
  runId: string;
  phase: number;
  slug: string;
}

/**
 * Parse git log output where each entry is separated by "---".
 * Each block has the format:
 *   <sha>
 *   <subject>
 *   <body with trailer lines>
 *   ---
 */
export function parseLogBlocks(text: string): LogBlock[] {
  const results: LogBlock[] = [];
  const blocks = text.split(/\n?---\n?/);
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;
    const sha = lines[0]!.trim();
    const subject = lines[1]!.trim();
    if (!sha || !subject) continue;

    // Parse trailer lines from the body (lines 2+)
    const body = lines.slice(2).join('\n');
    const runIdM = body.match(/^pipeline-run:\s+(\S+)/m);
    const phaseM = body.match(/^phase:\s+(\d+)/m);
    const slugM = body.match(/^slug:\s+(\S+)/m);

    if (!runIdM || !phaseM || !slugM) continue;

    results.push({
      sha,
      subject,
      runId: runIdM[1]!,
      phase: parseInt(phaseM[1]!, 10),
      slug: slugM[1]!,
    });
  }
  return results;
}

/** Map a phase name string to the phase number(s) it represents. */
function phaseNameToNumbers(name: string): number[] {
  switch (name.toLowerCase()) {
    case 'research': return [2];
    case 'outline':  return [3];
    case 'draft':    return [4, 5];
    case 'verify':   return [6];
    case 'log':      return [7];
    default:         return [];
  }
}

export async function runRevert(mode: RevertMode, deps: RevertDeps): Promise<number> {
  const { rootDir, gitLog, gitRevert, dryRun, write, writeErr } = deps;

  // Fetch the full pipeline-run log.
  const logText = gitLog(rootDir, [
    '--all',
    '--format=%H%n%s%n%b%n---',
    '--grep=pipeline-run:',
  ]);

  const blocks = parseLogBlocks(logText);

  if (mode.kind === 'list') {
    return doList(mode.slug, blocks, write);
  }

  if (mode.kind === 'last') {
    return doLast(blocks, { rootDir, gitRevert, dryRun, write, writeErr });
  }

  if (mode.kind === 'slug-latest') {
    return doSlugLatest(mode.slug, blocks, { rootDir, gitRevert, dryRun, write, writeErr });
  }

  if (mode.kind === 'slug-run') {
    return doSlugRun(mode.slug, mode.runId, blocks, { rootDir, gitRevert, dryRun, write, writeErr });
  }

  if (mode.kind === 'slug-phase') {
    return doSlugPhase(mode.slug, mode.phase, blocks, { rootDir, gitRevert, dryRun, write, writeErr });
  }

  writeErr(`revert: unknown mode\n`);
  return 2;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function blocksForSlug(slug: string, blocks: LogBlock[]): LogBlock[] {
  return blocks.filter(b => b.slug === slug);
}

function latestRunId(filtered: LogBlock[]): string | null {
  // blocks are newest-first from git log
  return filtered.length > 0 ? filtered[0]!.runId : null;
}

interface ActionDeps {
  rootDir: string;
  gitRevert: (rootDir: string, shas: ReadonlyArray<string>, message: string) => void;
  dryRun: boolean;
  write: (s: string) => void;
  writeErr: (s: string) => void;
}

function applyRevert(
  shas: string[],
  message: string,
  deps: ActionDeps,
): number {
  if (shas.length === 0) {
    deps.writeErr(`revert: no commits matched\n`);
    return 2;
  }
  if (deps.dryRun) {
    deps.write(`would revert ${shas.length} commit${shas.length === 1 ? '' : 's'}: ${shas.join(' ')}\n`);
    deps.write(`would commit: ${message}\n`);
    return 0;
  }
  deps.gitRevert(deps.rootDir, shas, message);
  deps.write(`reverted ${shas.length} commit${shas.length === 1 ? '' : 's'}: ${message}\n`);
  return 0;
}

function doSlugLatest(slug: string, blocks: LogBlock[], deps: ActionDeps): number {
  const slugBlocks = blocksForSlug(slug, blocks);
  const runId = latestRunId(slugBlocks);
  if (!runId) {
    deps.writeErr(`revert: no pipeline runs found for slug '${slug}'\n`);
    return 2;
  }
  const toRevert = slugBlocks.filter(b => b.runId === runId);
  // Newest-first order so revert undoes in the correct sequence
  const shas = toRevert.map(b => b.sha);
  return applyRevert(shas, `revert(${slug}): pipeline-run ${runId}`, deps);
}

function doSlugRun(slug: string, runId: string, blocks: LogBlock[], deps: ActionDeps): number {
  const slugBlocks = blocksForSlug(slug, blocks);
  const toRevert = slugBlocks.filter(b => b.runId === runId);
  if (toRevert.length === 0) {
    deps.writeErr(`revert: no commits found for slug '${slug}' run '${runId}'\n`);
    return 2;
  }
  const shas = toRevert.map(b => b.sha);
  return applyRevert(shas, `revert(${slug}): pipeline-run ${runId}`, deps);
}

function doSlugPhase(slug: string, phaseName: string, blocks: LogBlock[], deps: ActionDeps): number {
  const phaseNums = phaseNameToNumbers(phaseName);
  if (phaseNums.length === 0) {
    deps.writeErr(`revert: unknown phase '${phaseName}'; valid: research|outline|draft|verify|log\n`);
    return 2;
  }

  const slugBlocks = blocksForSlug(slug, blocks);
  const runId = latestRunId(slugBlocks);
  if (!runId) {
    deps.writeErr(`revert: no pipeline runs found for slug '${slug}'\n`);
    return 2;
  }

  const toRevert = slugBlocks.filter(b => b.runId === runId && phaseNums.includes(b.phase));
  if (toRevert.length === 0) {
    deps.writeErr(`revert: no commits found for slug '${slug}' phase '${phaseName}' in run '${runId}'\n`);
    return 2;
  }

  const shas = toRevert.map(b => b.sha);
  const trailer = `pipeline-run: ${runId}`;
  return applyRevert(shas, `revert(${slug}): ${phaseName} [${trailer}]`, deps);
}

function doLast(blocks: LogBlock[], deps: ActionDeps): number {
  if (blocks.length === 0) {
    deps.writeErr(`revert: no pipeline runs found\n`);
    return 2;
  }
  // Most recent pipeline run across any slug
  const runId = blocks[0]!.runId;
  const toRevert = blocks.filter(b => b.runId === runId);

  const slugs = [...new Set(toRevert.map(b => b.slug))];
  const message = slugs.length === 1
    ? `revert(${slugs[0]}): pipeline-run ${runId}`
    : `revert(cohort): pipeline-run ${runId}`;

  const shas = toRevert.map(b => b.sha);
  return applyRevert(shas, message, deps);
}

function doList(slug: string, blocks: LogBlock[], write: (s: string) => void): number {
  const slugBlocks = blocksForSlug(slug, blocks);
  if (slugBlocks.length === 0) {
    write(`no pipeline runs found for slug '${slug}'\n`);
    return 0;
  }

  // Group by runId (preserving first-seen order, which is newest-first)
  const runOrder: string[] = [];
  const byRun = new Map<string, LogBlock[]>();
  for (const b of slugBlocks) {
    if (!byRun.has(b.runId)) {
      runOrder.push(b.runId);
      byRun.set(b.runId, []);
    }
    byRun.get(b.runId)!.push(b);
  }

  write(`Pipeline runs for ${slug}:\n`);
  for (const runId of runOrder) {
    const commits = byRun.get(runId)!;
    const phaseNames = commits.map(b => phaseNumberToName(b.phase)).join(', ');
    write(`  ${runId}  phases: ${phaseNames}  (${commits.length} commit${commits.length === 1 ? '' : 's'})\n`);
  }
  return 0;
}

