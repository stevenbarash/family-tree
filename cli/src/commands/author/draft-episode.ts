import type { EvidenceDrawer } from './gather.js';
import type { OutlinePlan } from './outline.js';
import type { HarnessAdapter } from '../../harness/types.js';

export async function draftEpisode(
  episode: OutlinePlan['episodes'][number],
  drawer: EvidenceDrawer,
  plan: OutlinePlan,
  harness: HarnessAdapter
): Promise<{ body: string; redlinks: ReadonlyArray<string> }> {
  const res = await harness.invoke<unknown, { body: string; redlinks?: string[] }>({
    skill: 'writing-articles',
    template: 'draft-episode',
    context: { episode, drawer, plan },
    outputSchema: {
      type: 'object',
      required: ['body'],
      properties: {
        body: { type: 'string' },
        redlinks: { type: 'array' },
      },
    },
  });
  if (!res.ok) {
    throw new Error(`draft-episode: harness failed for ${episode.slug} — ${res.error}`);
  }
  return { body: res.result.body, redlinks: res.result.redlinks ?? [] };
}
