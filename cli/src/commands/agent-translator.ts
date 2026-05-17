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
import type { Translator } from './i18n-sync.js';

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
