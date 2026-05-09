import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derivePrivacy } from '../../src/gedcom/derive.ts';
import { PRIVACY_LIVING_THRESHOLD_YEARS, type GedcomNode, type DatedEvent } from '../../src/gedcom/types.ts';

const TODAY = new Date('2026-05-09T00:00:00Z');

function indi(children: Array<{ tag: string; data?: string }> = []): GedcomNode {
  return {
    tag: 'INDI',
    pointer: '@I1@',
    tree: children.map(c => ({ tag: c.tag, data: c.data, tree: [] })),
  };
}

function event(date: string | null, place: string | null = null): DatedEvent {
  return { date, place };
}

test('derivePrivacy: clean record with no signal → not restricted', () => {
  const p = derivePrivacy(indi(), null, null, TODAY);
  assert.deepEqual(p, { restricted: false, reason: 'none' });
});

test('derivePrivacy: RESN privacy → restricted with explicit reason', () => {
  const p = derivePrivacy(indi([{ tag: 'RESN', data: 'privacy' }]), null, null, TODAY);
  assert.deepEqual(p, { restricted: true, reason: 'gedcom-resn-privacy' });
});

test('derivePrivacy: RESN confidential → restricted', () => {
  const p = derivePrivacy(indi([{ tag: 'RESN', data: 'confidential' }]), null, null, TODAY);
  assert.equal(p.reason, 'gedcom-resn-confidential');
});

test('derivePrivacy: RESN locked → restricted', () => {
  const p = derivePrivacy(indi([{ tag: 'RESN', data: 'locked' }]), null, null, TODAY);
  assert.equal(p.reason, 'gedcom-resn-locked');
});

test('derivePrivacy: RESN with unknown value (e.g. "internal") → not restricted', () => {
  const p = derivePrivacy(indi([{ tag: 'RESN', data: 'internal' }]), null, null, TODAY);
  assert.equal(p.restricted, false);
});

test('derivePrivacy: RESN matched case-insensitively', () => {
  const p = derivePrivacy(indi([{ tag: 'RESN', data: 'PRIVACY' }]), null, null, TODAY);
  assert.equal(p.restricted, true);
});

test('derivePrivacy: any death event → not restricted (regardless of birth)', () => {
  // Recent birth would otherwise trigger heuristic, but death overrides.
  const p = derivePrivacy(indi(), event('2000'), event('2024'), TODAY);
  assert.deepEqual(p, { restricted: false, reason: 'none' });
});

test('derivePrivacy: death with only place (no date) still counts as deceased', () => {
  const p = derivePrivacy(indi(), event('2000'), event(null, 'Boston, MA'), TODAY);
  assert.equal(p.restricted, false);
});

test('derivePrivacy: birth within threshold + no death → restricted via heuristic', () => {
  const recentYear = TODAY.getFullYear() - 30;
  const p = derivePrivacy(indi(), event(String(recentYear)), null, TODAY);
  assert.deepEqual(p, { restricted: true, reason: 'living-heuristic' });
});

test('derivePrivacy: birth older than threshold + no death → not restricted (heuristic-deceased)', () => {
  const oldYear = TODAY.getFullYear() - PRIVACY_LIVING_THRESHOLD_YEARS - 5;
  const p = derivePrivacy(indi(), event(String(oldYear)), null, TODAY);
  assert.equal(p.restricted, false);
});

test('derivePrivacy: birth exactly at threshold → restricted (≤, inclusive)', () => {
  const yearAtBoundary = TODAY.getFullYear() - PRIVACY_LIVING_THRESHOLD_YEARS;
  const p = derivePrivacy(indi(), event(String(yearAtBoundary)), null, TODAY);
  assert.equal(p.restricted, true);
});

test('derivePrivacy: birth one year past threshold → not restricted', () => {
  const yearPastBoundary = TODAY.getFullYear() - PRIVACY_LIVING_THRESHOLD_YEARS - 1;
  const p = derivePrivacy(indi(), event(String(yearPastBoundary)), null, TODAY);
  assert.equal(p.restricted, false);
});

test('derivePrivacy: BET 1900 AND 1925 (latest possible 1925) → restricted in 2026 (101 years old upper bound)', () => {
  const p = derivePrivacy(indi(), event('Bet 1900 And 1925'), null, TODAY);
  // Upper bound is 1925; 2026 - 1925 = 101 ≤ 110 → restricted
  assert.equal(p.restricted, true);
  assert.equal(p.reason, 'living-heuristic');
});

test('derivePrivacy: BET 1850 AND 1900 (upper bound 1900) → not restricted (> 110 years)', () => {
  const p = derivePrivacy(indi(), event('Bet 1850 And 1900'), null, TODAY);
  assert.equal(p.restricted, false);
});

test('derivePrivacy: AFT 1990 (open upper bound) → restricted', () => {
  const p = derivePrivacy(indi(), event('Aft 1990'), null, TODAY);
  assert.equal(p.restricted, true);
});

test('derivePrivacy: BEF 1900 (max year 1900) → not restricted', () => {
  const p = derivePrivacy(indi(), event('Bef 1900'), null, TODAY);
  assert.equal(p.restricted, false);
});

test('derivePrivacy: ABT 1880 → not restricted', () => {
  const p = derivePrivacy(indi(), event('Abt 1880'), null, TODAY);
  assert.equal(p.restricted, false);
});

test('derivePrivacy: birth date with day/month parses to year correctly', () => {
  const recentYear = TODAY.getFullYear() - 25;
  const p = derivePrivacy(indi(), event(`28 Feb ${recentYear}`), null, TODAY);
  assert.equal(p.restricted, true);
});

test('derivePrivacy: birth date with no parseable year + no death → not restricted (no signal)', () => {
  // parseGedcomYear is liberal — any 4-digit number is treated as a year. So
  // strings like "mid-1990s" still resolve. Strings without any 4-digit
  // sequence (here: "unknown") are the truly-unparseable case.
  const p = derivePrivacy(indi(), event('unknown'), null, TODAY);
  assert.equal(p.restricted, false);
});

test('derivePrivacy: loose date string with embedded year → uses extracted year (errs toward restricting)', () => {
  // "mid-1990s" parses to 1990 via the fallback \d{4} match. Privacy is
  // intentionally conservative: prefer false-positive (restrict an obscure
  // ancestor) over false-negative (expose a living person).
  const p = derivePrivacy(indi(), event('mid-1990s'), null, TODAY);
  assert.equal(p.restricted, true);
});

test('derivePrivacy: birth-place only, no date → not restricted', () => {
  const p = derivePrivacy(indi(), event(null, 'Pittsburgh, PA'), null, TODAY);
  assert.equal(p.restricted, false);
});

test('derivePrivacy: RESN beats living heuristic when both apply', () => {
  // A still-living person with explicit RESN should keep the explicit reason
  // (more specific than the heuristic — useful for downstream messaging).
  const recentYear = TODAY.getFullYear() - 10;
  const p = derivePrivacy(
    indi([{ tag: 'RESN', data: 'privacy' }]),
    event(String(recentYear)),
    null,
    TODAY,
  );
  assert.equal(p.reason, 'gedcom-resn-privacy');
});
