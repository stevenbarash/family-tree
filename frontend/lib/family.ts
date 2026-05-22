import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { buildFamilyBrowser, type BrowserPerson } from '@core/family/browser.ts';
import { computeCohort } from '@core/family/cohort.ts';
import { computeDescendants } from '@core/family/descendants.ts';
import { computeRelationship } from '@core/family/relationship.ts';
import { computeTimeline, type TimelineEntry, type TimelineView } from '@core/family/timeline.ts';
import { groupBirthplaces, type PlacesView } from '@core/family/places.ts';
import {
  joinCoords,
  parseCoordsYaml,
  type MappedPlace,
  type UnmappedPlace,
} from '@core/family/places-coords.ts';
import { loadConflicts, type ConflictEntry } from '@core/family/conflicts.ts';
import type { DerivedRecord, MediaRef } from '@core/gedcom/types.ts';
import { normalizeDerivedRecord } from '@core/gedcom/normalize.ts';
import { unstable_cache } from 'next/cache';
import { DERIVED_DIR, GENEALOGY_DIR, PLACES_COORDS_FILE, SELF_RECORD } from './env';
import { getCachedList } from './server-services';
import { correctRecords, getCachedPageCorrections } from './corrections.ts';

export interface TimelineEntryView extends TimelineEntry {
  portrait?: string;
  /** Right edge of the lifespan bar — same value `computeTimeline` used to
   *  derive `range.maxYear`, so bars cannot overshoot the visualization. */
  endYear: number;
}

export interface TimelineViewWithPortraits {
  entries: TimelineEntryView[];
  range: TimelineView['range'];
}

export interface BrowserPersonView extends BrowserPerson {
  slug?: string;
  portrait?: string;
}

export interface BrowserRelationView {
  record: string;
  name: string;
  detail: string | null;
  slug?: string;
  portrait?: string;
}

export interface BrowserSiblingView extends BrowserRelationView {
  kind: 'full' | 'half';
}

export interface BrowserCousinView extends BrowserRelationView {
  via: string;
}

export interface BrowserDescendantView extends BrowserRelationView {
  generation: number;
  via: string;
}

export interface CoverageGenerationView {
  generation: number;
  known: number;
  possible: number;
}

export interface ResearchFrontierView {
  record: string;
  name: string;
  generation: number;
  side: 'paternal' | 'maternal';
  slug?: string;
  portrait?: string;
  missing: 'father' | 'mother' | 'both';
}

export interface CoverageView {
  byGeneration: CoverageGenerationView[];
  knownTotal: number;
  possibleTotal: number;
  frontier: ResearchFrontierView[];
  /** Source-citation coverage across the known ancestors (P0.4).
   *  `cited` = ancestors whose `DerivedRecord.sources` is non-empty;
   *  `total` = `knownTotal`. Surfaces the source-coverage gap the
   *  2026-05-07 platform review flagged ("78% un-cited individuals is
   *  not a finished tree"). UI shows `cited`/`total` + percent so the
   *  gap is visible — the review's stated theory: "People will fix
   *  what they can see." */
  sourceCoverage: SourceCoverageView;
}

export interface SourceCoverageView {
  cited: number;
  total: number;
}

export interface FamilyOfOriginView {
  fam: string;
  pedigree?: 'adopted' | 'foster' | 'sealing';
  father?: BrowserRelationView;
  mother?: BrowserRelationView;
  siblings: BrowserRelationView[];
  marriedDate: string | null;
  marriedPlace: string | null;
}

/** A parent's marriage that isn't the focal person's family-of-origin —
 *  i.e. the focal person's step-family. Step-parent + half-siblings live
 *  here, in the genealogically correct unit, instead of being scattered. */
export interface StepFamilyView {
  fam: string;
  via: { record: string; name: string; role: 'father' | 'mother' };
  stepParent?: BrowserRelationView;
  halfSiblings: BrowserRelationView[];
  marriedDate: string | null;
  marriedPlace: string | null;
}

export interface MarriageView {
  fam: string;
  spouse?: BrowserRelationView;
  children: BrowserRelationView[];
  marriedDate: string | null;
  marriedPlace: string | null;
}

export interface FamilyTreeView {
  root: BrowserPersonView;
  selected: BrowserPersonView;
  byGeneration: {
    generation: number;
    paternal: BrowserPersonView[];
    maternal: BrowserPersonView[];
  }[];
  selectedRelations: {
    parents: BrowserRelationView[];
    spouses: BrowserRelationView[];
    children: BrowserRelationView[];
  };
  selectedFamilies: {
    familyOfOrigin: FamilyOfOriginView[];
    marriages: MarriageView[];
  };
  selectedStepFamilies: StepFamilyView[];
  /** Disagreeing-source records for the focal person. Sourced from
   *  `genealogy/conflicts/<record>.yml`; not derived from GEDCOM. */
  selectedConflicts: ConflictEntry[];
  selectedMedia: MediaRef[];
  cohort: {
    siblings: BrowserSiblingView[];
    cousins: BrowserCousinView[];
  };
  descendants: {
    byGeneration: { generation: number; people: BrowserDescendantView[] }[];
    total: number;
  };
  coverage: CoverageView;
  places: PlacesView;
  placesMap: { mapped: MappedPlace[]; unmapped: UnmappedPlace[] };
  timeline: TimelineViewWithPortraits;
  relationship: {
    label: string;
    kind: import('@core/family/relationship.ts').RelationshipKind;
    path: string[];
    crumbs: { record: string; name: string; slug?: string }[];
    perspective: { record: string; name: string; isMe: boolean };
  } | null;
}

const YEAR_RE = /\b(\d{4})\b/;

/** Normalize a wiki page title into its slug shape so we can match the
 *  recorded GEDCOM name against page titles when there's no explicit
 *  `gedcom.record` in the frontmatter. */
function slugifyName(name: string): string {
  return name.toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function loadDerivedRecordsForTree(derivedDir: string = DERIVED_DIR): Map<string, DerivedRecord> {
  const records = new Map<string, DerivedRecord>();
  let entries;
  try {
    entries = readdirSync(derivedDir, { withFileTypes: true });
  } catch {
    return records;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.yml')) continue;
    try {
      const raw = readFileSync(join(derivedDir, entry.name), 'utf-8');
      const record = normalizeDerivedRecord(yaml.load(raw));
      if (record) records.set(record.record, record);
    } catch {
      continue;
    }
  }
  return records;
}

const FILE_CACHE_TTL_MS = 2000;
/** Cap the research-frontier list so the panel doesn't sprawl. Closer
 *  generations are sorted first, so the cut keeps the most-actionable items. */
const RESEARCH_FRONTIER_LIMIT = 12;
let _derivedRecordsCache: { records: Map<string, DerivedRecord>; expiresAt: number; mtimeMs: number } | null = null;

let _coordsCache: { coords: ReturnType<typeof parseCoordsYaml>; expiresAt: number; mtimeMs: number } | null = null;
function getCachedCoords(): ReturnType<typeof parseCoordsYaml> {
  const now = Date.now();
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(PLACES_COORDS_FILE).mtimeMs;
  } catch {
    return [];
  }
  if (_coordsCache && _coordsCache.expiresAt > now && _coordsCache.mtimeMs === mtimeMs) {
    return _coordsCache.coords;
  }
  let coords: ReturnType<typeof parseCoordsYaml> = [];
  try {
    coords = parseCoordsYaml(readFileSync(PLACES_COORDS_FILE, 'utf-8'));
  } catch {}
  _coordsCache = { coords, expiresAt: now + FILE_CACHE_TTL_MS, mtimeMs };
  return coords;
}

export function getCachedDerivedRecords(): Map<string, DerivedRecord> {
  const now = Date.now();
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(DERIVED_DIR).mtimeMs;
  } catch {
    return new Map();
  }
  // Cache key is DERIVED_DIR mtime only; page-corrections changes in
  // pages/ are NOT detected here. Edits to a page's corrections[] become
  // visible after the cache TTL expires (FILE_CACHE_TTL_MS). Acceptable
  // for the dev-server use case; if a future plan needs immediate
  // visibility, add an mtime check on the pages dir to this guard.
  if (_derivedRecordsCache && _derivedRecordsCache.expiresAt > now && _derivedRecordsCache.mtimeMs === mtimeMs) {
    return _derivedRecordsCache.records;
  }
  const raw = loadDerivedRecordsForTree();
  const records = correctRecords(raw, getCachedPageCorrections());
  _derivedRecordsCache = { records, expiresAt: now + FILE_CACHE_TTL_MS, mtimeMs };
  return records;
}

interface PageJoinResult {
  slug?: string;
  portrait?: string;
}

async function buildPageJoin(): Promise<(record: string, name: string) => PageJoinResult> {
  const { list } = await getCachedList();
  const byRecord = new Map<string, PageJoinResult>();
  const byName = new Map<string, PageJoinResult>();
  for (const page of list) {
    if (page.isArchived) continue;
    const entry: PageJoinResult = { slug: page.slug, portrait: page.portrait };
    if (page.gedcomRecord) byRecord.set(page.gedcomRecord, entry);
    byName.set(slugifyName(page.title), entry);
  }
  return (record, name) => byRecord.get(record) ?? byName.get(slugifyName(name)) ?? {};
}

async function buildSlugJoin(): Promise<(record: string, name: string) => string | undefined> {
  const join = await buildPageJoin();
  return (record, name) => join(record, name).slug;
}

async function computeFamilyTree(
  rootRecord: string = SELF_RECORD,
  perspectiveRecord?: string | null,
): Promise<FamilyTreeView | null> {
  if (!/^I\d+$/.test(rootRecord)) return null;
  if (perspectiveRecord && !/^I\d+$/.test(perspectiveRecord)) return null;

  const records = getCachedDerivedRecords();
  const core = buildFamilyBrowser({ records, rootRecord, selectedRecord: rootRecord });
  if (!core) return null;

  const findPage = await buildPageJoin();
  const findSlug = (record: string, name: string) => findPage(record, name).slug;
  const enrich = (person: BrowserPerson): BrowserPersonView => {
    const page = findPage(person.record, person.name);
    return { ...person, slug: page.slug, portrait: page.portrait };
  };
  const relation = (r: { record: string; name: string }, detail: string | null): BrowserRelationView => {
    const page = findPage(r.record, r.name);
    return { record: r.record, name: r.name, detail, slug: page.slug, portrait: page.portrait };
  };

  // Cohort, descendants, timeline, places, and relationship are all anchored
  // on the page's root person — that's what the user is viewing.
  const targetRecord = rootRecord;

  // ─── Cohort (siblings + first cousins) ───
  const cohortRaw = computeCohort({ records, targetRecord });
  const siblings: BrowserSiblingView[] = cohortRaw.siblings.map(s => {
    const page = findPage(s.record, s.name);
    return {
      record: s.record,
      name: s.name,
      detail: yearLabel(s.birth?.date ?? null),
      slug: page.slug,
      portrait: page.portrait,
      kind: s.kind,
    };
  });
  const cousins: BrowserCousinView[] = cohortRaw.cousins.map(c => {
    const page = findPage(c.record, c.name);
    return {
      record: c.record,
      name: c.name,
      detail: yearLabel(c.birth?.date ?? null),
      slug: page.slug,
      portrait: page.portrait,
      via: c.via.parentName,
    };
  });

  // ─── Coverage (per-generation completeness + research frontier) ───
  const coverageByGen: CoverageGenerationView[] = core.byGeneration.map(group => {
    const possible = 2 ** group.generation;
    const known = group.paternal.length + group.maternal.length;
    return { generation: group.generation, known, possible };
  });
  const knownTotal = coverageByGen.reduce((s, g) => s + g.known, 0);
  const possibleTotal = coverageByGen.reduce((s, g) => s + g.possible, 0);

  // Source-citation coverage (P0.4). Count ancestors whose derived
  // record carries at least one source — `records` is the already-
  // loaded DerivedRecord map; no extra I/O.
  let citedCount = 0;
  for (const group of core.byGeneration) {
    for (const person of [...group.paternal, ...group.maternal]) {
      const rec = records.get(person.record);
      if (rec && rec.sources && rec.sources.length > 0) citedCount++;
    }
  }
  const sourceCoverage: SourceCoverageView = { cited: citedCount, total: knownTotal };

  const frontierAll: ResearchFrontierView[] = [];
  for (const group of core.byGeneration) {
    const consider = [
      ...group.paternal.map(p => ({ p, side: 'paternal' as const })),
      ...group.maternal.map(p => ({ p, side: 'maternal' as const })),
    ];
    for (const { p, side } of consider) {
      const rec = records.get(p.record);
      if (!rec) continue;
      const hasFather = rec.parents.some(r => r.role === 'father');
      const hasMother = rec.parents.some(r => r.role === 'mother');
      if (hasFather && hasMother) continue;
      const page = findPage(p.record, p.name);
      frontierAll.push({
        record: p.record,
        name: p.name,
        generation: p.generation,
        side,
        slug: page.slug,
        portrait: page.portrait,
        missing: !hasFather && !hasMother ? 'both' : (!hasFather ? 'father' : 'mother'),
      });
    }
  }
  frontierAll.sort((a, b) => a.generation - b.generation || a.name.localeCompare(b.name));
  const frontier = frontierAll.slice(0, RESEARCH_FRONTIER_LIMIT);

  // ─── Places (region grouping + map join via curated coords) ───
  const flatLineage = core.byGeneration.flatMap(g => [
    ...g.paternal.map(p => ({ record: p.record, name: p.name, generation: p.generation, side: 'paternal' as const })),
    ...g.maternal.map(p => ({ record: p.record, name: p.name, generation: p.generation, side: 'maternal' as const })),
  ]);
  const placesEntries = [
    { record: targetRecord, name: records.get(targetRecord)?.name ?? '', place: records.get(targetRecord)?.birth?.place ?? null },
    ...flatLineage.map(p => ({ record: p.record, name: p.name, place: records.get(p.record)?.birth?.place ?? null })),
  ];
  const places = groupBirthplaces({ entries: placesEntries });
  const placesPeople = placesEntries
    .filter(e => e.place !== null && e.place.trim() !== '')
    .map(e => ({ record: e.record, name: e.name, place: e.place as string }));
  const placesMap = joinCoords({ coords: getCachedCoords(), people: placesPeople });

  // ─── Timeline (lifespans across the lineage) ───
  const timelineRaw = computeTimeline({ records, self: targetRecord, lineage: flatLineage });
  const timeline: TimelineViewWithPortraits = {
    range: timelineRaw.range,
    entries: timelineRaw.entries.map(e => ({
      ...e,
      portrait: findPage(e.record, e.name).portrait,
    })),
  };

  // ─── Descendants + relationship-to-perspective ───
  const descendantsRaw = computeDescendants({ records, rootRecord: targetRecord });

  const fromRecord = perspectiveRecord ?? SELF_RECORD;
  const relationship = computeRelationshipFromPerspective(records, targetRecord, fromRecord, findPage);
  const descendantsByGen = descendantsRaw.byGeneration.map(g => ({
    generation: g.generation,
    people: g.people.map(p => {
      const page = findPage(p.record, p.name);
      return {
        record: p.record,
        name: p.name,
        detail: yearLabel(p.birth?.date ?? null),
        slug: page.slug,
        portrait: page.portrait,
        generation: p.generation,
        via: p.via.parentName,
      } satisfies BrowserDescendantView;
    }),
  }));

  return {
    root: enrich(core.root),
    selected: enrich(core.selected),
    byGeneration: core.byGeneration.map(group => ({
      generation: group.generation,
      paternal: group.paternal.map(enrich),
      maternal: group.maternal.map(enrich),
    })),
    selectedRelations: {
      parents: core.selectedRelations.parents.map(r => relation(r, r.role)),
      spouses: core.selectedRelations.spouses.map(r => relation(r, r.married ? `m. ${r.married}` : null)),
      children: core.selectedRelations.children.map(r => relation(r, r.born ? `b. ${r.born}` : null)),
    },
    selectedFamilies: buildSelectedFamilies(records.get(targetRecord), relation),
    selectedStepFamilies: buildStepFamilies(records.get(targetRecord), records, relation),
    selectedConflicts: loadConflicts(GENEALOGY_DIR, targetRecord),
    selectedMedia: records.get(targetRecord)?.media ?? [],
    cohort: { siblings, cousins },
    descendants: { byGeneration: descendantsByGen, total: descendantsRaw.total },
    coverage: { byGeneration: coverageByGen, knownTotal, possibleTotal, frontier, sourceCoverage },
    places,
    placesMap,
    timeline,
    relationship,
  };
}

/**
 * Cached wrapper around `computeFamilyTree`. The family-graph traversal +
 * GEDCOM file joins are expensive and identical for every reader of a
 * given (rootRecord, perspective) pair, so the result is memoised across
 * requests. Invalidated by the `gedcom` tag — GEDCOM-mutating API routes
 * call `revalidateTag('gedcom', 'max')` — and, as a backstop for background
 * git-sync pulls, after `revalidate` seconds. 60s ≈ the sync cadence.
 */
export const getFamilyTree = unstable_cache(
  computeFamilyTree,
  ['family-tree'],
  { tags: ['gedcom'], revalidate: 60 },
);

type RelationEnricher = (
  r: { record: string; name: string; born?: string | null },
  detail: string | null,
) => BrowserRelationView;

function buildSelectedFamilies(
  selected: DerivedRecord | undefined,
  enrich: RelationEnricher,
): FamilyTreeView['selectedFamilies'] {
  if (!selected) return { familyOfOrigin: [], marriages: [] };
  const memberDetail = (m: { born?: string | null }): string | null =>
    m.born ? `b. ${m.born}` : null;

  const familyOfOrigin: FamilyOfOriginView[] = selected.familyOfOrigin.map(foo => ({
    fam: foo.fam,
    pedigree: foo.pedigree,
    father: foo.father ? enrich(foo.father, null) : undefined,
    mother: foo.mother ? enrich(foo.mother, null) : undefined,
    siblings: foo.siblings.map(s => enrich(s, memberDetail(s))),
    marriedDate: foo.marriedDate,
    marriedPlace: foo.marriedPlace,
  }));

  const marriages: MarriageView[] = selected.marriages.map(m => ({
    fam: m.fam,
    spouse: m.spouse ? enrich(m.spouse, null) : undefined,
    children: m.children.map(c => enrich(c, memberDetail(c))),
    marriedDate: m.marriedDate,
    marriedPlace: m.marriedPlace,
  }));

  return { familyOfOrigin, marriages };
}

function buildStepFamilies(
  selected: DerivedRecord | undefined,
  records: Map<string, DerivedRecord>,
  enrich: RelationEnricher,
): StepFamilyView[] {
  if (!selected) return [];
  // The focal person's own families-of-origin — we want each parent's
  // OTHER marriages, not the one they had together with the other focal-parent.
  const focalFamIds = new Set(selected.familyOfOrigin.map(f => f.fam));
  const out: StepFamilyView[] = [];
  for (const parent of selected.parents) {
    const parentRec = records.get(parent.record);
    if (!parentRec) continue;
    for (const m of parentRec.marriages) {
      if (focalFamIds.has(m.fam)) continue;
      out.push({
        fam: m.fam,
        via: { record: parent.record, name: parent.name, role: parent.role },
        stepParent: m.spouse ? enrich(m.spouse, null) : undefined,
        halfSiblings: m.children.map(c => enrich(c, c.born ? `b. ${c.born}` : null)),
        marriedDate: m.marriedDate,
        marriedPlace: m.marriedPlace,
      });
    }
  }
  return out;
}

function computeRelationshipFromPerspective(
  records: Map<string, DerivedRecord>,
  targetRecord: string,
  fromRecord: string,
  findPage: (record: string, name: string) => { slug?: string; portrait?: string },
): FamilyTreeView['relationship'] {
  if (targetRecord === fromRecord) return null;
  const rel = computeRelationship({ records, fromRecord, toRecord: targetRecord });
  if (!rel) return null;
  const fromRec = records.get(fromRecord);
  const crumbs = rel.path.map(record => {
    const rec = records.get(record);
    const name = rec?.name ?? record;
    return { record, name, slug: findPage(record, name).slug };
  });
  return {
    label: rel.label,
    kind: rel.kind,
    path: rel.path,
    crumbs,
    perspective: {
      record: fromRecord,
      name: fromRec?.name ?? 'me',
      isMe: fromRecord === SELF_RECORD,
    },
  };
}

function yearLabel(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(YEAR_RE);
  return m ? `b. ${m[1]}` : null;
}
