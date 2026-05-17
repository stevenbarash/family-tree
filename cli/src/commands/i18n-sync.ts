/**
 * `wai i18n sync <slug> <locale>` — produce / refresh a translation of
 * the canonical EN article into a target locale, writing both the
 * translation file and a sibling translation-talk file.
 *
 * The translator is injected (`Translator`) so this command stays
 * platform-agnostic: Plan 3 Task 10 ships with a stub translator that
 * echoes the canonical body verbatim; Plan 3 Task 11 swaps in the real
 * agent-driven translation pipeline.
 *
 * Output layout:
 *   pages/{locale}/<slug>.md                      — translated article
 *   pages/{locale}/<slug>.translation.talk.md     — open / resolved
 *                                                    questions for
 *                                                    human review
 *
 * Refusals (emit to `write`, return 0 — these are not exceptional):
 *   - `locale === "en"`: canonical locale is not a sync target.
 *   - `locale` not in TARGET_LOCALES: unknown locale.
 *   - `pages/en/<slug>.md` missing: nothing to translate from.
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { parsePage } from '@core/pages/frontmatter.ts';
import { isLocale, TARGET_LOCALES, type Locale } from '@core/i18n/index.ts';

export interface TranslateRequest {
  canonicalBody: string;
  canonicalMeta: Record<string, unknown>;
  locale: Locale;
  existingTranslation?: string;
  existingTalkResolved?: string;
}

export interface TranslateResponse {
  body: string;
  talk: string;
  titleTranslation: string;
}

export type Translator = (req: TranslateRequest) => Promise<TranslateResponse>;

export interface RunI18nSyncOpts {
  rootDir: string;
  slug: string;
  locale: string;
  translator: Translator;
  write: (s: string) => void;
}

export async function runI18nSync(opts: RunI18nSyncOpts): Promise<void> {
  if (!isLocale(opts.locale)) {
    opts.write(`unknown locale: ${opts.locale}. Valid: ${TARGET_LOCALES.join(', ')}\n`);
    return;
  }
  if (opts.locale === 'en') {
    opts.write(`cannot sync canonical locale (en)\n`);
    return;
  }

  const canonicalPath = join(opts.rootDir, 'pages', 'en', `${opts.slug}.md`);
  if (!existsSync(canonicalPath)) {
    opts.write(`canonical not found: pages/en/${opts.slug}.md\n`);
    return;
  }

  const canonicalRaw = await readFile(canonicalPath, 'utf8');
  const canonicalPage = parsePage(opts.slug, canonicalRaw);
  const canonicalSha = execSync(
    `git -C "${opts.rootDir}" log -1 --format=%H -- pages/en/${opts.slug}.md`,
    { encoding: 'utf8' },
  ).trim();

  const existingTranslationPath = join(opts.rootDir, 'pages', opts.locale, `${opts.slug}.md`);
  const existingTalkPath = join(opts.rootDir, 'pages', opts.locale, `${opts.slug}.translation.talk.md`);
  const existingTranslation = existsSync(existingTranslationPath)
    ? await readFile(existingTranslationPath, 'utf8')
    : undefined;
  const existingTalkResolved = existsSync(existingTalkPath)
    ? extractResolvedSection(await readFile(existingTalkPath, 'utf8'))
    : undefined;

  opts.write(`translating ${opts.slug} -> ${opts.locale}...\n`);

  const response = await opts.translator({
    canonicalBody: canonicalPage.body,
    canonicalMeta: canonicalPage.meta as unknown as Record<string, unknown>,
    locale: opts.locale as Locale,
    existingTranslation,
    existingTalkResolved,
  });

  const today = new Date().toISOString().slice(0, 10);
  const frontmatter = `---
schemaVersion: ${canonicalPage.meta.schemaVersion}
title: ${response.titleTranslation}
lang: ${opts.locale}
translation_of: ${opts.slug}
canonical_sha: ${canonicalSha}
translated_at: '${today}'
---
`;
  const translationFile = `${frontmatter}${response.body}`;
  const talkFile = `---
type: translation-talk
translation_of: ${opts.slug}
lang: ${opts.locale}
canonical_sha_when_logged: ${canonicalSha}
synced_at: '${today}'
---

# Translation notes — ${opts.locale} (${response.titleTranslation})

${response.talk}
`;

  await mkdir(join(opts.rootDir, 'pages', opts.locale), { recursive: true });
  await writeFile(existingTranslationPath, translationFile);
  await writeFile(existingTalkPath, talkFile);

  opts.write(`wrote pages/${opts.locale}/${opts.slug}.md\n`);
  opts.write(`wrote pages/${opts.locale}/${opts.slug}.translation.talk.md\n`);
}

/**
 * Extract the "## Resolved" section of a translation-talk file so the
 * translator can preserve human-confirmed decisions across re-syncs.
 * Returns the section body (everything after the heading, up to the
 * next `## ` or end of file), trimmed. Returns undefined if no
 * Resolved section exists.
 */
function extractResolvedSection(talkBody: string): string | undefined {
  const match = talkBody.match(/##\s+Resolved\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  return match ? match[1]!.trim() : undefined;
}
