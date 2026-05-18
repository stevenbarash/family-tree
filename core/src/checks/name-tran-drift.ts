import type { Detector, Finding, RepoState } from './types.ts';

/**
 * Assert that GEDCOM 7 NAME.TRAN values agree with translation-page
 * titles for the same (record, locale) pair. Catches hand-edits that
 * land on one side but not the other:
 *
 *   - User edits pages/ru/sofia-krasnova.md's title; GEDCOM TRAN unchanged.
 *     Next `wai i18n sync` would overwrite the page back to the GEDCOM
 *     form, silently losing the manual edit.
 *
 *   - User edits the GEDCOM TRAN; pages/ru/<slug>.md still has the old
 *     title. Pages render the stale form; translation pipeline is at war
 *     with itself.
 *
 * Only flags pairs where BOTH a NAME.TRAN value and a translation page
 * exist for the same (record, locale). Records with NAME.TRAN but no page
 * (Phase 1 promotions for unwritten articles) and pages without NAME.TRAN
 * (the 47 GEDCOM records without wiki coverage) are silently skipped.
 *
 * Severity is `warn` — the user must decide which side wins. No auto-fix.
 */
export const detectNameTranDrift: Detector = (state: RepoState): Finding[] => {
  const findings: Finding[] = [];

  // Build (record, locale) → { title, path } from translation pages
  // (pages with lang set to something other than 'en').
  const titleByKey = new Map<string, { title: string; path: string }>();
  for (const p of state.pages) {
    if (!p.meta.lang || p.meta.lang === 'en') continue;
    const record = p.meta.gedcom?.record;
    if (!record) continue;
    titleByKey.set(`${record}::${p.meta.lang}`, { title: p.meta.title, path: p.path });
  }

  // For every record with nameTranslations, check each locale against the
  // matching translation page (if any).
  for (const [record, derived] of state.derived) {
    if (!derived.nameTranslations) continue;
    for (const [locale, tranValue] of Object.entries(derived.nameTranslations)) {
      const entry = titleByKey.get(`${record}::${locale}`);
      if (!entry) continue; // no translation page for this (record, locale)
      if (entry.title === tranValue) continue; // in sync
      findings.push({
        category: 'data',
        severity: 'warn',
        message: `NAME.TRAN (${locale}) "${tranValue}" differs from page title "${entry.title}" for record ${record} — edit one side and re-sync, or update the GEDCOM TRAN`,
        location: { file: entry.path },
      });
    }
  }

  return findings;
};
