import { z } from 'zod';
import type { PageMeta } from './types.ts';
import { CURRENT_SCHEMA_VERSION } from './migrations/index.ts';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const GedcomRefSchema = z.object({
  file: z.string().min(1),
  record: z.string().regex(/^I\d+$/),
  snapshot: z.string().min(1),
});

const CorrectionSchema = z.object({
  record: z.string().regex(/^I\d+$/).optional(),
  field: z.enum([
    'birth.date',
    'birth.place',
    'death.date',
    'death.place',
    'name',
  ]),
  value: z.string().min(1),
  source: z.string().min(1),
});

const PageMetaSchema = z.object({
  schemaVersion: z.number().int().positive().default(CURRENT_SCHEMA_VERSION),
  title: z.string().min(1),
  // LLM model attribution. Older pages used owner/editors; both kept
  // optional during the transition so legacy data still parses.
  author: z.string().min(1).optional(),
  owner: z.string().min(1).optional(),
  editors: z.array(z.string()).optional(),
  type: z.enum(['person', 'family', 'event', 'tree', 'meta']),
  aliases: z.array(z.string()),
  categories: z.array(z.string()),
  gedcom: GedcomRefSchema.optional(),
  portrait: z.string().min(1).optional(),
  created: z.union([
    z.string().regex(ISO_DATE, 'expected YYYY-MM-DD'),
    z.date().transform(d => d.toISOString().slice(0, 10))
  ]),
  deletedAt: z.union([
    z.string(),
    z.date().transform(d => d.toISOString().slice(0, 10))
  ]).optional(),
  corrections: z.array(CorrectionSchema).default([]),
  // BCP 47 short codes — we use plain two- or three-letter forms (en, ru, uk, he).
  // Reject things like "english" or "ru-RU" that have crept in from agents who
  // didn't know the convention.
  lang: z.string().regex(/^[a-z]{2,3}$/, 'expected a BCP 47 short locale code like "ru" or "he"').optional(),
  // Plain slug — same character class as the page slug itself (lowercase
  // letters, digits, hyphens). Rejects path forms like "pages/en/x.md" that
  // agents have occasionally written.
  translationOf: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'expected a page slug, not a path or filename').optional(),
  // 40-char git SHA. Agents have occasionally written shortened forms or
  // descriptions; tighten to the full-length form the pipeline emits.
  canonicalSha: z.string().regex(/^[a-f0-9]{40}$/, 'expected a full 40-character git SHA').optional(),
  translatedAt: z.union([
    z.string().regex(ISO_DATE, 'expected YYYY-MM-DD'),
    z.date().transform(d => d.toISOString().slice(0, 10))
  ]).optional(),
});

// Compile-time guarantee that the schema's output matches PageMeta.
// Drift on either side fails to typecheck.
type _AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _schemaParity: _AssertEqual<z.infer<typeof PageMetaSchema>, PageMeta> = true;
void _schemaParity;

/**
 * Validate a raw frontmatter object against the current PageMeta
 * schema. Callers that read pages from disk must run frontmatter
 * through `migrate(...)` first — the schema describes the current
 * shape only.
 */
export function parsePageMeta(input: unknown): PageMeta {
  return PageMetaSchema.parse(input);
}

/**
 * Focused validation of just the translation-pipeline frontmatter fields
 * (`lang`, `translationOf`, `canonicalSha`, `translatedAt`) — the same
 * regexes the main PageMeta schema enforces, pulled out so they can be
 * applied to pages that aren't of an article type and therefore can't
 * be parsed with the full PageMeta schema (e.g. `type: translation-talk`,
 * `type: meta`).
 *
 * Why this exists: talk pages carry the same pipeline fields as the
 * articles they shadow, and the same bug class hits them — a
 * `translation_of: en/<slug>` path instead of a bare slug breaks the
 * pipeline for both files. Without this focused validator the talk-page
 * version of the bug is invisible to `wai check` (the main schema
 * rejects talk pages on type alone and load.ts silently drops them).
 *
 * Returns a flattened error string on failure, null on success. Caller
 * pushes the error into `RepoState.parseErrors` for `detectSchemaDrift`
 * to surface — same channel article-page schema errors flow through.
 */
const PipelineFieldsSchema = PageMetaSchema.pick({
  lang: true,
  translationOf: true,
  canonicalSha: true,
  translatedAt: true,
}).passthrough();

export function parsePipelineFields(input: unknown): string | null {
  const result = PipelineFieldsSchema.safeParse(input);
  if (result.success) return null;
  return result.error.issues
    .map(i => `${i.path.length ? i.path.join('.') + ': ' : ''}${i.message}`)
    .join('; ');
}
