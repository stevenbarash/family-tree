import { z } from 'zod';

/**
 * Zod schema for `DerivedRecord` — the per-individual YAML the deriver
 * writes to `genealogy/derived/<record>.yml`. This is the runtime
 * companion to the TypeScript type in `./types.ts`.
 *
 * Used in two directions:
 *   - **Write side** (`derive.ts`): validate each record before YAML
 *     serialization. A deriver bug that produces a malformed record fails
 *     loud instead of polluting `derived/`.
 *   - **Read side** (`normalize.ts` / `checks/load.ts`): replace the
 *     coercive normalizer. Parse failures surface via
 *     `RepoState.parseErrors` → `detectSchemaDrift` rather than being
 *     silently swallowed.
 *
 * Posture is pragmatic, not maximal:
 *   - Required fields are required; optional fields are optional.
 *   - ID-shaped fields (record / family / source / media) carry pattern
 *     regexes — these IDs are the join keys between YAMLs and the
 *     GEDCOM, so wrong shape = silent broken link.
 *   - Date strings and place strings are loose `string | null` — the
 *     `format-drift` detector owns date canonicalization.
 *   - Unknown extra keys are stripped (Zod default), not rejected — old
 *     YAMLs may carry fields newer code doesn't know about; that's not
 *     drift, just history.
 */

const RECORD_ID = z.string().regex(/^I\d+$/, 'record id must look like I<digits>');
const FAMILY_ID = z.string().regex(/^F\d+$/, 'family id must look like F<digits>');
const SOURCE_ID = z.string().regex(/^S\d+$/, 'source id must look like S<digits>');
const MEDIA_ID = z.string().regex(/^O\d+$/, 'media id must look like O<digits>');
const BCP47_SHORT = z.string().regex(/^[a-z]{2,3}$/, 'locale must be BCP 47 short code (2–3 lowercase letters)');

const DatedEventSchema = z.object({
  date: z.string().nullable(),
  place: z.string().nullable(),
});

const FamilyMemberRefSchema = z.object({
  record: RECORD_ID,
  name: z.string(),
  born: z.string().nullable().optional(),
});

const IndividualRefSchema = z.object({
  record: RECORD_ID,
  name: z.string(),
});

const ParentRefSchema = IndividualRefSchema.extend({
  role: z.enum(['father', 'mother']),
});

const SpouseRefSchema = z.object({
  record: RECORD_ID,
  name: z.string(),
  married: z.string().nullable(),
});

const ChildRefSchema = z.object({
  record: RECORD_ID,
  name: z.string(),
  born: z.string().nullable(),
});

const PEDI = z.enum(['adopted', 'foster', 'sealing']);

const FamilyOfOriginEntrySchema = z.object({
  fam: FAMILY_ID,
  pedigree: PEDI.optional(),
  father: FamilyMemberRefSchema.optional(),
  mother: FamilyMemberRefSchema.optional(),
  siblings: z.array(FamilyMemberRefSchema),
  marriedDate: z.string().nullable(),
  marriedPlace: z.string().nullable(),
});

const MarriageEntrySchema = z.object({
  fam: FAMILY_ID,
  spouse: FamilyMemberRefSchema.optional(),
  children: z.array(FamilyMemberRefSchema),
  marriedDate: z.string().nullable(),
  marriedPlace: z.string().nullable(),
});

const OccupationEventSchema = z.object({
  title: z.string(),
  date: z.string().nullable(),
});

const SourceRefSchema = z.object({
  record: SOURCE_ID,
  title: z.string().optional(),
  author: z.string().optional(),
  publisher: z.string().optional(),
  apid: z.string().optional(),
  note: z.string().optional(),
});

const MediaRefSchema = z.object({
  record: MEDIA_ID,
  title: z.string().optional(),
  form: z.string().optional(),
  file: z.string().optional(),
  oid: z.string().optional(),
  primary: z.boolean().optional(),
});

const PrivacySchema = z.object({
  restricted: z.boolean(),
  reason: z.string(),
});

export const DerivedRecordSchema = z.object({
  record: RECORD_ID,
  name: z.string().min(1, 'name must be non-empty'),
  sex: z.enum(['M', 'F', 'U']).optional(),
  nameTranslations: z.record(BCP47_SHORT, z.string()).optional(),
  birth: DatedEventSchema.nullable(),
  death: DatedEventSchema.nullable(),
  // Array fields use `.default([])` so YAMLs written by an older deriver
  // that didn't emit a given field still parse cleanly. When a field IS
  // present, its shape must match — strings or wrong-shape entries fail
  // validation (which is the point: hand-edits should surface, not coerce).
  parents: z.array(ParentRefSchema).default([]),
  spouses: z.array(SpouseRefSchema).default([]),
  children: z.array(ChildRefSchema).default([]),
  familyOfOrigin: z.array(FamilyOfOriginEntrySchema).default([]),
  marriages: z.array(MarriageEntrySchema).default([]),
  residences: z.array(DatedEventSchema).default([]),
  occupations: z.array(OccupationEventSchema).default([]),
  sources: z.array(SourceRefSchema).default([]),
  media: z.array(MediaRefSchema).default([]),
  privacy: PrivacySchema.default({ restricted: false, reason: 'none' }),
});

export interface ParseSuccess {
  ok: true;
  data: z.infer<typeof DerivedRecordSchema>;
}
export interface ParseFailure {
  ok: false;
  error: string;
}
export type ParseResult = ParseSuccess | ParseFailure;

/**
 * Strict parse of a YAML-loaded object into a DerivedRecord. Returns a
 * tagged result with a flattened error message on failure — used by
 * `load.ts` to feed `RepoState.parseErrors` (which `detectSchemaDrift`
 * surfaces) and by `writeDerivedYaml` to fail loud at the write boundary.
 *
 * Prefer this over `normalizeDerivedRecord` in new code; the legacy
 * function is preserved only to avoid churning the four other read
 * call sites that don't need the detailed error.
 */
export function parseDerivedRecord(raw: unknown): ParseResult {
  const result = DerivedRecordSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  const summary = result.error.issues
    .map(i => `${i.path.length ? i.path.join('.') + ': ' : ''}${i.message}`)
    .join('; ');
  return { ok: false, error: summary };
}

export type DerivedRecordSchemaInput = z.input<typeof DerivedRecordSchema>;
