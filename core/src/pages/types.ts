export type PageType = 'person' | 'family' | 'event' | 'tree' | 'meta';

export interface GedcomRef {
  file: string;
  record: string;
  snapshot: string;
}

/**
 * A frontmatter-declared correction to a derived GEDCOM record. Applied
 * at render time by `applyCorrections` (see `core/src/corrections/overlay.ts`).
 *
 * The `record` is optional and defaults to the page's own `gedcom.record`
 * when the renderer collects corrections — pages that override only their
 * own subject can omit it. Pages that correct another individual (e.g. a
 * family overview page correcting a parent's death date) must spell it out.
 *
 * Field whitelist is intentionally narrow at v1; extend the union when a
 * concrete need appears.
 */
export interface Correction {
  record?: string;
  field: 'birth.date' | 'birth.place' | 'death.date' | 'death.place' | 'name';
  value: string;
  source: string;
}

export interface PageMeta {
  /**
   * Schema version of this page's frontmatter. Always present after
   * parse — readers that encounter pages with no on-disk schemaVersion
   * field default it to 1 before validation.
   */
  schemaVersion: number;
  title: string;
  owner: string;
  editors: string[];
  type: PageType;
  aliases: string[];
  categories: string[];
  gedcom?: GedcomRef;
  portrait?: string;
  created: string;
  deletedAt?: string;
  corrections: Correction[];
  /** ISO 639 language code. Omitted on canonical EN files; set on translations (e.g. "ru"). */
  lang?: string;
  /** Set on translation files only — points to the canonical slug. */
  translationOf?: string;
  /** Git SHA of the canonical EN file at translation time. Translation files only. */
  canonicalSha?: string;
  /** ISO date (YYYY-MM-DD) when this translation was generated. Translation files only. */
  translatedAt?: string;
}

export interface Page {
  slug: string;
  meta: PageMeta;
  body: string;
}

export interface PageMetaSummary {
  slug: string;
  title: string;
  type: PageType;
  categories: string[];
  aliases: string[];
  gedcomRecord?: string;
  portrait?: string;
  isTalk: boolean;
  isArchived: boolean;
}

export interface Revision {
  sha: string;
  author: string;
  email: string;
  date: string;
  summary: string;
}

export interface AuthorIdentity {
  name: string;
  email: string;
}
