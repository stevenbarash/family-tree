import type { EvidenceDrawer } from './gather.js';
import type { OutlinePlan } from './outline.js';
import type { HarnessAdapter } from '../../harness/types.js';

export async function draftPerson(
  plan: OutlinePlan,
  drawer: EvidenceDrawer,
  harness: HarnessAdapter
): Promise<{ body: string; redlinks: ReadonlyArray<string> }> {
  const res = await harness.invoke<unknown, { body: string; redlinks?: string[] }>({
    skill: 'writing-articles',
    template: 'draft-person',
    context: { slug: drawer.slug, plan, drawer },
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
    throw new Error(`draft-person: harness failed — ${res.error}`);
  }
  return { body: res.result.body, redlinks: res.result.redlinks ?? [] };
}
