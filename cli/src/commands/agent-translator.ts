/**
 * Real agent-driven translator for `wai i18n sync`. Invokes the
 * editor agent via the harness adapter (`writing-articles` skill,
 * `translate` template) and returns a structured translation +
 * talk-file payload. Used as the default translator from Plan 3
 * Task 11 onward; `--stub` flips back to the offline echo translator
 * for tests and dry runs.
 */

import { selectHarness } from '../harness/index.js';
import type { HarnessName } from '../harness/index.js';
import type { Translator, TalkTranslator } from './i18n-sync.js';

export const agentTranslator: Translator = async (req) => {
  const harness = selectHarness(
    process.env.WHOAMI_HARNESS as HarnessName | undefined,
  );

  const response = await harness.invoke<
    {
      LOCALE: string;
      TITLE: string;
      SLUG: string;
      FRONTMATTER_JSON: string;
      BODY: string;
      SUBJECT_SEX: string;
      NAME_TRAN_OR_NONE: string;
      RELATED_TRANSLATIONS_OR_NONE: string;
      EXISTING_TRANSLATION_OR_NONE: string;
      EXISTING_TALK_RESOLVED_OR_NONE: string;
    },
    {
      titleTranslation: string;
      body: string;
      talk: string;
    }
  >({
    skill: 'writing-articles',
    template: 'translate',
    context: {
      LOCALE: req.locale,
      TITLE: String((req.canonicalMeta as { title?: unknown }).title ?? ''),
      SLUG: String((req.canonicalMeta as { slug?: unknown }).slug ?? ''),
      FRONTMATTER_JSON: JSON.stringify(req.canonicalMeta, null, 2),
      BODY: req.canonicalBody,
      SUBJECT_SEX: subjectSexLabel(req.subjectSex),
      NAME_TRAN_OR_NONE: req.nameTranslation ?? '(none)',
      RELATED_TRANSLATIONS_OR_NONE: relatedTranslationsBlock(req.relatedTranslations),
      EXISTING_TRANSLATION_OR_NONE: req.existingTranslation ?? '(none)',
      EXISTING_TALK_RESOLVED_OR_NONE: req.existingTalkResolved ?? '(none)',
    },
    outputSchema: {
      type: 'object',
      properties: {
        titleTranslation: { type: 'string' },
        body: { type: 'string' },
        talk: { type: 'string' },
      },
      required: ['titleTranslation', 'body', 'talk'],
    },
  });

  if (!response.ok) {
    throw new Error(`Agent translation failed: ${response.error}`);
  }

  return {
    titleTranslation: response.result.titleTranslation,
    body: response.result.body,
    talk: response.result.talk,
  };
};

/**
 * Translate the M/F/U sex code into a human-readable label the prompt
 * embeds. Non-person articles pass undefined → 'not-a-person', signaling
 * the translator that gendered-verb concerns don't apply for this article.
 */
function subjectSexLabel(sex: 'M' | 'F' | 'U' | undefined): string {
  if (sex === 'M') return 'male (use masculine past-tense verbs)';
  if (sex === 'F') return 'female (use feminine past-tense verbs)';
  if (sex === 'U') return 'unknown (default to masculine and log the choice in talk)';
  return 'not-a-person (no gendered verb concerns for this article)';
}

/**
 * Render the list of already-translated wikilinked slugs as a prompt
 * block the agent can use to anchor surname/given-name renderings.
 * Empty list → '(none — this is the first article in this locale that
 * mentions these subjects)'. Otherwise one line per pair, formatted as
 * an alignment table.
 */
function relatedTranslationsBlock(related: import('./i18n-sync.js').RelatedTranslation[] | undefined): string {
  if (!related || related.length === 0) {
    return '(none — no wikilinked slugs are already translated in this locale)';
  }
  const lines = related.map(r => `  ${r.enTitle}  →  ${r.localeTitle}    (slug: ${r.slug})`);
  return `These wikilinked slugs are already translated in this locale. Mirror their\nsurname and given-name renderings exactly so the article set stays consistent:\n\n${lines.join('\n')}`;
}

/**
 * Real agent-driven talk-page translator for `wai i18n sync`. Mirrors
 * `agentTranslator` but invokes the `translate-talk` template (talk
 * pages have a different contract — preserve thread markers, HTML
 * note IDs, gap slugs, source URLs, pipeline UUIDs verbatim; translate
 * only prose and headings). Used as the default talkTranslator from
 * Phase B.2 onward; `--stub` flips back to `stubTalkTranslator` for
 * tests and dry runs.
 */
export const agentTalkTranslator: TalkTranslator = async (req) => {
  const harness = selectHarness(
    process.env.WHOAMI_HARNESS as HarnessName | undefined,
  );

  const response = await harness.invoke<
    {
      LOCALE: string;
      SLUG: string;
      SUBJECT_SEX: string;
      ARTICLE_TITLE_TRANSLATION: string;
      ARTICLE_TRANSLATED_BODY_OR_NONE: string;
      EXISTING_TALK_TRANSLATION_OR_NONE: string;
      TALK_BODY: string;
    },
    {
      body: string;
      titlePrefix: string;
      auditEntries: string;
    }
  >({
    skill: 'writing-articles',
    template: 'translate-talk',
    context: {
      LOCALE: req.locale,
      SLUG: req.slug,
      // Talk-page meta doesn't carry subject sex (the article's GEDCOM
      // record is the source). The orchestrator could plumb it through
      // — for now the agent infers from prose and locale convention.
      SUBJECT_SEX: 'not-tracked-for-talk-pages',
      ARTICLE_TITLE_TRANSLATION: req.articleTitleTranslation,
      ARTICLE_TRANSLATED_BODY_OR_NONE: req.articleTranslatedBody ?? '(none — article was not translated in this run, use the talk-page context alone)',
      EXISTING_TALK_TRANSLATION_OR_NONE: req.existingTalkTranslation ?? '(none — first translation of this talk page into this locale)',
      TALK_BODY: req.canonicalTalkBody,
    },
    outputSchema: {
      type: 'object',
      properties: {
        body: { type: 'string' },
        titlePrefix: { type: 'string' },
        auditEntries: { type: 'string' },
      },
      required: ['body', 'titlePrefix', 'auditEntries'],
    },
  });

  if (!response.ok) {
    throw new Error(`Agent talk translation failed: ${response.error}`);
  }

  return {
    body: response.result.body,
    titlePrefix: response.result.titlePrefix,
    auditEntries: response.result.auditEntries,
  };
};
