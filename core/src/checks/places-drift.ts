import { join } from 'node:path';
import type { Detector, Finding, RepoState } from './types.ts';
import { parseGedcomYear } from '../family/dates.ts';

/**
 * Drift detector for `genealogy/places-coords.yml` and the historical-regime
 * attribution invariants that go with it. Emits findings in three categories:
 *
 *   schema    — structural problems with the coords file
 *   coverage  — declared aliases that match no actual GEDCOM PLAC string
 *   data      — anachronistic PLAC/DATE pairs in the GEDCOM
 *
 * The "data" findings are the substantive ones: they keep modern Ukraine,
 * the Soviet Union, and the Russian Empire from being conflated as the
 * GEDCOM is edited. Same physical place can alias to one map dot — but a
 * 1902 birth in "Kiev, Ukraine, Soviet Union" is a recording error.
 */

interface RegimeRule {
  test: (place: string) => boolean;
  validFrom?: number;   // inclusive; events with min year < this → flag
  validTo?: number;     // inclusive; events with max year > this → flag
  reason: string;
}

// Adding a new regime is a one-row addition. Tokens are matched
// case-insensitively. Use word/comma boundaries on tokens that could
// otherwise hit substrings (e.g. "Prussia" must not match "Prussian").
const REGIMES: ReadonlyArray<RegimeRule> = [
  {
    test: (p) => /\b(?:soviet union|ussr)\b/i.test(p),
    validFrom: 1922,
    validTo: 1991,
    reason: 'Soviet Union existed 1922–1991 (formed 30 Dec 1922, dissolved 26 Dec 1991)',
  },
  {
    test: (p) => /russian empire/i.test(p),
    validTo: 1917,
    reason: 'Russian Empire ended in 1917 (Feb/Oct revolutions); after that the territory was the RSFSR / Soviet Union / successor states',
  },
  {
    test: (p) => /(?:^|,\s*)prussia(?:\s*,|\s*$)/i.test(p),
    validTo: 1947,
    reason: 'Prussia was formally dissolved in 1947 by Allied Control Council Law No. 46',
  },
];

export const detectPlacesDrift: Detector = (state: RepoState): Finding[] => {
  const findings: Finding[] = [];
  const coordsFile = join(state.rootDir, 'genealogy/places-coords.yml');

  // ── schema: lat/lon range + alias collisions ────────────────────────
  const canonicals = new Set<string>();
  for (const c of state.placesCoords) canonicals.add(c.name);

  const aliasOwners = new Map<string, string[]>();
  for (const c of state.placesCoords) {
    if (c.lat < -90 || c.lat > 90) {
      findings.push({
        category: 'schema',
        severity: 'error',
        message: `places-coords: invalid latitude ${c.lat} on "${c.name}" (valid range: -90 to 90)`,
        location: { file: coordsFile },
      });
    }
    if (c.lon < -180 || c.lon > 180) {
      findings.push({
        category: 'schema',
        severity: 'error',
        message: `places-coords: invalid longitude ${c.lon} on "${c.name}" (valid range: -180 to 180)`,
        location: { file: coordsFile },
      });
    }
    for (const a of c.aliases) {
      if (canonicals.has(a) && a !== c.name) {
        findings.push({
          category: 'schema',
          severity: 'error',
          message: `places-coords: alias "${a}" on entry "${c.name}" collides with canonical name of another entry — pick one home for that string`,
          location: { file: coordsFile },
        });
      }
      const arr = aliasOwners.get(a) ?? [];
      arr.push(c.name);
      aliasOwners.set(a, arr);
    }
  }
  for (const [a, owners] of aliasOwners) {
    if (owners.length <= 1) continue;
    const distinctOwners = [...new Set(owners)];
    if (distinctOwners.length > 1) {
      findings.push({
        category: 'schema',
        severity: 'error',
        message: `places-coords: alias "${a}" claimed by ${distinctOwners.length} entries (${distinctOwners.join(', ')}) — matcher will pick one and silently ignore the rest`,
        location: { file: coordsFile },
      });
    } else {
      findings.push({
        category: 'schema',
        severity: 'info',
        message: `places-coords: alias "${a}" listed twice within entry "${distinctOwners[0]}"`,
        location: { file: coordsFile },
      });
    }
  }

  // ── coverage: dead aliases ─────────────────────────────────────────
  // Trim trailing whitespace to mirror what the deriver does — the
  // matcher resolves against derived (trimmed) strings, so a dead-alias
  // check that uses the raw GEDCOM would generate false positives on
  // PLAC lines with stray trailing whitespace.
  const allPlaceStrings = new Set<string>();
  if (state.gedcomText) {
    for (const m of state.gedcomText.matchAll(/^2 PLAC (.+?)\s*$/gm)) {
      allPlaceStrings.add(m[1]!);
    }
  }
  if (allPlaceStrings.size > 0) {
    for (const c of state.placesCoords) {
      for (const a of c.aliases) {
        if (!allPlaceStrings.has(a)) {
          findings.push({
            category: 'coverage',
            severity: 'info',
            message: `places-coords: dead alias "${a}" on "${c.name}" matches no GEDCOM PLAC string (likely a typo, or a string that has rotted out of the data — remove or correct)`,
            location: { file: coordsFile },
          });
        }
      }
    }
  }

  // ── data: PLAC/DATE anachronism ────────────────────────────────────
  for (const [, record] of state.derived) {
    for (const ev of (['birth', 'death'] as const)) {
      const e = record[ev];
      if (!e?.place || !e.date) continue;
      const bounds = yearBounds(e.date);
      if (!bounds) continue;
      for (const rule of REGIMES) {
        if (!rule.test(e.place)) continue;
        // Aggressive: flag whenever any part of the event's date range
        // could fall in the impossible zone. A "Bet 1900 And 1925"
        // event tagged "Russian Empire" gets flagged even though 1900
        // would be valid — because the recorder presumably believed the
        // event was empire-era, and the upper bound contradicts that.
        if (rule.validFrom !== undefined && bounds.min < rule.validFrom) {
          findings.push(anachronism(record, ev, e, rule.reason, state.gedcomPath));
        }
        if (rule.validTo !== undefined && bounds.max > rule.validTo) {
          findings.push(anachronism(record, ev, e, rule.reason, state.gedcomPath));
        }
      }
    }
  }

  return findings;
};

interface YearBounds { min: number; max: number; }

function yearBounds(date: string): YearBounds | null {
  // BET/AND explicitly: parseGedcomYear collapses to a midpoint, but
  // anachronism rules need both endpoints to know whether *any* part of
  // the range falls in the impossible zone.
  const between = date.trim().toUpperCase().match(/^BET(?:WEEN)?\s+(\d{4})\s+AND\s+(\d{4})$/);
  if (between) return { min: Number(between[1]), max: Number(between[2]) };
  const parsed = parseGedcomYear(date);
  if (!parsed) return null;
  if (parsed.qualifier === 'before') return { min: -Infinity, max: parsed.year };
  if (parsed.qualifier === 'after') return { min: parsed.year, max: Infinity };
  return { min: parsed.year, max: parsed.year };
}

function anachronism(
  record: { record: string; name: string },
  event: 'birth' | 'death',
  e: { date: string | null; place: string | null },
  reason: string,
  gedcomPath: string,
): Finding {
  return {
    category: 'data',
    severity: 'warn',
    message: `anachronism: ${record.record} (${record.name}) ${event}.place "${e.place}" with ${event}.date "${e.date}" — ${reason}`,
    location: { file: gedcomPath },
  };
}
