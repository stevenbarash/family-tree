const MONTHS_LONG: Record<string, string> = {
  january: 'Jan', february: 'Feb', march: 'Mar', april: 'Apr',
  may: 'May', june: 'Jun', july: 'Jul', august: 'Aug',
  september: 'Sep', october: 'Oct', november: 'Nov', december: 'Dec',
};
const MONTHS_SHORT = new Set(Object.values(MONTHS_LONG));

function titleCaseMonth(m: string): string | null {
  const lower = m.toLowerCase();
  if (MONTHS_LONG[lower]) return MONTHS_LONG[lower]!;
  const titled = lower[0]!.toUpperCase() + lower.slice(1);
  if (MONTHS_SHORT.has(titled)) return titled;
  return null;
}

export interface NormalizeResult {
  value: string;
  changed: boolean;
  ambiguous?: boolean;  // set when the input could canonicalize to multiple forms
}

export function normalizeDate(raw: string): NormalizeResult {
  if (!raw) return { value: raw, changed: false };
  const trimmed = raw.trim();
  if (!trimmed) return { value: trimmed, changed: trimmed !== raw };

  // Qualified forms: "Abt 1882", "BET 1760 AND 1816", etc.
  const between = trimmed.match(/^bet(?:ween)?\.?\s+(\d{4})\s+and\s+(\d{4})$/i);
  if (between) {
    const out = `Bet ${between[1]} And ${between[2]}`;
    return { value: out, changed: out !== raw };
  }

  const qualifier = trimmed.match(/^(abt|about|circa|ca|est|bef|before|aft|after)\.?\s+(.+)$/i);
  if (qualifier) {
    const tag = qualifier[1]!.toLowerCase();
    const rest = normalizeDate(qualifier[2]!);
    let prefix: string;
    if (tag === 'bef' || tag === 'before') prefix = 'Bef';
    else if (tag === 'aft' || tag === 'after') prefix = 'Aft';
    else prefix = 'Abt';
    const out = `${prefix} ${rest.value}`;
    return {
      value: out,
      changed: out !== raw,
      ...(rest.ambiguous ? { ambiguous: true } : {}),
    };
  }

  // Year-only: "1923"
  if (/^\d{4}$/.test(trimmed)) return { value: trimmed, changed: trimmed !== raw };

  // Mon YYYY: "Sep 1932"
  const monYear = trimmed.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (monYear) {
    const m = titleCaseMonth(monYear[1]!);
    if (m) {
      const out = `${m} ${monYear[2]}`;
      return { value: out, changed: out !== raw };
    }
  }

  // "Month D, YYYY" or "Month D YYYY": "August 19, 2001", "Feb 28 1970"
  const monDY = trimmed.match(/^([A-Za-z]+)\s+0?(\d{1,2}),?\s+(\d{4})$/);
  if (monDY) {
    const m = titleCaseMonth(monDY[1]!);
    if (m) {
      const out = `${monDY[2]} ${m} ${monDY[3]}`;
      return { value: out, changed: out !== raw };
    }
  }

  // D Mon YYYY: "7 Sep 1997", "08 OCT 1790"
  const dMonY = trimmed.match(/^0?(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (dMonY) {
    const m = titleCaseMonth(dMonY[2]!);
    if (m) {
      const out = `${dMonY[1]} ${m} ${dMonY[3]}`;
      return { value: out, changed: out !== raw };
    }
  }

  // Slash format: "17/09/1923", "9/7/1997"
  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const yyyy = slash[3]!;
    const SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (a > 12 && b <= 12) {
      // d/m/y unambiguous
      return { value: `${a} ${SHORT[b - 1]} ${yyyy}`, changed: true };
    }
    if (b > 12 && a <= 12) {
      // m/d/y unambiguous
      return { value: `${b} ${SHORT[a - 1]} ${yyyy}`, changed: true };
    }
    // both ≤ 12: ambiguous, don't guess
    return { value: trimmed, changed: trimmed !== raw, ambiguous: true };
  }

  return { value: trimmed, changed: trimmed !== raw };
}

// Match date-like substrings strictly. Order matters: longer / more specific
// patterns first so they're tried before shorter ones.
const DATE_PATTERNS: RegExp[] = [
  /\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/g,
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/g,
  /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{4}\b/g,
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2},?\s+\d{4}\b/g,
  /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g,
];

export function findDatesInLine(line: string): Array<{ start: number; text: string }> {
  const hits: Array<{ start: number; text: string }> = [];
  for (const re of DATE_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const overlaps = hits.some(h => m!.index < h.start + h.text.length && m!.index + m![0].length > h.start);
      if (!overlaps) hits.push({ start: m.index, text: m[0]! });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

/**
 * Rewrite every date string in `body` into its canonical form. Lines inside
 * fenced code blocks are passed through untouched (same convention the
 * format-drift detector uses on page bodies). Ambiguous slash dates
 * (m/d/y vs d/m/y when both numbers are ≤ 12) are left as-is — the caller
 * should surface them as a manual-disambiguation finding rather than guess.
 *
 * Used by the author orchestrator to canonicalize model-drafted prose
 * before writing it to disk, so phase commits don't trip the data repo's
 * format-drift pre-commit hook on dates the detector would auto-fix anyway.
 */
export function normalizeDatesInBody(body: string): string {
  const lines = body.split('\n');
  let inCode = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trimStart().startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const hits = findDatesInLine(line);
    if (hits.length === 0) continue;
    let newLine = line;
    for (const hit of [...hits].reverse()) {
      const result = normalizeDate(hit.text);
      if (result.ambiguous) continue;
      if (!result.changed) continue;
      newLine = newLine.slice(0, hit.start) + result.value + newLine.slice(hit.start + hit.text.length);
    }
    lines[i] = newLine;
  }
  return lines.join('\n');
}
