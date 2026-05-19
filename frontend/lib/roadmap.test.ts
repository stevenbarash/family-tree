import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoadmap } from './roadmap.ts';

const FIXTURE = `# Roadmap

> Strategic sequencing.

**Last updated:** 2026-05-19 (restructured around three tracks)
**Cadence:** revisit at the end of each completed track milestone.

---

## The three tracks

Reading, authoring, contribution.

---

## Status snapshot — 2026-05-19

Working tree is clean.

| Track | Next item | Lift |
|---|---|---|
| Contribution | E.0 — Identity | M |
| Reading | Reading-surface audit | S |

---

## Track: Contribution (current strategic priority)

| Status | Item | Lift | Notes |
|---|---|---|---|
| ⏳ ready | **E.0** Identity & session state | M | Foundation |
| ⏳ ready | **E.1** Browser write API | M | Extends /api/notes |

---

## Track: Reading

| Status | Item | Lift | Source |
|---|---|---|---|
| ⏳ ready | **Audit** | S | New |
| ✅ shipped | **P1.10** Empty/error/loading states | S | Shipped 2026-05-19 |

---

## Parking lot — bookmarked with explicit triggers

| Item | Trigger | Source |
|---|---|---|
| **P1.6** Half/step | User annotates PEDI/ADOP | Review |
| **P3.7** DNA | User obtains DNA | Review |

---

## Cut from roadmap

| Item | Reason | Disposition |
|---|---|---|
| **P3.5** Cross-tree linking | Anti-goal | Removed |

---

## Recently shipped (since 2026-05-07 platform review)

| Item | Plan | Notes |
|---|---|---|
| **P0.1** Stripped removed commands | (no plan) | Shipped 2026-05-17 |

---

## Cadence and updates

Track-milestone boundaries trigger an update.

---

## See also

- SCOPE.md
`;

test('parseRoadmap extracts the document title and intro', () => {
  const doc = parseRoadmap(FIXTURE, '2026-05-19T00:00:00.000Z');
  assert.equal(doc.title, 'Roadmap');
  assert.match(doc.intro, /Strategic sequencing/);
});

test('parseRoadmap extracts the Last updated line', () => {
  const doc = parseRoadmap(FIXTURE, '2026-05-19T00:00:00.000Z');
  assert.equal(doc.lastUpdated, '2026-05-19');
});

test('parseRoadmap classifies snapshot, track, parking, cut, shipped, narrative sections', () => {
  const doc = parseRoadmap(FIXTURE, '2026-05-19T00:00:00.000Z');
  const byKind = doc.sections.reduce<Record<string, number>>((acc, s) => {
    acc[s.kind] = (acc[s.kind] ?? 0) + 1;
    return acc;
  }, {});
  assert.equal(byKind.snapshot, 1);
  assert.equal(byKind.track, 2);
  assert.equal(byKind.parking, 1);
  assert.equal(byKind.cut, 1);
  assert.equal(byKind.shipped, 1);
  assert.equal(byKind.narrative, 3); // "The three tracks", "Cadence and updates", "See also"
});

test('parseRoadmap pulls the track name out of a "Track: X" heading', () => {
  const doc = parseRoadmap(FIXTURE, '2026-05-19T00:00:00.000Z');
  const tracks = doc.sections.filter(s => s.kind === 'track');
  assert.equal(tracks[0].trackName, 'Contribution (current strategic priority)');
  assert.equal(tracks[1].trackName, 'Reading');
});

test('parseRoadmap counts table item rows in each section', () => {
  const doc = parseRoadmap(FIXTURE, '2026-05-19T00:00:00.000Z');
  const contribution = doc.sections.find(s => s.kind === 'track');
  assert.equal(contribution?.itemCount, 2);
  const parking = doc.sections.find(s => s.kind === 'parking');
  assert.equal(parking?.itemCount, 2);
  const cut = doc.sections.find(s => s.kind === 'cut');
  assert.equal(cut?.itemCount, 1);
});

test('parseRoadmap aggregates totals: tracks, shipped, ready, parked, cut', () => {
  const doc = parseRoadmap(FIXTURE, '2026-05-19T00:00:00.000Z');
  assert.equal(doc.totals.tracks, 2);
  assert.equal(doc.totals.shipped, 1); // one ✅
  assert.equal(doc.totals.ready, 3); // three ⏳ (Contribution E.0, E.1; Reading Audit)
  assert.equal(doc.totals.parked, 2);
  assert.equal(doc.totals.cut, 1);
});

test('parseRoadmap gives each section a stable id derived from its title', () => {
  const doc = parseRoadmap(FIXTURE, '2026-05-19T00:00:00.000Z');
  const ids = doc.sections.map(s => s.id);
  assert.ok(ids.includes('the-three-tracks'));
  assert.ok(ids.some(id => id.startsWith('track-contribution')));
  assert.ok(ids.some(id => id.startsWith('track-reading')));
});

test('parseRoadmap preserves section bodies including table markdown', () => {
  const doc = parseRoadmap(FIXTURE, '2026-05-19T00:00:00.000Z');
  const contribution = doc.sections.find(s => s.kind === 'track');
  assert.match(contribution?.bodyMarkdown ?? '', /E\.0/);
  assert.match(contribution?.bodyMarkdown ?? '', /Browser write API/);
});

test('parseRoadmap handles a doc with no sections gracefully', () => {
  const doc = parseRoadmap('# Roadmap\n\nNothing here yet.\n', '2026-05-19T00:00:00.000Z');
  assert.equal(doc.title, 'Roadmap');
  assert.equal(doc.sections.length, 0);
  assert.equal(doc.totals.tracks, 0);
});
