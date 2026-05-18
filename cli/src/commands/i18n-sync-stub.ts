/**
 * Stub translator used by `wai i18n sync` until Plan 3 Task 11 wires
 * in the real agent-driven translation pipeline. Echoes the canonical
 * body verbatim and bracket-prefixes the title with the target locale
 * code, so a maintainer can verify the end-to-end command surface
 * (frontmatter, talk file, git plumbing) without depending on an LLM.
 */

import type { Translator } from './i18n-sync.ts';

export const stubTranslator: Translator = async (req) => ({
  body: req.canonicalBody,
  talk: `## Unresolved

- [ ] **[stub]** Stub translator used; real agent translation pipeline lands in Plan 3 Task 11.

## Resolved
`,
  // When the GEDCOM has a NAME.TRAN for this locale, use it verbatim;
  // otherwise fall back to bracket-prefixing for the stub's smoke-test value.
  titleTranslation: req.nameTranslation
    ?? `[${req.locale}] ${(req.canonicalMeta as { title?: string }).title ?? req.canonicalMeta['title'] ?? ''}`,
});
