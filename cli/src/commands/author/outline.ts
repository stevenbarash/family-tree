import type { EvidenceDrawer } from './gather.js';
import type { HarnessAdapter } from '../../harness/types.js';

export interface OutlinePlan {
  person: {
    lead: string;
    sections: ReadonlyArray<{ heading: string; gist: string }>;
  };
  episodes: ReadonlyArray<{ slug: string; title: string; scope: string }>;
  chronology?: ReadonlyArray<{ date: string; event: string; source: string }>;
  silences?: ReadonlyArray<string>;
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
        chronology: { type: 'array' },
        silences: { type: 'array' },
      },
    },
  });
  if (!res.ok) {
    throw new Error(`outline: harness failed — ${res.error}`);
  }
  return res.result;
}

/**
 * Splice a freshly-generated outline into the talk-page body. If the body
 * already contains a `## Drafting plan` section, that section is replaced
 * in place — preventing duplicate plans when Phase 3 runs more than once
 * (which previously happened on `wai author <slug>` retries before
 * `--resume` was always used, and which left two near-identical plans in
 * the boris-ayzman talk page that had to be cleaned up by hand in this
 * session). If there is no prior plan, the new one is appended.
 *
 * The drafting-plan section extends from `## Drafting plan` up to (but
 * not including) the next `## ` heading, or to end-of-body if none.
 * Anything before the section is preserved; anything after the section
 * (a later Agent log, talk-page open threads added by the user, etc.)
 * is preserved too.
 */
export function replaceOrAppendOutline(existingBody: string, outlineText: string): string {
  const marker = '## Drafting plan';
  // Anchor to a line start so a literal "## Drafting plan" inside a research
  // note paragraph or fenced code block isn't matched as the section header
  // (the next-heading scan below already line-anchors via `\n## `; without
  // anchoring here the start could land mid-prose and the splice would
  // corrupt the talk body).
  const start = findSectionStart(existingBody, marker);
  if (start === -1) {
    const trimmed = existingBody.trim();
    return trimmed ? `${existingBody.trimEnd()}\n\n${outlineText}` : outlineText;
  }
  // Find the next `## ` heading after the marker. Use `\n## ` so we don't
  // match a `## ` that occurs mid-line (e.g., inside a code fence) — the
  // section boundary is always at the start of a line.
  const tailSearch = existingBody.indexOf('\n## ', start + marker.length);
  const before = existingBody.slice(0, start).trimEnd();
  const after = tailSearch === -1 ? '' : existingBody.slice(tailSearch + 1);
  const parts: string[] = [];
  if (before) parts.push(before);
  parts.push(outlineText);
  if (after) parts.push(after);
  return parts.join('\n\n');
}

function findSectionStart(body: string, marker: string): number {
  const lines = body.split('\n');
  let inCode = false;
  let pos = 0;
  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      inCode = !inCode;
      pos += line.length + 1;
      continue;
    }
    if (!inCode && line.startsWith(marker)) return pos;
    pos += line.length + 1;
  }
  return -1;
}

export function formatOutlineForTalk(plan: OutlinePlan): string {
  const lines: string[] = [];
  lines.push('## Drafting plan');
  lines.push('');
  if (plan.chronology && plan.chronology.length > 0) {
    lines.push('**Chronology**');
    lines.push('');
    for (const c of plan.chronology) {
      lines.push(`- ${c.date}: ${c.event} (${c.source})`);
    }
    lines.push('');
  }
  if (plan.silences && plan.silences.length > 0) {
    lines.push('**Silences**');
    lines.push('');
    for (const s of plan.silences) {
      lines.push(`- ${s}`);
    }
    lines.push('');
  }
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
