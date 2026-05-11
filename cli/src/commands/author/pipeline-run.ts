import { randomUUID } from 'node:crypto';

export interface CommitTrailer {
  pipelineRun: string;
  phase: number;
  slug: string;
  inputs: ReadonlyArray<'derived' | 'talk' | 'narrative' | 'audio' | 'web'>;
  sources?: number;
  fabricationGuard: 'pass' | 'fail';
}

export function newRunId(): string {
  return randomUUID();
}

export const PHASE = {
  gather: 1,
  research: 2,
  outline: 3,
  draftPerson: 4,
  draftEpisode: 5,
  verify: 6,
  log: 7,
} as const;

export type PhaseNumber = typeof PHASE[keyof typeof PHASE];

export const TOTAL_PHASES = 7;

export function phaseNumberToName(n: number): string {
  switch (n) {
    case 1: return 'gather';
    case 2: return 'research';
    case 3: return 'outline';
    case 4: return 'draft';
    case 5: return 'draft-ep';
    case 6: return 'verify';
    case 7: return 'log';
    default: return `phase-${n}`;
  }
}

export function formatTrailer(t: CommitTrailer): string {
  const lines = [
    `pipeline-run: ${t.pipelineRun}`,
    `phase: ${t.phase}`,
    `slug: ${t.slug}`,
    `inputs: ${t.inputs.join(',')}`,
  ];
  if (t.sources !== undefined) lines.push(`sources: ${t.sources}`);
  lines.push(`fabrication-guard: ${t.fabricationGuard}`);
  return lines.join('\n');
}

export function parseLatestTrailer(gitLogText: string): CommitTrailer | null {
  const m = gitLogText.match(/^pipeline-run:\s+(\S+)\nphase:\s+(\d+)\nslug:\s+(\S+)\ninputs:\s+(\S+)(?:\nsources:\s+(\d+))?\nfabrication-guard:\s+(pass|fail)/m);
  if (!m) return null;
  return {
    pipelineRun: m[1]!,
    phase: parseInt(m[2]!, 10),
    slug: m[3]!,
    inputs: m[4]!.split(',') as CommitTrailer['inputs'],
    sources: m[5] !== undefined ? parseInt(m[5], 10) : undefined,
    fabricationGuard: m[6] as 'pass' | 'fail',
  };
}

export function findResumePoint(gitLogText: string, slug: string): { runId: string; nextPhase: number } | null {
  const lines = gitLogText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]?.startsWith('pipeline-run:')) continue;
    // Take up to 6 lines (5 required fields + optional sources); slice is safe on short arrays.
    const block = lines.slice(i, i + 6).join('\n');
    const t = parseLatestTrailer(block);
    if (t && t.slug === slug) {
      return { runId: t.pipelineRun, nextPhase: t.phase + 1 };
    }
  }
  return null;
}
