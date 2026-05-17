// Pure scan for ambiguous slash dates (m/d/y vs d/m/y when both fields ≤ 12).
//
// The same detection logic powers the format-drift detector's "skip" branch
// (we never auto-rewrite an ambiguous slash date) and the infobox `?` glyph
// (we render a tooltip rather than guess). This module is the third use:
// give the user one CLI report that lists every place a future slash date
// would land, so they can disambiguate at the GEDCOM source before the bad
// interpretation propagates into derived records or article prose.
//
// Pure. Takes a (filename, text) pair, returns the findings. The CLI is the
// boundary that walks the filesystem.

import { findDatesInLine, normalizeDate } from '../format/dates.js';

export interface AmbiguousDateHit {
  file: string;
  line: number;       // 1-indexed
  column: number;     // 1-indexed
  text: string;       // e.g. "9/7/1997"
  context: string;    // full source line, trimmed
}

export function scanForAmbiguousDates(file: string, text: string): AmbiguousDateHit[] {
  const hits: AmbiguousDateHit[] = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const hit of findDatesInLine(line)) {
      // Only slash-form dates can be ambiguous in the m/d vs d/m sense.
      if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(hit.text)) continue;
      const result = normalizeDate(hit.text);
      if (!result.ambiguous) continue;
      hits.push({
        file,
        line: i + 1,
        column: hit.start + 1,
        text: hit.text,
        context: line.trim(),
      });
    }
  });
  return hits;
}
