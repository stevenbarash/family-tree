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
    return { value: out, changed: out !== raw };
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
