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

  return { value: trimmed, changed: trimmed !== raw };
}
