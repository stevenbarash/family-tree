import type { PageMetaSummary } from '@core/pages/index.ts';
import type { DerivedRecord } from '@core/gedcom/types.ts';
import { parseGedcomYear } from '@core/family/dates.ts';

const MAX_LEAD = 160;

/**
 * Pull the first prose-like line from a page body, suitable as a one-line
 * lead in a hover-card preview. Skips frontmatter, fenced code, headings,
 * directive blocks (`:::name … :::`), and blank lines. Strips inline
 * markdown markup (bold/italic, wikilinks, regular links). Truncates to
 * MAX_LEAD chars with an ellipsis. Returns null when nothing prose-like
 * exists.
 */
export function extractLeadSentence(body: string): string | null {
  const lines = body.split('\n');
  let i = 0;
  // Skip opening frontmatter, if present.
  if (lines[0]?.trim() === '---') {
    i = 1;
    while (i < lines.length && lines[i]!.trim() !== '---') i++;
    if (i < lines.length) i++; // step past closing ---
  }
  let inCode = false;
  let inDirective = false;
  for (; i < lines.length; i++) {
    const raw = lines[i]!;
    const t = raw.trim();
    if (t === '') continue;
    if (t.startsWith('```')) { inCode = !inCode; continue; }
    if (inCode) continue;
    if (t.startsWith(':::')) {
      // Bare `:::` closes; anything else opens (single-line directives
      // also use `:::name{…}` — for v1, skip until the next `:::`).
      if (t === ':::') inDirective = false;
      else inDirective = true;
      continue;
    }
    if (inDirective) continue;
    if (t.startsWith('#')) continue; // headings
    if (t.startsWith('|')) continue; // table rows
    // Lead found — strip list marker if present, then markup, then truncate.
    const noBullet = t.replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, '');
    const clean = stripInlineMarkup(noBullet);
    if (!clean) continue;
    return clean.length > MAX_LEAD ? `${clean.slice(0, MAX_LEAD)}…` : clean;
  }
  return null;
}

export interface HoverCardData {
  title: string;
  /** One-line prose preview; null if no body is available for the slug. */
  lead: string | null;
  /** Portrait filename relative to `/portraits/`, if the page has one. */
  portrait?: string;
  /** Birth year as a string, e.g. "1880". Omitted when unknown. */
  born?: string;
  /** Death year as a string. Omitted when unknown or person is living. */
  died?: string;
}

/**
 * Build the precomputed hover-card map keyed by wiki slug. The map is
 * threaded into `renderMarkdown` so the renderer can swap any matched
 * internal anchor for a `<WikilinkHoverCard>` without a client-side fetch.
 *
 * Skips talk and archived pages — they're not link targets in practice and
 * shouldn't preview alongside live pages.
 *
 * @param list Live page summaries from `getCachedList().list`.
 * @param derivedByRecord Cached derived-records map (from `getCachedDerivedRecords()`).
 * @param bodiesBySlug Pre-read page bodies, slug → markdown body. Caller decides
 *   the scope (typically just the pages linked from the current page; fetching
 *   every page body is too expensive for the request path).
 */
export function buildHoverDataBySlug(
  list: ReadonlyArray<PageMetaSummary>,
  derivedByRecord: ReadonlyMap<string, DerivedRecord>,
  bodiesBySlug: ReadonlyMap<string, string>,
): Map<string, HoverCardData> {
  const out = new Map<string, HoverCardData>();
  for (const p of list) {
    if (p.isTalk || p.isArchived) continue;
    const body = bodiesBySlug.get(p.slug);
    const lead = body ? extractLeadSentence(body) : null;
    const card: HoverCardData = { title: p.title, lead };
    if (p.portrait) card.portrait = p.portrait;
    if (p.gedcomRecord) {
      const d = derivedByRecord.get(p.gedcomRecord);
      const birthYear = parseGedcomYear(d?.birth?.date ?? null);
      const deathYear = parseGedcomYear(d?.death?.date ?? null);
      if (birthYear) card.born = String(birthYear.year);
      if (deathYear) card.died = String(deathYear.year);
    }
    out.set(p.slug, card);
  }
  return out;
}

function stripInlineMarkup(s: string): string {
  return s
    // Wikilinks: `[[Target|Label]]` → `Label`; `[[Target]]` → `Target`
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    // Regular links: `[text](url)` → `text`
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Bold/italic/code spans
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    // Collapse leftover whitespace
    .replace(/\s+/g, ' ')
    .trim();
}
