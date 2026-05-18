import type { Detector, Finding, RepoState, LoadedPage } from './types.ts';

const TRANSLATION_LOCALES = new Set(['ru', 'uk', 'he']);

/**
 * Assert that every translation page carries the full set of frontmatter
 * fields the i18n pipeline stamps when it creates one:
 *
 *   - `lang` (the page's locale)
 *   - `translation_of` (the canonical slug)
 *   - `canonical_sha` (the canonical's git HEAD at translation time)
 *   - `translated_at` (ISO date)
 *   - `author` (the LLM model that produced the translation)
 *
 * Any of these missing means the page was either hand-edited in a way
 * that dropped fields, or created outside `wai i18n sync` (which is
 * fine but means the page won't show up correctly in `wai i18n status`
 * and can't be re-synced cleanly).
 *
 * "Translation page" = lives under pages/{ru,uk,he}/. Pages under
 * pages/en/ are canonicals and don't need pipeline fields; legacy
 * top-level pages/*.md predate the multilingual era and are exempt.
 *
 * Severity is `warn` — the page may render fine; the loss is in
 * pipeline traceability, not user-visible output.
 */
export const detectPipelineFrontmatterDrift: Detector = (state: RepoState): Finding[] => {
  const findings: Finding[] = [];
  for (const p of state.pages) {
    const locale = localeFromPath(p);
    if (!locale || !TRANSLATION_LOCALES.has(locale)) continue;

    const missing: string[] = [];
    if (!p.meta.lang) missing.push('lang');
    if (!p.meta.translationOf) missing.push('translation_of');
    if (!p.meta.canonicalSha) missing.push('canonical_sha');
    if (!p.meta.translatedAt) missing.push('translated_at');
    if (!p.meta.author) missing.push('author');

    if (missing.length === 0) continue;
    findings.push({
      category: 'schema',
      severity: 'warn',
      message: `translation page missing pipeline fields: ${missing.join(', ')} — re-run \`wai i18n sync ${p.slug} ${locale}\` to re-stamp`,
      location: { file: p.path },
    });
  }
  return findings;
};

function localeFromPath(p: LoadedPage): string | null {
  const m = /\/pages\/([a-z]{2,3})\/[^/]+\.md$/.exec(p.path);
  return m ? m[1]! : null;
}
