import type { Detector, Finding, RepoState } from './types.ts';

/**
 * Assert that translation pages' `canonical_sha` field matches the
 * canonical EN page's actual git HEAD. Catches:
 *
 *   - Canonical edited; translations not re-synced. Translations carry
 *     a stale SHA that no longer points at content they reflect.
 *
 *   - Translation file missing `canonical_sha` entirely (regression in
 *     the i18n sync pipeline that promoted a translation without
 *     stamping the parent).
 *
 * Silent when:
 *   - The canonical has no git history (`canonicalHeadSha` lookup misses)
 *     — could be untracked / never committed; not our problem to invent.
 *   - The translation lacks `translation_of` — schema-drift already
 *     surfaces that; double-reporting is noise.
 *   - State has no `canonicalHeadSha` map at all (non-git test contexts).
 *
 * Severity is `warn` — re-running `wai i18n sync <slug> <locale>`
 * fixes it deterministically.
 */
export const detectStaleCanonicalSha: Detector = (state: RepoState): Finding[] => {
  const heads = state.canonicalHeadSha;
  if (!heads) return [];

  const findings: Finding[] = [];

  for (const p of state.pages) {
    if (!p.meta.lang || p.meta.lang === 'en') continue;
    const canonical = p.meta.translationOf;
    if (!canonical) continue; // schema-drift handles this
    const headSha = heads.get(canonical);
    if (!headSha) continue; // canonical has no git history — silent

    const pageSha = p.meta.canonicalSha;
    if (!pageSha) {
      findings.push({
        category: 'data',
        severity: 'warn',
        message: `translation missing canonical_sha — should be ${headSha.slice(0, 8)} (run \`wai i18n sync ${canonical} ${p.meta.lang}\`)`,
        location: { file: p.path },
      });
      continue;
    }

    if (pageSha === headSha) continue; // in sync

    findings.push({
      category: 'data',
      severity: 'warn',
      message: `stale canonical_sha ${pageSha.slice(0, 8)} (canonical HEAD is ${headSha.slice(0, 8)}) — re-run \`wai i18n sync ${canonical} ${p.meta.lang}\` to refresh`,
      location: { file: p.path },
    });
  }

  return findings;
};
