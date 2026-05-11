import type { EvidenceDrawer } from './gather.js';
import type { HarnessAdapter } from '../../harness/types.js';

export interface OutlinePlan {
  person: {
    lead: string;
    sections: ReadonlyArray<{ heading: string; gist: string }>;
  };
  episodes: ReadonlyArray<{ slug: string; title: string; scope: string }>;
}

export async function outline(drawer: EvidenceDrawer, harness: HarnessAdapter): Promise<OutlinePlan> {
  const res = await harness.invoke<unknown, OutlinePlan>({
    skill: 'writing-articles',
    template: 'outline',
    context: { slug: drawer.slug, drawer },
    outputSchema: {
      type: 'object',
      required: ['person', 'episodes'],
      properties: {
        person: { type: 'object', required: ['lead', 'sections'] },
        episodes: { type: 'array' },
      },
    },
  });
  if (!res.ok) {
    throw new Error(`outline: harness failed — ${res.error}`);
  }
  return res.result;
}

export function formatOutlineForTalk(plan: OutlinePlan): string {
  const lines: string[] = [];
  lines.push('## Drafting plan');
  lines.push('');
  lines.push('**Person hub**');
  lines.push('');
  lines.push(`Lead: ${plan.person.lead}`);
  lines.push('');
  lines.push('Sections:');
  for (const s of plan.person.sections) {
    lines.push(`- ${s.heading}: ${s.gist}`);
  }
  lines.push('');
  if (plan.episodes.length > 0) {
    lines.push('**Episode spinoffs**');
    lines.push('');
    for (const e of plan.episodes) {
      lines.push(`- [[${e.slug}|${e.title}]]: ${e.scope}`);
    }
  } else {
    lines.push('**Episode spinoffs**: none');
  }
  return lines.join('\n');
}
