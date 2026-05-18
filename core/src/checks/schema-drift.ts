import type { Detector, Finding, RepoState } from './types.ts';
import { CURRENT_SCHEMA_VERSION } from '../pages/migrations/index.ts';

export const detectSchemaDrift: Detector = (state: RepoState): Finding[] => {
  const findings: Finding[] = [];
  for (const page of state.pages) {
    if (page.meta.schemaVersion < CURRENT_SCHEMA_VERSION) {
      findings.push({
        category: 'schema',
        severity: 'info',
        message: `page at schemaVersion ${page.meta.schemaVersion}, current is ${CURRENT_SCHEMA_VERSION} — run \`wai migrate\``,
        location: { file: page.path },
      });
    }
  }
  // Surface schema-validation parse errors collected by load.ts. Two sources:
  //   - Page frontmatter that claims to be an article (type: person|family|
  //     event|tree) but fails Zod. Examples: translation_of holding a path
  //     instead of a slug, lang holding "english" instead of "en",
  //     canonical_sha shorter than 40 chars.
  //   - Derived YAML (genealogy/derived/*.yml) that fails DerivedRecordSchema.
  //     Examples: hand-edited file with wrong-shape parents array, a record
  //     with malformed id, missing required fields.
  // Previously both were silently dropped — now flagged so the user sees
  // malformed inputs instead of mysteriously-missing ones.
  for (const err of state.parseErrors ?? []) {
    findings.push({
      category: 'schema',
      severity: 'error',
      message: `schema validation failed: ${shortenZodMessage(err.error)}`,
      location: { file: err.path },
    });
  }
  return findings;
};

/**
 * Zod error messages can be JSON dumps several lines long. Pull out the
 * most useful one-line summary for a check-output context: the first
 * `path` and `message` pair from the error structure when it's a JSON
 * array (Zod's default), otherwise the raw string.
 */
function shortenZodMessage(raw: string): string {
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length > 0 && arr[0]?.path && arr[0]?.message) {
      const path = Array.isArray(arr[0].path) ? arr[0].path.join('.') : String(arr[0].path);
      return `${path}: ${arr[0].message}`;
    }
  } catch {
    // not a JSON-shaped Zod error; fall through to raw
  }
  return raw.split('\n')[0]!.slice(0, 200);
}
