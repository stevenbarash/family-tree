/**
 * wai history — Render the pipeline-relevant commit log for a page.
 *
 * Modes:
 *   history <slug>             Table of pipeline commits for that slug
 *   history <slug> --json      JSON output
 *   history <slug> --no-pipeline  Only commits without pipeline-run trailer
 *   history --recent [N]       Last N pipeline commits across all slugs
 *
 * Phase name → number mapping (from revert.ts):
 *   2 = research
 *   3 = outline
 *   4 = draft (person hub)
 *   5 = draft (episode pages)
 *   6 = verify
 *   7 = log
 */

import { parseLogBlocks, type LogBlock } from './revert.js';

export interface HistoryOptions {
  rootDir: string;
  slug?: string;
  format: 'table' | 'json';
  filter: 'pipeline-only' | 'no-pipeline';
  recent?: number;
  gitLog: (rootDir: string, args: string[]) => string;
  write: (s: string) => void;
  writeErr: (s: string) => void;
}

export interface HistoryCommit {
  sha: string;
  subject: string;
  runId: string | null;
  phase: number | null;
  slug: string | null;
}

/**
 * Parse git log output to include both pipeline and non-pipeline commits.
 * Returns commits with runId, phase, slug optionally null for non-pipeline commits.
 */
export function parseLogBlocksForHistory(text: string): HistoryCommit[] {
  const results: HistoryCommit[] = [];
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

    results.push({
      sha,
      subject,
      runId: runIdM ? runIdM[1]! : null,
      phase: phaseM ? parseInt(phaseM[1]!, 10) : null,
      slug: slugM ? slugM[1]! : null,
    });
  }
  return results;
}

export async function runHistory(opts: HistoryOptions): Promise<number> {
  if (!opts.slug && !opts.recent) {
    opts.writeErr('history: provide a slug or --recent\n');
    return 2;
  }

  const args = ['--all', '--format=%H%n%s%n%b%n---'];
  if (opts.slug) args.push(`--grep=slug: ${opts.slug}`);
  if (opts.recent) args.push(`-n ${opts.recent}`);

  const text = opts.gitLog(opts.rootDir, args);
  const commits = parseLogBlocksForHistory(text);

  const filtered = opts.filter === 'no-pipeline'
    ? commits.filter(c => c.runId === null)
    : commits.filter(c => c.runId !== null);

  if (opts.format === 'json') {
    opts.write(JSON.stringify(filtered, null, 2) + '\n');
    return 0;
  }

  opts.write(renderTable(filtered) + '\n');
  return 0;
}

function renderTable(commits: ReadonlyArray<HistoryCommit>): string {
  if (commits.length === 0) return '(no commits)';
  const rows = ['SHA       Run     Phase     Slug                 Subject'];
  for (const c of commits) {
    const sha = c.sha.slice(0, 7);
    const run = c.runId ? c.runId.slice(0, 6) : '------';
    const phase = c.phase !== null ? phaseName(c.phase).padEnd(8) : '(none)  ';
    const slug = (c.slug ?? '-').padEnd(20).slice(0, 20);
    rows.push(`${sha}  ${run}  ${phase}  ${slug} ${c.subject}`);
  }
  return rows.join('\n');
}

function phaseName(n: number): string {
  switch (n) {
    case 2: return 'research';
    case 3: return 'outline';
    case 4: return 'draft';
    case 5: return 'draft-ep';
    case 6: return 'verify';
    case 7: return 'log';
    default: return `phase-${n}`;
  }
}
