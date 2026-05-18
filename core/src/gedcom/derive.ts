import {
  PEDIGREE_VALUES,
  PRIVACY_LIVING_THRESHOLD_YEARS,
  type GedcomNode,
  type DerivedRecord,
  type DatedEvent,
  type ParentRef,
  type ResidenceEvent,
  type OccupationEvent,
  type SourceRef,
  type FamilyMemberRef,
  type FamilyOfOriginEntry,
  type MarriageEntry,
  type PedigreeKind,
  type MediaRef,
  type Privacy,
  type Sex,
} from './types.ts';
import { stripPointer, type ParseResult } from './parser.ts';
import { parseDerivedRecord } from './schema.ts';
import { parseGedcomYear } from '../family/dates.ts';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import yaml from 'js-yaml';

function deriveParents(node: GedcomNode, ctx: ParseResult): ParentRef[] {
  const out: ParentRef[] = [];
  for (const famc of node.tree.filter(n => n.tag === 'FAMC')) {
    const famPointer = stripPointer(famc.data ?? '');
    const fam = ctx.families.get(famPointer);
    if (!fam) continue;
    for (const tag of ['HUSB', 'WIFE'] as const) {
      const link = fam.tree.find(n => n.tag === tag);
      if (!link?.data) continue;
      const parentRecord = stripPointer(link.data);
      const parent = ctx.individuals.get(parentRecord);
      if (!parent) continue;
      out.push({
        record: parentRecord,
        name: deriveName(parent),
        role: tag === 'HUSB' ? 'father' : 'mother',
      });
    }
  }
  return out;
}

function deriveSpousesAndChildren(
  node: GedcomNode,
  selfRecord: string,
  ctx: ParseResult,
): Pick<DerivedRecord, 'spouses' | 'children'> {
  const spouses: DerivedRecord['spouses'] = [];
  const children: DerivedRecord['children'] = [];

  for (const fams of node.tree.filter(n => n.tag === 'FAMS')) {
    const famPointer = stripPointer(fams.data ?? '');
    const fam = ctx.families.get(famPointer);
    if (!fam) continue;
    const married = deriveDatedEvent(fam, 'MARR')?.date ?? null;

    for (const tag of ['HUSB', 'WIFE'] as const) {
      const link = fam.tree.find(n => n.tag === tag);
      if (!link?.data) continue;
      const partnerRecord = stripPointer(link.data);
      if (partnerRecord === selfRecord) continue;
      const partner = ctx.individuals.get(partnerRecord);
      if (!partner) continue;
      spouses.push({ record: partnerRecord, name: deriveName(partner), married });
    }

    for (const chil of fam.tree.filter(n => n.tag === 'CHIL')) {
      const childRecord = stripPointer(chil.data ?? '');
      const child = ctx.individuals.get(childRecord);
      if (!child) continue;
      const born = readDateValue(child.tree.find(n => n.tag === 'BIRT')?.tree.find(n => n.tag === 'DATE'));
      children.push({ record: childRecord, name: deriveName(child), born });
    }
  }

  return { spouses, children };
}

function deriveResidences(node: GedcomNode): ResidenceEvent[] {
  return node.tree
    .filter(n => n.tag === 'RESI')
    .map(resi => ({
      date: readDateValue(resi.tree.find(n => n.tag === 'DATE')),
      place: resi.tree.find(n => n.tag === 'PLAC')?.data?.trim() || null,
    }))
    .filter(r => r.date || r.place);
}

function deriveOccupations(node: GedcomNode): OccupationEvent[] {
  return node.tree
    .filter(n => n.tag === 'OCCU')
    .map(occu => ({
      title: (occu.data ?? '').trim(),
      date: readDateValue(occu.tree.find(n => n.tag === 'DATE')),
    }))
    .filter(o => o.title);
}

function memberRef(record: string, ind: GedcomNode, includeBorn: boolean): FamilyMemberRef {
  const ref: FamilyMemberRef = { record, name: deriveName(ind) };
  if (includeBorn) {
    ref.born = readDateValue(ind.tree.find(n => n.tag === 'BIRT')?.tree.find(n => n.tag === 'DATE'));
  }
  return ref;
}

function deriveFamilyOfOrigin(node: GedcomNode, selfRecord: string, ctx: ParseResult): FamilyOfOriginEntry[] {
  const out: FamilyOfOriginEntry[] = [];
  for (const famc of node.tree.filter(n => n.tag === 'FAMC')) {
    if (!famc.data) continue;
    const famPointer = stripPointer(famc.data);
    const fam = ctx.families.get(famPointer);
    if (!fam) continue;
    const marr = deriveDatedEvent(fam, 'MARR');
    const entry: FamilyOfOriginEntry = {
      fam: famPointer,
      siblings: [],
      marriedDate: marr?.date ?? null,
      marriedPlace: marr?.place ?? null,
    };
    const pedi = famc.tree.find(n => n.tag === 'PEDI')?.data?.trim().toLowerCase();
    if (pedi && (PEDIGREE_VALUES as readonly string[]).includes(pedi)) {
      entry.pedigree = pedi as PedigreeKind;
    }
    const husb = fam.tree.find(n => n.tag === 'HUSB');
    if (husb?.data) {
      const recId = stripPointer(husb.data);
      const ind = ctx.individuals.get(recId);
      if (ind) entry.father = memberRef(recId, ind, false);
    }
    const wife = fam.tree.find(n => n.tag === 'WIFE');
    if (wife?.data) {
      const recId = stripPointer(wife.data);
      const ind = ctx.individuals.get(recId);
      if (ind) entry.mother = memberRef(recId, ind, false);
    }
    for (const chil of fam.tree.filter(n => n.tag === 'CHIL')) {
      if (!chil.data) continue;
      const recId = stripPointer(chil.data);
      if (recId === selfRecord) continue;
      const ind = ctx.individuals.get(recId);
      if (!ind) continue;
      entry.siblings.push(memberRef(recId, ind, true));
    }
    out.push(entry);
  }
  return out;
}

function deriveMarriages(node: GedcomNode, selfRecord: string, ctx: ParseResult): MarriageEntry[] {
  const out: MarriageEntry[] = [];
  for (const fams of node.tree.filter(n => n.tag === 'FAMS')) {
    if (!fams.data) continue;
    const famPointer = stripPointer(fams.data);
    const fam = ctx.families.get(famPointer);
    if (!fam) continue;
    const marr = deriveDatedEvent(fam, 'MARR');
    const entry: MarriageEntry = {
      fam: famPointer,
      children: [],
      marriedDate: marr?.date ?? null,
      marriedPlace: marr?.place ?? null,
    };
    for (const tag of ['HUSB', 'WIFE'] as const) {
      const link = fam.tree.find(n => n.tag === tag);
      if (!link?.data) continue;
      const recId = stripPointer(link.data);
      if (recId === selfRecord) continue;
      const ind = ctx.individuals.get(recId);
      if (ind) entry.spouse = memberRef(recId, ind, false);
    }
    for (const chil of fam.tree.filter(n => n.tag === 'CHIL')) {
      if (!chil.data) continue;
      const recId = stripPointer(chil.data);
      const ind = ctx.individuals.get(recId);
      if (!ind) continue;
      entry.children.push(memberRef(recId, ind, true));
    }
    out.push(entry);
  }
  return out;
}

function deriveSourceRef(pointer: string, sources: Map<string, GedcomNode>): SourceRef {
  const record = stripPointer(pointer);
  const sourceNode = sources.get(record);
  if (!sourceNode) return { record };
  const ref: SourceRef = { record };
  const get = (tag: string): string | undefined =>
    sourceNode.tree.find(n => n.tag === tag)?.data?.trim() || undefined;
  const title = get('TITL');
  if (title) ref.title = title;
  const author = get('AUTH');
  if (author) ref.author = author;
  const publisher = get('PUBL');
  if (publisher) ref.publisher = publisher;
  // GEDCOM 7 uses the standard EXID tag for what 5.5.1 expressed via the
  // Ancestry-specific _APID vendor extension. Both shapes can appear; prefer
  // EXID (v7) if present, fall back to _APID (5.5.1 legacy).
  const apid = get('EXID') ?? get('_APID');
  if (apid) ref.apid = apid;
  const note = get('NOTE');
  if (note) ref.note = note;
  return ref;
}

/** Resolve an OBJE pointer + the citing INDI's local node (which may carry
 *  `_PRIM Y`) into a denormalized MediaRef. Walks both the OBJE-level and
 *  FILE-level subtrees for FORM and TITL because GEDCOM exporters disagree
 *  about which depth those tags live at. */
function deriveMediaRef(
  pointerSrc: GedcomNode,
  mediaMap: Map<string, GedcomNode>,
): MediaRef | null {
  if (!pointerSrc.data) return null;
  const record = stripPointer(pointerSrc.data);
  const objeNode = mediaMap.get(record);
  const ref: MediaRef = { record };
  if (pointerSrc.tree.find(n => n.tag === '_PRIM')?.data?.trim().toUpperCase() === 'Y') {
    ref.primary = true;
  }
  if (!objeNode) return ref;
  const fileNode = objeNode.tree.find(n => n.tag === 'FILE');
  const file = fileNode?.data?.trim();
  if (file) ref.file = file;
  const findUnder = (parent: GedcomNode | undefined, tag: string): string | undefined =>
    parent?.tree.find(n => n.tag === tag)?.data?.trim() || undefined;
  const form = findUnder(fileNode, 'FORM') ?? findUnder(objeNode, 'FORM');
  if (form) ref.form = form;
  const title = findUnder(fileNode, 'TITL') ?? findUnder(objeNode, 'TITL');
  if (title) ref.title = title;
  const oid = findUnder(objeNode, '_OID');
  if (oid) ref.oid = oid;
  return ref;
}

function deriveMedia(node: GedcomNode, ctx: ParseResult): MediaRef[] {
  const out: MediaRef[] = [];
  for (const obje of node.tree.filter(n => n.tag === 'OBJE')) {
    const ref = deriveMediaRef(obje, ctx.media);
    if (ref) out.push(ref);
  }
  return out;
}

function deriveSources(node: GedcomNode, ctx: ParseResult): SourceRef[] {
  return node.tree
    .filter(n => n.tag === 'SOUR' && n.data)
    .map(s => deriveSourceRef(s.data!, ctx.sources));
}

/** Read the GEDCOM `1 SEX X` tag. Returns 'U' when absent, unparseable, or
 *  any value other than M/F. If multiple SEX lines appear on one individual
 *  (data hygiene issue), the FIRST is used and the rest ignored — matches
 *  how readers behave when faced with duplicate single-cardinality tags. */
export function deriveSex(node: GedcomNode): Sex {
  const sex = node.tree.find(n => n.tag === 'SEX');
  if (!sex?.data) return 'U';
  const value = sex.data.trim().toUpperCase();
  if (value === 'M' || value === 'F') return value;
  return 'U';
}

export function deriveIndividual(
  node: GedcomNode,
  record: string,
  ctx: ParseResult,
  today: Date = new Date(),
): DerivedRecord {
  const sc = deriveSpousesAndChildren(node, record, ctx);
  const birth = deriveDatedEvent(node, 'BIRT');
  const death = deriveDatedEvent(node, 'DEAT');
  const nameTranslations = deriveNameTranslations(node);
  return {
    record,
    name: deriveName(node),
    sex: deriveSex(node),
    ...(Object.keys(nameTranslations).length > 0 ? { nameTranslations } : {}),
    birth,
    death,
    parents: deriveParents(node, ctx),
    spouses: sc.spouses,
    children: sc.children,
    familyOfOrigin: deriveFamilyOfOrigin(node, record, ctx),
    marriages: deriveMarriages(node, record, ctx),
    residences: deriveResidences(node),
    occupations: deriveOccupations(node),
    sources: deriveSources(node, ctx),
    media: deriveMedia(node, ctx),
    privacy: derivePrivacy(node, birth, death, today),
  };
}

/**
 * Privacy classification:
 *   1. RESN tag with privacy/confidential/locked → restricted (explicit).
 *   2. A death event (any date or place) → not restricted (clearly deceased).
 *   3. Birth year parses and the *latest* possible year is within
 *      PRIVACY_LIVING_THRESHOLD_YEARS of `today` → restricted (heuristic).
 *      Latest-possible matters for `BET 1900 AND 1925` and `AFT 1990`:
 *      these could resolve to a still-living person, so err toward locked.
 *   4. Otherwise → not restricted.
 *
 * Note that the heuristic only flags individuals where there's enough info
 * to *suspect* they're living. Records with no birth and no death stay
 * unrestricted (the dataset is full of distant ancestors with neither).
 * The user can always add `RESN privacy` to the GEDCOM for an explicit
 * override.
 */
export function derivePrivacy(
  node: GedcomNode,
  birth: DatedEvent | null,
  death: DatedEvent | null,
  today: Date,
): Privacy {
  const resn = node.tree.find(n => n.tag === 'RESN');
  if (resn?.data) {
    const v = resn.data.trim().toLowerCase();
    if (v === 'privacy' || v === 'confidential' || v === 'locked') {
      return { restricted: true, reason: `gedcom-resn-${v}` };
    }
  }
  if (death) return { restricted: false, reason: 'none' };
  if (!birth?.date) return { restricted: false, reason: 'none' };
  const bounds = birthYearBounds(birth.date);
  if (!bounds) return { restricted: false, reason: 'none' };
  const ageAtMin = today.getFullYear() - bounds.max;
  if (ageAtMin <= PRIVACY_LIVING_THRESHOLD_YEARS) {
    return { restricted: true, reason: 'living-heuristic' };
  }
  return { restricted: false, reason: 'none' };
}

interface YearBounds { min: number; max: number; }

function birthYearBounds(date: string): YearBounds | null {
  const between = date.trim().toUpperCase().match(/^BET(?:WEEN)?\s+(\d{4})\s+AND\s+(\d{4})$/);
  if (between) return { min: Number(between[1]), max: Number(between[2]) };
  const parsed = parseGedcomYear(date);
  if (!parsed) return null;
  if (parsed.qualifier === 'before') return { min: -Infinity, max: parsed.year };
  if (parsed.qualifier === 'after') return { min: parsed.year, max: Infinity };
  return { min: parsed.year, max: parsed.year };
}

function deriveName(node: GedcomNode): string {
  const nameNode = node.tree.find(n => n.tag === 'NAME');
  if (!nameNode?.data) return '';
  return nameNode.data.replace(/\//g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Extract NAME.TRAN substructures (GEDCOM 7 feature). Returns a map of
 * BCP 47 locale → translated name string, gathered from the FIRST NAME
 * block on this individual. Used by the translation pipeline as a
 * first-choice translation source so per-language names live once in the
 * GEDCOM rather than being re-derived per article.
 *
 * Empty map if there's no NAME, no TRANs, or TRANs lack LANG (LANG is
 * required by spec — drop ones without it so we don't conflate locales).
 */
export function deriveNameTranslations(node: GedcomNode): Record<string, string> {
  const out: Record<string, string> = {};
  const nameNode = node.tree.find(n => n.tag === 'NAME');
  if (!nameNode) return out;
  for (const tran of nameNode.tree.filter(n => n.tag === 'TRAN')) {
    const lang = tran.tree.find(n => n.tag === 'LANG')?.data?.trim();
    const value = tran.data?.trim();
    if (!lang || !value) continue;
    out[lang] = value;
  }
  return out;
}

function deriveDatedEvent(node: GedcomNode, tag: string): DatedEvent | null {
  const eventNode = node.tree.find(n => n.tag === tag);
  if (!eventNode) return null;
  const dateNode = eventNode.tree.find(n => n.tag === 'DATE');
  const placeNode = eventNode.tree.find(n => n.tag === 'PLAC');
  const date = readDateValue(dateNode);
  const place = placeNode?.data?.trim() || null;
  if (!date && !place) return null;
  return { date, place };
}

/**
 * Read the displayable value of a DATE node. In GEDCOM 5.5.1, DATE.data holds
 * the date string directly (which often included non-canonical forms like
 * year-ranges "1995-2020" or month names in mixed case "5 May 2001"). The
 * gedcom7code/c-converter normalizes those into canonical DATE + a PHRASE
 * substructure that preserves the original. Prefer PHRASE when present so we
 * keep the human-meaningful original wording; fall back to DATE otherwise.
 *
 * Examples (after v7 conversion):
 *   2 DATE 2017               → "2017"
 *   3 PHRASE 2017-2020        → "2017-2020"  ← preferred
 *
 *   2 DATE 5 MAY 2001         → "5 MAY 2001"  ← no PHRASE, use DATE
 */
export function readDateValue(dateNode: GedcomNode | undefined): string | null {
  if (!dateNode) return null;
  const phrase = dateNode.tree.find(n => n.tag === 'PHRASE')?.data?.trim();
  if (phrase) return phrase;
  return dateNode.data?.trim() || null;
}

/**
 * Validate `derived` against the schema and return the canonical YAML form
 * the writer would put on disk. Exported so callers that want to compare
 * what's on disk to what they're about to write (e.g. `sync.ts` diff)
 * produce byte-identical text — comparing raw vs. parsed records would
 * spuriously flag every record as "changed" whenever Zod normalizes the
 * shape (e.g. fills a missing array, drops an unknown field).
 *
 * Throws if the deriver produced an invalid record — that's a bug in
 * the deriver, not bad data to ship to disk.
 */
export function serializeDerivedRecord(derived: DerivedRecord): string {
  const parsed = parseDerivedRecord(derived);
  if (!parsed.ok) {
    throw new Error(`deriver produced invalid DerivedRecord for ${derived.record}: ${parsed.error}`);
  }
  return yaml.dump(parsed.data, { lineWidth: 200, sortKeys: false, noRefs: true });
}

export async function writeDerivedYaml(derivedDir: string, derived: DerivedRecord): Promise<string> {
  const text = serializeDerivedRecord(derived);
  mkdirSync(derivedDir, { recursive: true });
  const path = join(derivedDir, `${derived.record}.yml`);
  writeFileSync(path, text);
  return path;
}

export async function hashGedcomFile(path: string): Promise<string> {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
