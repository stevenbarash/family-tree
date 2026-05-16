const FULL_DATE_RE = /^\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s*$/;

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const QUALIFIER_RE = /\b(abt|bef|aft|bet|cal|est|about|before|after|between|circa)\b/i;

/**
 * Parse a raw GEDCOM date string into `{month, day, year}` if and only if
 * the string is an unqualified full D Mon YYYY date. Any qualifier
 * (Abt/Bef/Aft/Bet/Cal/Est), partial date (year only, month+year only),
 * or unparseable string returns null. This strictness is intentional:
 * the "on this day" ribbon is an almanac, not a fuzzy match.
 */
export function extractFullDate(raw: string | null | undefined): { month: number; day: number; year: number } | null {
  if (!raw) return null;
  if (QUALIFIER_RE.test(raw)) return null;
  const m = raw.match(FULL_DATE_RE);
  if (!m) return null;
  const day = parseInt(m[1]!, 10);
  const month = MONTHS[m[2]!.toLowerCase()];
  const year = parseInt(m[3]!, 10);
  if (!month || day < 1 || day > 31 || year < 1 || year > 9999) return null;
  return { month, day, year };
}
