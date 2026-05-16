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
