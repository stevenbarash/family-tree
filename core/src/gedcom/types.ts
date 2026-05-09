/** Internal parsed-tree types from parse-gedcom (the npm package). */
export interface GedcomNode {
  tag: string;
  pointer?: string;       // "@I123@" on top-level records
  data?: string;          // raw value (line tail)
  tree: GedcomNode[];     // children
}

/** Reference to another individual by GEDCOM record id. */
export interface IndividualRef {
  record: string;         // "I123" (without surrounding @)
  name: string;
}

/** Like IndividualRef but tagged with which side of a marriage they were on
 *  in the parent family record. Used for parents[] in a DerivedRecord. */
export interface ParentRef extends IndividualRef {
  role: 'father' | 'mother';
}

/** A dated event such as BIRT, DEAT, MARR. Date and place are both optional. */
export interface DatedEvent {
  date: string | null;          // raw GEDCOM DATE value, e.g. "12 JAN 1950" or "ABT 1880"
  place: string | null;
}

/** RESI event — when/where someone lived. */
export interface ResidenceEvent extends DatedEvent {}

/** OCCU event — occupation, with optional date range. */
export interface OccupationEvent {
  title: string;
  date: string | null;
}

/** Media reference — pointer to an OBJE record with denormalized metadata.
 *  GEDCOM 5.5.1 places FORM/TITL inside FILE (level 2), but exporters vary
 *  (Ancestry puts them under FILE; some put them at OBJE level). The deriver
 *  searches both depths so the resulting `MediaRef` is uniform. */
export interface MediaRef {
  record: string;            // "O41"
  title?: string;            // OBJE > FILE > TITL or OBJE > TITL
  form?: string;             // file format, e.g. "jpg"
  file?: string;             // file path, when present
  oid?: string;              // Ancestry custom _OID (permalink)
  primary?: boolean;         // _PRIM Y on the INDI's OBJE pointer
}

/** Source citation — pointer to a SOUR record, with denormalized metadata
 *  joined from the standalone SOUR record at derive time. Optional fields
 *  are absent when the SOUR record carries no value for that tag, or when
 *  the cited pointer has no matching top-level SOUR record (orphan ref). */
export interface SourceRef {
  record: string;         // "S1"
  title?: string;         // TITL — e.g. "U.S., Public Records Index, 1950-1993"
  author?: string;        // AUTH
  publisher?: string;     // PUBL
  apid?: string;          // _APID — Ancestry permalink ID, e.g. "1,62209::0"
  note?: string;          // NOTE — leading note line on the SOUR record
}

/** A person identified inside a family unit — like IndividualRef but with
 *  optional birth date for child entries. */
export interface FamilyMemberRef {
  record: string;
  name: string;
  born?: string | null;
}

/** Non-default GEDCOM PEDI values we surface (the omitted default is `birth`). */
export const PEDIGREE_VALUES = ['adopted', 'foster', 'sealing'] as const;
export type PedigreeKind = typeof PEDIGREE_VALUES[number];

/** The selected person's family of origin — one entry per FAMC pointer.
 *  Almost always 1; can be 2+ in adoption scenarios where a person is
 *  child in multiple families (e.g. birth family + adoptive family). */
export interface FamilyOfOriginEntry {
  fam: string;                          // "F1"
  /** Pedigree linkage type (GEDCOM PEDI under FAMC). Omitted means birth. */
  pedigree?: PedigreeKind;
  father?: FamilyMemberRef;
  mother?: FamilyMemberRef;
  siblings: FamilyMemberRef[];          // children in this FAM, excluding self
  marriedDate: string | null;           // FAM > MARR > DATE (the parents' wedding)
  marriedPlace: string | null;          // FAM > MARR > PLAC
}

/** The selected person's family unit as a spouse — one entry per FAMS
 *  pointer. Multiple marriages render as multiple entries. The unit may
 *  exist without a MARR event (children but no recorded wedding). */
export interface MarriageEntry {
  fam: string;
  spouse?: FamilyMemberRef;
  children: FamilyMemberRef[];
  marriedDate: string | null;
  marriedPlace: string | null;
}

/** Privacy classification for an individual. Set by the deriver from the
 *  GEDCOM `RESN` tag and a "no death + recent birth" living-person heuristic.
 *  Downstream surfaces (search index, export, article renderer) gate on
 *  `restricted` to keep living-person details out of indices and exports.
 *
 *  `reason` values:
 *    - `none` — not restricted
 *    - `gedcom-resn-privacy` / `confidential` / `locked` — explicit RESN tag
 *    - `living-heuristic` — no death record and the latest possible birth
 *      year is within `PRIVACY_LIVING_THRESHOLD_YEARS` of today
 */
export interface Privacy {
  restricted: boolean;
  reason: string;
}

/** Years since the latest possible birth year, below or equal to which the
 *  living-person heuristic flags an individual as potentially still alive. */
export const PRIVACY_LIVING_THRESHOLD_YEARS = 110;

/** The structured shape we emit per individual into `genealogy/derived/<record>.yml`.
 *
 *  Two parallel views of the same family relationships are emitted:
 *
 *  - The flat lists `parents`, `spouses`, `children` are person-centric
 *    projections — each list is the union across all relevant FAM records.
 *    Convenient for "how many parents?" or simple iteration.
 *  - The grouped lists `familyOfOrigin` and `marriages` mirror the GEDCOM
 *    bipartite structure. Each entry is one FAM unit and carries marriage
 *    date/place plus the children that belong to *that* unit (so half-
 *    siblings appear under the parent's other marriage). UI surfaces that
 *    want to render family unit cards consume these.
 */
export interface DerivedRecord {
  record: string;                       // "I28906361734"
  name: string;                         // "Abby Rickelman"
  birth: DatedEvent | null;
  death: DatedEvent | null;
  parents: ParentRef[];
  spouses: { record: string; name: string; married: string | null }[];
  children: { record: string; name: string; born: string | null }[];
  familyOfOrigin: FamilyOfOriginEntry[];
  marriages: MarriageEntry[];
  residences: ResidenceEvent[];
  occupations: OccupationEvent[];
  sources: SourceRef[];
  media: MediaRef[];
  privacy: Privacy;
}

/** Snapshots manifest entry shape. Compatible with what tools/wikitext-to-md/
 *  wrote during the Plan B migration import (no extra fields added by Plan D).
 *  recite finds the corresponding commit via git log on `date` rather than a
 *  recorded SHA — avoids the chicken-and-egg of a commit knowing its own hash. */
export interface SnapshotEntry {
  hash: string;           // SHA-256 hex of the .ged file at sync time
  date: string;           // ISO 8601 timestamp — used by recite to find the commit
  file: string;           // e.g. "barash-tree.ged"
  notes: string;
}

/** Difference summary returned by syncGedcom. */
export interface SyncDiff {
  added: string[];        // record ids
  changed: string[];
  removed: string[];
}

/** Drift entry returned by reciteDrift. */
export interface ReciteEntry {
  slug: string;
  record: string;
  citedSnapshot: string;
  latestSnapshot: string;
  changedFields: string[];
}
