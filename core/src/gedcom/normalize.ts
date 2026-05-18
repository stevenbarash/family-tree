import type { DerivedRecord } from './types.ts';
import { parseDerivedRecord } from './schema.ts';

/**
 * Coerce a YAML-parsed object into a `DerivedRecord` via the Zod schema.
 * Returns `null` if the input doesn't match the schema (missing required
 * fields, wrong shape, malformed IDs).
 *
 * The schema fills missing array fields with `[]` and missing `privacy`
 * with the default, so old YAMLs written before a field was introduced
 * still parse. Wrong-shape values (e.g. `parents: "not-an-array"`) fail
 * — they're real bugs and should surface, not be silently coerced.
 *
 * New code that needs the parse error (e.g. to feed `parseErrors` in
 * `RepoState`) should call `parseDerivedRecord` directly instead.
 */
export function normalizeDerivedRecord(raw: unknown): DerivedRecord | null {
  const result = parseDerivedRecord(raw);
  return result.ok ? result.data : null;
}
