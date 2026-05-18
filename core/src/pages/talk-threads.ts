/**
 * Pure parser for editorial threads in a talk-page body.
 *
 * A thread is a level-2 or level-3 heading whose next non-blank line
 * is one of the admonition markers `::open`, `::closed`,
 * `::superseded`, `::gap`. The body extends from after the marker
 * through to the next `##` or `###` heading (or end of file).
 * Headings without a marker (e.g. `## Research notes`, `## Drafting
 * plan`, `## Agent log`) are not threads and are skipped — the marker
 * is what identifies an editorial thread, so no allowlist of reserved
 * headings is needed.
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
      if (/^#{1,3} /.test(lines[k]!)) { bodyEnd = k; break; }
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
