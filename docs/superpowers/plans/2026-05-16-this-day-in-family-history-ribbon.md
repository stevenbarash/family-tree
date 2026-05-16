# "This day in family history" Ribbon — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small ribbon under the home-page header that lists what happened on today's calendar date across all ancestors — births, deaths, and marriages — pulled from derived GEDCOM YAMLs and sorted oldest-first. Personal almanac energy: turn the wiki into something checked daily, not only when researching.

**Architecture:** A pure function in `core/src/family/on-this-day.ts` extracts month+day+year tuples from `birth.date`, `death.date`, and `marriages[].marriedDate` across all derived records, filters by a (month, day) input, and returns a typed `TodayEvent[]` sorted by year ascending. The frontend joins event records to wiki slugs (so names link to pages), renders as a compact RSC ribbon on `/`. Hides entirely when there are no events. No new I/O, no client JS, no env vars.

**Tech Stack:** Existing — `core/family/*` pure modules, `getCachedDerivedRecords()`, Next 16 App Router RSC, `tsx --test`.

---

## Design decisions baked in

- **Exact (month, day) match.** No ±1 day fuzzing in v1; if the wiki is sparse, the ribbon just doesn't render on empty days. Cheaper, predictable, and the data scarcity will drive the user to add more pages.
- **Three event types: birth, death, marriage.** Residence and occupation events typically lack a precise day. Children's births are already captured under the parent's birth (via that parent).
- **Marriages deduped by FAM id.** Each marriage is in both spouses' `marriages[]`; we report it once.
- **Approximate dates excluded.** Anything with a qualifier (`Abt`, `Bef`, `Aft`, `Bet`, `Cal`, `Est`) is skipped, even when a day is present — "Abt 12 Jan 1880" is approximation noise for an almanac.
- **Sort oldest-first.** Reads naturally for almanac flavor ("1879 → 1946 → 2001"); also matches Wikipedia's "on this day" convention.
- **"Today" comes from the server clock.** Single-user wiki on a personal Tailscale node — viewer-time and server-time are the same. UTC-bound parser; render uses local server time.
- **Ribbon hides when empty.** No "On this day, nothing remembered" placeholder. A blank between dates is fine.
- **Living people get a softer treatment.** Even with the privacy gate disabled (current state), prefer not to surface births of living individuals on the home page — the strip is shareable-screenshot territory. Skip events where the person is alive (no `death.date`) AND the event year is within the last ~110 years AND the event is a birth. Living-person marriages and deaths (death only happens once you're not living) are fine. This is a UX softening, not a privacy gate — controlled by the same shipped code path.

---

## File structure

| File | Role |
|---|---|
| `core/src/family/on-this-day.ts` (new) | Pure: `findOnThisDay(records, monthDay): TodayEvent[]`. Extracts dated events from `birth`/`death`/`marriages`; filters by exact month+day; dedupes marriages by `fam`; skips approximate dates; sorts by year. |
| `core/test/family/on-this-day.test.ts` (new) | Tests: parser edge cases (qualified, partial, future), marriage dedupe, sort order, living-person birth suppression. |
| `frontend/lib/on-this-day-view.ts` (new) | Server-side wrapper: gets cached records, joins event subjects to wiki slugs from the page list, returns view-ready data. |
| `frontend/components/on-this-day-ribbon.tsx` (new) | RSC component: small ribbon with the events as a tight list. Renders nothing when input is empty. |
| `frontend/app/page.tsx` (modify) | Compute today's date, fetch events, render ribbon under the existing header section. |

---

## Task 1: Extract (month, day, year) from a raw GEDCOM date string

Pure helper in `core/src/family/on-this-day.ts`. Strict — returns null if anything is approximate, qualified, or missing the day.

**Files:**
- Create: `core/src/family/on-this-day.ts`
- Create: `core/test/family/on-this-day.test.ts`

- [ ] **Step 1: Write failing tests for the date extractor**

Create `core/test/family/on-this-day.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractFullDate } from '../../src/family/on-this-day.ts';

test('extractFullDate: parses "27 Jul 1946"', () => {
  assert.deepEqual(extractFullDate('27 Jul 1946'), { month: 7, day: 27, year: 1946 });
});

test('extractFullDate: parses "12 JAN 1950" (uppercase)', () => {
  assert.deepEqual(extractFullDate('12 JAN 1950'), { month: 1, day: 12, year: 1950 });
});

test('extractFullDate: parses "5 september 1997" (lowercase, full name)', () => {
  assert.deepEqual(extractFullDate('5 september 1997'), { month: 9, day: 5, year: 1997 });
});

test('extractFullDate: returns null for year-only "1880"', () => {
  assert.equal(extractFullDate('1880'), null);
});

test('extractFullDate: returns null for month+year-only "Jul 1946"', () => {
  assert.equal(extractFullDate('Jul 1946'), null);
});

test('extractFullDate: returns null for any qualifier (Abt/Bef/Aft/Bet/Cal/Est)', () => {
  for (const raw of ['Abt 27 Jul 1946', 'Bef 1 Jan 1900', 'Aft 1980', 'Bet 1850 And 1860', 'Cal 1900', 'Est 1875']) {
    assert.equal(extractFullDate(raw), null, `expected null for "${raw}"`);
  }
});

test('extractFullDate: returns null for null/empty input', () => {
  assert.equal(extractFullDate(null), null);
  assert.equal(extractFullDate(''), null);
  assert.equal(extractFullDate('   '), null);
});

test('extractFullDate: returns null for garbage', () => {
  assert.equal(extractFullDate('what'), null);
  assert.equal(extractFullDate('27 Foo 1946'), null);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd core && npx tsx --test test/family/on-this-day.test.ts
```

Expected: FAIL — `Cannot find module '../../src/family/on-this-day.ts'`.

- [ ] **Step 3: Implement the extractor**

Create `core/src/family/on-this-day.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
cd core && npx tsx --test test/family/on-this-day.test.ts
```

Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add core/src/family/on-this-day.ts core/test/family/on-this-day.test.ts
git commit -m "feat(core): add extractFullDate date parser for on-this-day"
```

---

## Task 2: `findOnThisDay` — walk records, return events for a (month, day)

Add the main aggregator alongside the parser. Births, deaths, marriages — dedupe marriages by FAM id, exclude living-person births within the last 110 years.

**Files:**
- Modify: `core/src/family/on-this-day.ts`
- Modify: `core/test/family/on-this-day.test.ts`

- [ ] **Step 1: Add tests for findOnThisDay**

Append to `core/test/family/on-this-day.test.ts`:

```typescript
import { findOnThisDay } from '../../src/family/on-this-day.ts';
import type { DerivedRecord } from '../../src/gedcom/types.ts';

function rec(over: Partial<DerivedRecord> & { record: string; name: string }): DerivedRecord {
  return {
    birth: null,
    death: null,
    parents: [],
    spouses: [],
    children: [],
    familyOfOrigin: [],
    marriages: [],
    residences: [],
    occupations: [],
    sources: [],
    media: [],
    privacy: { restricted: false, reason: 'none' },
    ...over,
  };
}

test('findOnThisDay: surfaces a birth, death, and marriage all on the same calendar day', () => {
  const records = new Map<string, DerivedRecord>([
    ['@I1@', rec({ record: '@I1@', name: 'Boris',     birth: { date: '15 Jun 1946', place: null }, death: { date: null, place: null } })],
    ['@I2@', rec({ record: '@I2@', name: 'Mordechai', death: { date: '15 Jun 1928', place: null } })],
    ['@I3@', rec({ record: '@I3@', name: 'Veniamin',  marriages: [{ fam: '@F1@', spouse: { record: '@I4@', name: 'Tatiana' }, children: [], marriedDate: '15 Jun 1956', marriedPlace: null }] })],
    ['@I4@', rec({ record: '@I4@', name: 'Tatiana',   marriages: [{ fam: '@F1@', spouse: { record: '@I3@', name: 'Veniamin' }, children: [], marriedDate: '15 Jun 1956', marriedPlace: null }] })],
  ]);
  const events = findOnThisDay(records, { month: 6, day: 15 }, { now: new Date('2026-06-15T12:00:00Z') });
  assert.equal(events.length, 3);
  // Sorted oldest-first.
  assert.deepEqual(events.map(e => e.year), [1928, 1946, 1956]);
  assert.deepEqual(events.map(e => e.type), ['death', 'birth', 'marriage']);
});

test('findOnThisDay: marriages are deduped by FAM id (one event, not two)', () => {
  const records = new Map<string, DerivedRecord>([
    ['@I3@', rec({ record: '@I3@', name: 'Veniamin', marriages: [{ fam: '@F1@', spouse: { record: '@I4@', name: 'Tatiana' }, children: [], marriedDate: '15 Jun 1956', marriedPlace: null }] })],
    ['@I4@', rec({ record: '@I4@', name: 'Tatiana',  marriages: [{ fam: '@F1@', spouse: { record: '@I3@', name: 'Veniamin' }, children: [], marriedDate: '15 Jun 1956', marriedPlace: null }] })],
  ]);
  const events = findOnThisDay(records, { month: 6, day: 15 }, { now: new Date('2026-06-15T12:00:00Z') });
  assert.equal(events.length, 1);
  assert.equal(events[0]!.type, 'marriage');
  // Both spouses are populated; primary is whichever is alphabetically first by name, for determinism.
  assert.equal(events[0]!.primary.name, 'Tatiana');
  assert.equal(events[0]!.secondary?.name, 'Veniamin');
});

test('findOnThisDay: returns empty for a day with no matching events', () => {
  const records = new Map<string, DerivedRecord>([
    ['@I1@', rec({ record: '@I1@', name: 'Boris', birth: { date: '15 Jun 1946', place: null } })],
  ]);
  const events = findOnThisDay(records, { month: 1, day: 1 }, { now: new Date('2026-01-01T12:00:00Z') });
  assert.equal(events.length, 0);
});

test('findOnThisDay: skips qualified dates (Abt 15 Jun 1946 does not match Jun 15)', () => {
  const records = new Map<string, DerivedRecord>([
    ['@I1@', rec({ record: '@I1@', name: 'Boris', birth: { date: 'Abt 15 Jun 1946', place: null } })],
  ]);
  const events = findOnThisDay(records, { month: 6, day: 15 }, { now: new Date('2026-06-15T12:00:00Z') });
  assert.equal(events.length, 0);
});

test('findOnThisDay: suppresses births of likely-living people (no death, within 110 years)', () => {
  const records = new Map<string, DerivedRecord>([
    // Boris: still living (no death), born 1990 — should be suppressed in 2026.
    ['@I1@', rec({ record: '@I1@', name: 'Boris', birth: { date: '15 Jun 1990', place: null }, death: { date: null, place: null } })],
    // Mordechai: died, born 1880 — surfaces fine.
    ['@I2@', rec({ record: '@I2@', name: 'Mordechai', birth: { date: '15 Jun 1880', place: null }, death: { date: '1 Jan 1955', place: null } })],
  ]);
  const events = findOnThisDay(records, { month: 6, day: 15 }, { now: new Date('2026-06-15T12:00:00Z') });
  assert.equal(events.length, 1);
  assert.equal(events[0]!.primary.name, 'Mordechai');
});

test('findOnThisDay: still surfaces births older than 110 years even when death is unrecorded', () => {
  // A 1900 birth with no death record is clearly historical, not living.
  const records = new Map<string, DerivedRecord>([
    ['@I1@', rec({ record: '@I1@', name: 'Mendel', birth: { date: '15 Jun 1900', place: null }, death: { date: null, place: null } })],
  ]);
  const events = findOnThisDay(records, { month: 6, day: 15 }, { now: new Date('2026-06-15T12:00:00Z') });
  assert.equal(events.length, 1);
  assert.equal(events[0]!.primary.name, 'Mendel');
});

test('findOnThisDay: skips births dated in the future relative to "now"', () => {
  // Defensive: data with a typo'd future year shouldn't show as an event.
  const records = new Map<string, DerivedRecord>([
    ['@I1@', rec({ record: '@I1@', name: 'GlitchPerson', birth: { date: '15 Jun 2099', place: null } })],
  ]);
  const events = findOnThisDay(records, { month: 6, day: 15 }, { now: new Date('2026-06-15T12:00:00Z') });
  assert.equal(events.length, 0);
});
```

- [ ] **Step 2: Run tests — should fail (findOnThisDay not yet exported)**

```bash
cd core && npx tsx --test test/family/on-this-day.test.ts
```

Expected: FAIL — `findOnThisDay` is not exported.

- [ ] **Step 3: Implement findOnThisDay**

Add to `core/src/family/on-this-day.ts`:

```typescript
import type { DerivedRecord } from '../gedcom/types.ts';

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
  /** Suppress births of likely-living people born within this many years of `now`. Default 110. */
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
  const livingWindow = options.livingWindowYears ?? 110;
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
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
cd core && npx tsx --test test/family/on-this-day.test.ts
```

Expected: PASS (15 tests = 8 from Task 1 + 7 here).

- [ ] **Step 5: Run the full core suite to confirm no regression**

```bash
cd core && npm test
```

Expected: previous count + 15 tests, all green.

- [ ] **Step 6: Commit**

```bash
git add core/src/family/on-this-day.ts core/test/family/on-this-day.test.ts
git commit -m "feat(core): add findOnThisDay almanac aggregator"
```

---

## Task 3: Frontend view-join — resolve event subjects to wiki slugs

The core function returns `record` ids and `name`s but no slugs. The frontend needs slugs so names can link to pages. Build a thin server-side wrapper that fetches cached records, runs `findOnThisDay`, and decorates each event person with a slug if one exists.

**Files:**
- Create: `frontend/lib/on-this-day-view.ts`

- [ ] **Step 1: Implement the wrapper (no separate test — covered by the Task 4 integration via type-check; the core logic is fully tested in Tasks 1–2)**

Create `frontend/lib/on-this-day-view.ts`:

```typescript
import { findOnThisDay, type TodayEvent, type TodayEventPerson } from '@core/family/on-this-day.ts';
import { getCachedDerivedRecords } from './family';
import type { PageMetaSummary } from '@core/pages/index.ts';

export interface TodayEventViewPerson extends TodayEventPerson {
  slug?: string;
}

export interface TodayEventView {
  type: TodayEvent['type'];
  year: number;
  primary: TodayEventViewPerson;
  secondary?: TodayEventViewPerson;
}

/**
 * Compute events on the given calendar day and join each event subject to a
 * wiki slug, if a page exists for that GEDCOM record. Names without a slug
 * still render — they just don't become links.
 */
export function getEventsForToday(
  list: ReadonlyArray<PageMetaSummary>,
  now: Date,
): TodayEventView[] {
  // The server uses UTC; "today" in display means UTC today. For a
  // personal Tailscale-fronted wiki this is fine — single user, same TZ
  // as the server.
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  const events = findOnThisDay(getCachedDerivedRecords(), { month, day }, { now });
  if (events.length === 0) return [];

  const recordToSlug = new Map<string, string>();
  for (const p of list) {
    if (p.gedcomRecord && !p.isTalk && !p.isArchived) {
      recordToSlug.set(p.gedcomRecord, p.slug);
    }
  }
  const decorate = (p: TodayEventPerson): TodayEventViewPerson => ({
    ...p,
    slug: recordToSlug.get(p.record),
  });
  return events.map(e => ({
    type: e.type,
    year: e.year,
    primary: decorate(e.primary),
    ...(e.secondary ? { secondary: decorate(e.secondary) } : {}),
  }));
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/on-this-day-view.ts
git commit -m "feat(frontend): add on-this-day view-join with slug resolution"
```

---

## Task 4: The ribbon component

Compact RSC. One line per event. Names link to pages when a slug exists; render as plain text otherwise. Hides itself entirely when the array is empty (the route can just always render `<OnThisDayRibbon events={...} />` — the component handles the empty case).

**Files:**
- Create: `frontend/components/on-this-day-ribbon.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/components/on-this-day-ribbon.tsx`:

```tsx
import Link from 'next/link';
import type { TodayEventView, TodayEventViewPerson } from '@/lib/on-this-day-view';

interface Props {
  events: ReadonlyArray<TodayEventView>;
  /** The calendar day this ribbon represents, e.g. "May 16". */
  dayLabel: string;
}

function PersonLink({ person }: { person: TodayEventViewPerson }) {
  if (person.slug) {
    return (
      <Link
        href={`/${person.slug}`}
        className="font-medium text-foreground underline-offset-4 hover:underline"
      >
        {person.name}
      </Link>
    );
  }
  return <span className="font-medium text-foreground">{person.name}</span>;
}

function EventLine({ event }: { event: TodayEventView }) {
  if (event.type === 'birth') {
    return <li><span className="font-mono text-muted-foreground tabular-nums">{event.year}</span> — <PersonLink person={event.primary} /> was born</li>;
  }
  if (event.type === 'death') {
    return <li><span className="font-mono text-muted-foreground tabular-nums">{event.year}</span> — <PersonLink person={event.primary} /> died</li>;
  }
  // Marriage
  return (
    <li>
      <span className="font-mono text-muted-foreground tabular-nums">{event.year}</span>
      {' — '}
      <PersonLink person={event.primary} />
      {event.secondary ? <> married <PersonLink person={event.secondary} /></> : ' married'}
    </li>
  );
}

/**
 * Almanac strip rendered under the home-page header. Shows what happened on
 * today's calendar date across the family tree, sorted oldest-first. Renders
 * nothing when `events` is empty.
 */
export function OnThisDayRibbon({ events, dayLabel }: Props) {
  if (events.length === 0) return null;
  return (
    <section className="mb-10 border-l-2 border-muted-foreground/30 pl-4">
      <h2 className="font-display text-xs uppercase tracking-[0.32em] text-muted-foreground">
        On this day — {dayLabel}
      </h2>
      <ul className="mt-3 space-y-1 text-sm leading-7 text-foreground/90">
        {events.map((e, i) => <EventLine key={i} event={e} />)}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/on-this-day-ribbon.tsx
git commit -m "feat(frontend): add OnThisDayRibbon home-page almanac component"
```

---

## Task 5: Wire the ribbon into the home page

Compute today's events in the existing `Promise.all`, render the ribbon between the existing snapshot-staleness banner and the "Continue research" section. Format the day label as "May 16" style.

**Files:**
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Read the current shape**

```bash
sed -n '1,80p' frontend/app/page.tsx
```

Confirm the imports at the top, the `Promise.all` block, the snapshot-staleness banner, and the "Continue research" section.

- [ ] **Step 2: Add the imports**

At the top of `frontend/app/page.tsx`, add:

```typescript
import { getEventsForToday } from '@/lib/on-this-day-view';
import { OnThisDayRibbon } from '@/components/on-this-day-ribbon';
```

- [ ] **Step 3: Compute today's events**

In the home-page component, just after the existing `Promise.all` that resolves to `[tree, recent, snapshots]` (currently around line 22), add:

```typescript
const now = new Date();
const todayEvents = getEventsForToday(live, now);
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayLabel = `${monthNames[now.getUTCMonth()]} ${now.getUTCDate()}`;
```

`live` is the existing variable declared as `const live = list.filter(p => !p.isTalk && !p.isArchived);` at line 22 of `frontend/app/page.tsx` — already in scope here.

- [ ] **Step 4: Render the ribbon**

Find this block (currently around line 70):

```tsx
      {snapAge !== null && snapAge > STALE_SNAPSHOT_DAYS ? (
        <div className="mb-8 ...">
          ...
        </div>
      ) : null}

      {frontier.length > 0 ? (
        <section className="mb-10">
          <h2 className="mb-3 font-display text-xs uppercase tracking-[0.32em] text-muted-foreground">
            Continue research
```

Insert the ribbon between the snapshot-staleness banner and the "Continue research" section:

```tsx
      <OnThisDayRibbon events={todayEvents} dayLabel={dayLabel} />
```

Because the component renders `null` when `events` is empty, no extra guard is needed in the route.

- [ ] **Step 5: Run tests + typecheck**

```bash
cd frontend && npm test
cd frontend && npx tsc --noEmit
```

Expected: tests still pass (no new tests in this task); typecheck clean.

- [ ] **Step 6: Smoke-test in the browser — DEFER TO USER**

You can't run a browser. The controller will smoke-test manually.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "feat(frontend): render on-this-day ribbon on the home page"
```

---

## Task 6: CHANGELOG entry + plan-index update

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/plans/README.md`

- [ ] **Step 1: Add the changelog entry**

Under `## [Unreleased] — v2 development` → `### Added` at the very top (above the relationship-strip entry):

```markdown
- **"On this day" almanac ribbon on the home page** *(2026-05-16)*. Under
  the index header, a compact ribbon now lists births, deaths, and
  marriages from the family tree that fall on today's calendar date,
  sorted oldest-first ("1928 — Mordechai Margolis died. 1946 — Boris
  Ayzman was born."). Pulled from derived YAMLs at request time; ribbon
  hides on empty days. Approximate dates (Abt/Bef/Aft) and births of
  likely-living relatives (no recorded death + born within the last 110
  years) are suppressed. Marriages dedupe by FAM id so each wedding
  surfaces once. New pure core function `findOnThisDay` in
  `core/src/family/on-this-day.ts` plus a frontend slug-join wrapper.
```

- [ ] **Step 2: Add row to the plan index**

In `docs/superpowers/plans/README.md`, above the relationship-strip row (so 2026-05-16 entries stay clustered):

```markdown
| ✅ | [`2026-05-16-this-day-in-family-history-ribbon.md`](./2026-05-16-this-day-in-family-history-ribbon.md) | "This day in family history" ribbon | Home-page almanac listing today's births, deaths, marriages from the GEDCOM tree, sorted oldest-first. |
```

If a counts footer exists on the index (e.g., "N plans / M shipped"), bump both counts by 1.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md docs/superpowers/plans/README.md
git commit -m "docs: changelog + plan-index entry for on-this-day ribbon"
```

If `CHANGELOG.md` has unrelated working-tree edits at commit time, stage only the relevant hunk via `git apply --cached` of a focused patch — DO NOT use `git add -u`, `git add .`, or `git add -A`.

---

## Verification checklist (run after Task 5)

- [ ] `cd core && npm test` — all tests green, +15 tests
- [ ] `cd frontend && npm test` — all tests green
- [ ] `cd frontend && npx tsc --noEmit` — no errors
- [ ] Visit `/` in the browser
- [ ] On a day with known events: ribbon renders sorted oldest-first; names with pages link, names without don't
- [ ] On a day with no events: no ribbon section appears (no empty container)
- [ ] On a day with a living person's birthday and the privacy gate disabled: living birthday does NOT appear; their parents' / grandparents' events from the same day DO
- [ ] Hovering a person link previews the page (existing behavior — the ribbon shouldn't break it)

---

## Out of scope (deferred follow-ups)

- **Tomorrow / yesterday peek.** A "← previous day | next day →" arrow set on the ribbon to scroll through the calendar. Trivial extension but adds interaction overhead for v1.
- **Place names in event text.** "Born in Kyiv." Available from `birth.place` etc. but lengthens the line; v2 if dense days call for it.
- **±1 day fuzz when the day is empty.** Optional fallback when there are no events. Adds complexity to the empty path; not worth it until the user actually feels the absence.
- **Anniversaries grouped together** ("80 years ago today: …"). Adds an arithmetic layer to the render; defer until the ribbon proves daily-checked.
- **Email/Slack digest** ("Your morning almanac"). Out of frontend scope entirely; would live in a CLI cron command.
- **"Saint days" / external context** (US holiday on this day, etc.). Adds external data; out of project scope.
