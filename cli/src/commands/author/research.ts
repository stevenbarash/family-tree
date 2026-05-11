import type { EvidenceDrawer } from './gather.js';
import type { HarnessAdapter } from '../../harness/types.js';
import type { ApiClient } from '../../api-client.js';

const RELIABLE_HOSTS = [
  'yadvashem.org',
  'collections.yadvashem.org',
  'jewishgen.org',
  'archive.org',
  'web.archive.org',
  'familysearch.org',
  'ancestry.com',
  '.edu',
  '.gov',
];

export interface ResearchDeps {
  harness: HarnessAdapter;
  webSearch: (query: string) => Promise<ReadonlyArray<{ title: string; url: string; snippet: string }>>;
  webFetch: (url: string) => Promise<string | null>;
  client: ApiClient;
  isReliableSource?: (url: string) => boolean;
}

export interface ResearchResult {
  candidateClaims: ReadonlyArray<{ text: string; url: string; gap: string }>;
  unreliableDropped: number;
  sourcesQueried: number;
  refuseToFabricate: boolean;
}

export async function research(drawer: EvidenceDrawer, maxQueries: number, deps: ResearchDeps): Promise<ResearchResult> {
  const isReliable = deps.isReliableSource ?? defaultIsReliable;
  const harnessRes = await deps.harness.invoke<unknown, { queries: { text: string; gap: string }[] }>({
    skill: 'writing-articles',
    template: 'research-questions',
    context: { slug: drawer.slug, drawer, maxQueries },
    outputSchema: {
      type: 'object',
      required: ['queries'],
      properties: { queries: { type: 'array' } },
    },
  });
  if (!harnessRes.ok) {
    throw new Error(`research: harness failed — ${harnessRes.error}`);
  }
  const queries = harnessRes.result.queries.slice(0, maxQueries);

  const candidates: { text: string; url: string; gap: string }[] = [];
  let dropped = 0;
  for (const q of queries) {
    const results = await deps.webSearch(q.text);
    for (const r of results) {
      if (!isReliable(r.url)) {
        dropped++;
        continue;
      }
      const fetched = await deps.webFetch(r.url);
      if (!fetched) {
        dropped++;
        continue;
      }
      const claim = q.gap; // v1: claim text is the gap description; richer claim extraction lands later
      candidates.push({ text: claim, url: r.url, gap: q.gap });
    }
  }

  const refuseToFabricate = candidates.length === 0
    && drawer.derived === null
    && drawer.researchNotes.length === 0
    && drawer.narrativeBody === null
    && drawer.transcripts.length === 0;

  return {
    candidateClaims: candidates,
    unreliableDropped: dropped,
    sourcesQueried: queries.length,
    refuseToFabricate,
  };
}

function defaultIsReliable(url: string): boolean {
  try {
    const u = new URL(url);
    return RELIABLE_HOSTS.some(h => u.hostname.endsWith(h.replace(/^\./, '')) || u.hostname.includes(h));
  } catch {
    return false;
  }
}

export function formatResearchNote(claim: { text: string; url: string; gap: string }, accessedAt: string): string {
  return `${claim.text}\n\nGap: ${claim.gap}\n\nSource: ${claim.url} (accessed ${accessedAt})`;
}
