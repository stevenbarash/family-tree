import type { DerivedRecord } from '../gedcom/types.ts';

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

export type TodayEventType = 'birth' | 'death' | 'marriage';

export interface TodayEventPerson {
  record: string;
  name: string;
}

export interface TodayEvent {
  type: TodayEventType;
  year: number;
  /** The subject of the event. For marriages, alphabetically-first spouse for deterministic ordering. */
  primary: TodayEventPerson;
  /** For marriages: the other spouse. Unset for birth/death. */
  secondary?: TodayEventPerson;
}

export interface FindOnThisDayInput {
  month: number; // 1-12
  day: number;   // 1-31
}

export interface FindOnThisDayOptions {
  /** Used for the "is this person likely living?" heuristic and the future-year guard. */
  now: Date;
  /** Suppress births of likely-living people born within this many years of `now`. Default 80. */
  livingWindowYears?: number;
}

/**
 * Pure: walk all derived records, find births/deaths/marriages that fall on
 * the given calendar (month, day), and return them sorted by year ascending.
 *
 * Marriages are deduped by FAM id (the same FAM appears in both spouses'
 * `marriages[]` arrays).
 *
 * Approximate dates (Abt/Bef/Aft/Bet/Cal/Est) and partial dates are
 * silently excluded by `extractFullDate`.
 *
 * Births of likely-living people (no `death.date` AND born within
 * `livingWindowYears` of `now`) are suppressed — even with the privacy
 * gate disabled, the home-page ribbon shouldn't surface a living
 * relative's birthday by default. Historical births with no recorded
 * death (older than the window) surface normally.
 */
export function findOnThisDay(
  records: ReadonlyMap<string, DerivedRecord>,
  on: FindOnThisDayInput,
  options: FindOnThisDayOptions,
): TodayEvent[] {
  const livingWindow = options.livingWindowYears ?? 80;
  const nowYear = options.now.getUTCFullYear();
  const livingCutoff = nowYear - livingWindow;
  const out: TodayEvent[] = [];
  const seenMarriageFams = new Set<string>();

  for (const [, rec] of records) {
    // Birth
    const bd = extractFullDate(rec.birth?.date ?? null);
    if (bd && bd.month === on.month && bd.day === on.day && bd.year <= nowYear) {
      const isLikelyLiving = !rec.death?.date && bd.year > livingCutoff;
      if (!isLikelyLiving) {
        out.push({ type: 'birth', year: bd.year, primary: { record: rec.record, name: rec.name } });
      }
    }
    // Death
    const dd = extractFullDate(rec.death?.date ?? null);
    if (dd && dd.month === on.month && dd.day === on.day && dd.year <= nowYear) {
      out.push({ type: 'death', year: dd.year, primary: { record: rec.record, name: rec.name } });
    }
    // Marriages
    for (const m of rec.marriages) {
      if (seenMarriageFams.has(m.fam)) continue;
      const md = extractFullDate(m.marriedDate);
      if (!md || md.month !== on.month || md.day !== on.day || md.year > nowYear) continue;
      seenMarriageFams.add(m.fam);
      const spouse = m.spouse;
      if (!spouse) {
        // FAM without a recorded spouse — unusual, surface this side only.
        out.push({ type: 'marriage', year: md.year, primary: { record: rec.record, name: rec.name } });
        continue;
      }
      // Deterministic ordering: alphabetically-first name is primary so a
      // second pass through the records map can't reorder the pair.
      const here = { record: rec.record, name: rec.name };
      const there = { record: spouse.record, name: spouse.name };
      const [primary, secondary] = here.name.localeCompare(there.name) <= 0
        ? [here, there]
        : [there, here];
      out.push({ type: 'marriage', year: md.year, primary, secondary });
    }
  }

  out.sort((a, b) => a.year - b.year);
  return out;
}
