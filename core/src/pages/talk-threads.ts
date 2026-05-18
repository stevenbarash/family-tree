/**
 * Pure parser for editorial threads in a talk-page body.
 *
 * A thread is a level-2 or level-3 heading whose next non-blank line
 * is one of the admonition markers `::open`, `::closed`,
 * `::superseded`, `::gap`. The body extends from after the marker
 * through to the next "thread boundary" (or end of file). Thread
 * boundaries are: any `##` heading (always — h2 is reserved for
 * section-level structure), and any `### ` heading that is itself
 * followed by a marker (= a sibling thread). A `### Subheading`
 * with prose under it is *structural* — part of the current thread,
 * NOT a boundary; many real threads use ### for internal sections
 * like "Resolution paths" or "What the record adds".
 * Headings without a marker (e.g. `## Research notes`, `## Drafting
 * plan`, `## Agent log`) are not threads and are skipped.
 */

export type ThreadMarker = 'open' | 'closed' | 'superseded' | 'gap';

export interface TalkThread {
  /** Heading level — 2 (##) or 3 (###). */
  level: 2 | 3;
  /** Heading text, leading `##`/`###` and surrounding whitespace stripped. */
  heading: string;
  marker: ThreadMarker;
  /** Markdown body content, leading/trailing blank lines trimmed. */
  body: string;
}

const HEADING_RE = /^(#{2,3}) (.+?)\s*$/;
const MARKER_RE = /^::(open|closed|superseded|gap)\b/;

export function parseTalkThreads(talkBody: string): TalkThread[] {
  const lines = talkBody.split('\n');
  const out: TalkThread[] = [];

  let i = 0;
  while (i < lines.length) {
    const h = HEADING_RE.exec(lines[i]!);
    if (!h) { i++; continue; }

    const level = h[1]!.length as 2 | 3;
    const heading = h[2]!;

    let j = i + 1;
    while (j < lines.length && lines[j]! === '') j++;

    const m = j < lines.length ? MARKER_RE.exec(lines[j]!) : null;
    if (!m) { i++; continue; }
    const marker = m[1] as ThreadMarker;

    const bodyStart = j + 1;
    let bodyEnd = lines.length;
    for (let k = bodyStart; k < lines.length; k++) {
      const ln = lines[k]!;
      if (/^#{1,2} /.test(ln)) { bodyEnd = k; break; }
      if (/^### /.test(ln)) {
        // h3 is only a boundary when it's a sibling thread — look ahead
        // for a marker on its next non-blank line. Otherwise treat as a
        // structural subheading inside the current thread body.
        let p = k + 1;
        while (p < lines.length && lines[p]! === '') p++;
        if (p < lines.length && MARKER_RE.test(lines[p]!)) { bodyEnd = k; break; }
      }
    }
    const body = lines.slice(bodyStart, bodyEnd).join('\n').trim();

    out.push({ level, heading, marker, body });
    i = bodyEnd;
  }

  return out;
}

/** Number of `::open` (and `::gap`) threads — the unresolved-editorial count. */
export function countOpenThreads(talkBody: string): number {
  return parseTalkThreads(talkBody).filter(t => t.marker === 'open' || t.marker === 'gap').length;
}

export interface OpenGapsRow {
  slug: string;
  title: string;
  count: number;
}

/**
 * Aggregate unresolved-thread counts across many talk pages and return
 * the top `limit` rows, sorted by count descending then slug ascending.
 * Rows with zero open threads are omitted. Empty `talkBody` is treated
 * as zero (no allocation, no parse).
 */
export function aggregateOpenGaps(
  pages: ReadonlyArray<{ slug: string; title: string; talkBody: string }>,
  limit: number,
): OpenGapsRow[] {
  if (limit <= 0) return [];
  const rows: OpenGapsRow[] = [];
  for (const p of pages) {
    if (!p.talkBody) continue;
    const count = countOpenThreads(p.talkBody);
    if (count > 0) rows.push({ slug: p.slug, title: p.title, count });
  }
  rows.sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
  return rows.slice(0, limit);
}
