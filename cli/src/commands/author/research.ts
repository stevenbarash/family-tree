import type { EvidenceDrawer } from './gather.js';
import type { HarnessAdapter } from '../../harness/types.js';
import type { ApiClient } from '../../api-client.js';

export interface ResearchDeps {
  harness: HarnessAdapter;
  client: ApiClient;
}

export interface ResearchResult {
  candidateClaims: ReadonlyArray<{ text: string; url: string; gap: string }>;
  sourcesQueried: number;
  refuseToFabricate: boolean;
}

export async function research(drawer: EvidenceDrawer, maxClaims: number, deps: ResearchDeps): Promise<ResearchResult> {
  const harnessRes = await deps.harness.invoke<unknown, { claims: { text: string; url: string; gap: string }[]; refuseToFabricate?: boolean }>({
    skill: 'writing-articles',
    template: 'research-questions',
    context: { slug: drawer.slug, drawer, maxClaims },
    outputSchema: {
      type: 'object',
      required: ['claims'],
      properties: { claims: { type: 'array' } },
    },
  });
  if (!harnessRes.ok) {
    throw new Error(`research: harness failed — ${harnessRes.error}`);
  }
  const claims = harnessRes.result.claims.slice(0, maxClaims);
  const refuseToFabricate = harnessRes.result.refuseToFabricate
    ?? (claims.length === 0
      && drawer.derived === null
      && drawer.researchNotes.length === 0
      && drawer.narrativeBody === null
      && drawer.transcripts.length === 0);
  return {
    candidateClaims: claims,
    sourcesQueried: claims.length,
    refuseToFabricate,
  };
}

export function formatResearchNote(claim: { text: string; url: string; gap: string }, accessedAt: string): string {
  return `${claim.text}\n\nGap: ${claim.gap}\n\nSource: ${claim.url} (accessed ${accessedAt})`;
}
