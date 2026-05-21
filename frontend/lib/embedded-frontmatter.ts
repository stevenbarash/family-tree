import matter from 'gray-matter';
import { parsePage } from '@core/pages/index.ts';
import type { Page } from '@core/pages/index.ts';

/**
 * The `wai author` draft pipeline emits a page body that begins with its
 * own YAML frontmatter block — the `draft-person` prompt template
 * instructs the agent to "produce the full markdown body … including
 * frontmatter". `PUT /api/pages/[slug]` otherwise treats the request
 * body as body-only and synthesises a `type: meta` default for a new
 * page, stacking two frontmatter blocks on the file.
 *
 * This detects an embedded frontmatter block and lifts it out: the
 * parsed, schema-validated `meta` becomes the page's real frontmatter and
 * `body` is the post-frontmatter content. Returns `null` when the body
 * carries no frontmatter — the caller then uses the body verbatim, as
 * before.
 *
 * Throws if the embedded frontmatter is present but fails schema
 * validation (`parsePage` → Zod) — a malformed draft should fail the
 * write loudly rather than land as a `type: meta` page.
 */
export function extractEmbeddedFrontmatter(
  slug: string,
  rawBody: string,
): Pick<Page, 'meta' | 'body'> | null {
  if (Object.keys(matter(rawBody).data).length === 0) return null;
  const { meta, body } = parsePage(slug, rawBody);
  return { meta, body };
}
