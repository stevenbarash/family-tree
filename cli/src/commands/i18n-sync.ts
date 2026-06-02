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

import { mkdir, writeFile, readFile, rename, unlink } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parsePage, yamlScalar } from '@core/pages/frontmatter.ts';
import { toSlug, isValidSlug } from '@core/pages/slug.ts';
import { isLocale, TARGET_LOCALES, type Locale } from '@core/i18n/index.ts';
import { parseTalkThreads } from '@core/pages/talk-threads.ts';

/**
 * A previously-established (English title → target-locale title) pair
 * for a slug that appears as a [[wikilink]] in the canonical we're now
 * translating. Passed to the translator so it can mirror surname/given-
 * name renderings already settled by sibling articles instead of
 * inventing fresh transliterations and creating cross-page drift.
 */
export interface RelatedTranslation {
  slug: string;
  enTitle: string;
  localeTitle: string;
}

export interface TranslateRequest {
  canonicalBody: string;
  canonicalMeta: Record<string, unknown>;
  locale: Locale;
  /** 'M' / 'F' / 'U' from the linked GEDCOM record, or undefined for non-
   *  person articles (family, event, meta). Translator uses this to pick
   *  gendered verb forms in languages that require it (Russian past tense,
   *  Hebrew past tense, etc.). */
  subjectSex?: 'M' | 'F' | 'U';
  /** Canonical translated name pulled from the linked GEDCOM record's
   *  NAME.TRAN substructure for this locale (GEDCOM 7 feature). When
   *  present, the translator should use this verbatim as the title rather
   *  than re-translating from scratch — the GEDCOM is the source of truth
   *  for cross-locale name renderings. Absent for non-person articles or
   *  individuals without TRAN entries (still happens during the migration). */
  nameTranslation?: string;
  /** Title pairs for wikilinked slugs that have already been translated
   *  into this locale. Lets the translator follow established conventions
   *  (e.g. surname renderings) instead of drifting. */
  relatedTranslations?: RelatedTranslation[];
  existingTranslation?: string;
  existingTalkResolved?: string;
}

export interface TranslateResponse {
  body: string;
  talk: string;
  titleTranslation: string;
}

export type Translator = (req: TranslateRequest) => Promise<TranslateResponse>;

/**
 * Request for translating an editorial talk page. The "Talk-page
 * translation" is a separate concern from the article translation:
 * different format (research notes + threads + agent log), different
 * semantics (editorial workspace, not encyclopedia content), and
 * different verbatim-preserve rules (HTML-comment IDs, gap slugs,
 * source URLs, pipeline UUIDs all stay unchanged across locales).
 *
 * `articleTitleTranslation` lets the translator anchor the localized
 * talk-page title (e.g. `"Обсуждение: Авраам Гарольд Франкель"`)
 * against the translated article title so the two stay in sync.
 */
export interface TranslateTalkRequest {
  /** The article slug (without `.talk` suffix). Used by the agent
   *  prompt as the page identifier. */
  slug: string;
  canonicalTalkBody: string;
  canonicalTalkMeta: Record<string, unknown>;
  locale: Locale;
  /** The translated article title, e.g. "Авраам Гарольд Франкель". Used
   *  to construct the talk-page title and to ensure terms match across
   *  the article ↔ talk-page surfaces. */
  articleTitleTranslation: string;
  /** Pre-translated body of the article, for term/name consistency
   *  across the two surfaces. Optional — the translator can work
   *  without it if the article translation is fresh in context. */
  articleTranslatedBody?: string;
  /** Optional existing translated talk-page body for incremental
   *  re-sync (preserve human edits between syncs). */
  existingTalkTranslation?: string;
}

export interface TranslateTalkResponse {
  /** Translated talk-page body (everything after the frontmatter). */
  body: string;
  /** Localized "Talk:" prefix to use in the title frontmatter. e.g.
   *  "Talk", "Обсуждение", "Обговорення", "שיחה". The orchestrator
   *  composes the title as `<prefix>: <articleTitleTranslation>`. */
  titlePrefix: string;
  /** Audit entries (markdown bullet list under "## Unresolved") for
   *  any talk-page translation decisions the human should review.
   *  Folded into the single sibling .translation.talk.md under a
   *  dedicated subsection. */
  auditEntries: string;
}

export type TalkTranslator = (req: TranslateTalkRequest) => Promise<TranslateTalkResponse>;

export interface RunI18nSyncOpts {
  rootDir: string;
  slug: string;
  locale: string;
  translator: Translator;
  /** Optional talk-page translator. When provided AND `includeTalk` is
   *  true (default) AND `pages/en/<slug>.talk.md` exists, runs after
   *  the article translator and writes `pages/{locale}/<slug>.talk.md`
   *  alongside the article. */
  talkTranslator?: TalkTranslator;
  /** Default true. When false, skip talk-page translation even if a
   *  talkTranslator is provided and the EN talk exists. Mirrors the
   *  CLI's `--no-talk` flag. */
  includeTalk?: boolean;
  /** When true, skip the article translator entirely and translate only
   *  the talk page (using the existing article translation for term
   *  consistency). Refuses if `pages/{locale}/<slug>.md` doesn't yet
   *  exist — there's no article context to anchor the talk translation
   *  against. Mirrors the CLI's `--talk-only` flag; the bulk-backfill
   *  pathway uses this to avoid re-translating 181 articles per locale
   *  whose translations are already current. */
  talkOnly?: boolean;
  write: (s: string) => void;
}

export async function runI18nSync(opts: RunI18nSyncOpts): Promise<void> {
  // The slug is interpolated into filesystem paths and a git argument.
  // Reject anything that isn't a clean slug at the boundary — this is an
  // exported function with no other guard on its input.
  if (!isValidSlug(opts.slug)) {
    opts.write(`invalid slug: ${opts.slug}\n`);
    return;
  }
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

  // Talk-only branch: skip the article translator; reuse the existing
  // article translation as anchor context for the talk translator;
  // write only the localized talk page + update the audit file's
  // ### Talk-page translation subsection in place.
  if (opts.talkOnly) {
    return runTalkOnly(opts, canonicalPath);
  }

  const canonicalRaw = await readFile(canonicalPath, 'utf8');
  const canonicalPage = parsePage(opts.slug, canonicalRaw);
  const canonicalSha = gitHeadSha(opts.rootDir, `pages/en/${opts.slug}.md`);

  // Look up sex from the linked GEDCOM-derived record, when this article
  // represents a person. Non-person articles (family/event/meta) won't have
  // a gedcom.record and the translator gets undefined — correct: there's
  // no individual subject whose verb forms need gendering.
  //
  // Regex extraction (over full YAML parsing) keeps the CLI dep-free; the
  // derived YAML format is stable and `sex: <code>` is always on its own
  // line at the top level of the file.
  const gedcomRecord = (canonicalPage.meta as { gedcom?: { record?: string } }).gedcom?.record;
  let subjectSex: 'M' | 'F' | 'U' | undefined = undefined;
  let nameTranslation: string | undefined = undefined;
  if (gedcomRecord) {
    const derivedPath = join(opts.rootDir, 'genealogy', 'derived', `${gedcomRecord}.yml`);
    if (existsSync(derivedPath)) {
      const body = await readFile(derivedPath, 'utf8');
      const sexMatch = body.match(/^sex:\s*([MFU])\s*$/m);
      if (sexMatch) subjectSex = sexMatch[1] as 'M' | 'F' | 'U';
      // NAME.TRAN lookup: the derive layer emits
      //   nameTranslations:
      //     ru: <translated name>
      //     uk: <translated name>
      //     he: <translated name>
      // when GEDCOM 7 NAME.TRAN substructures exist. Pick the one for our locale;
      // translator uses it as the canonical translated title (no re-translation).
      const tranMatch = body.match(
        new RegExp(`^nameTranslations:\\n(  [a-z]{2,3}: .+\\n)+`, 'm'),
      );
      if (tranMatch) {
        const locMatch = tranMatch[0].match(new RegExp(`^  ${opts.locale}: (.+)$`, 'm'));
        if (locMatch) nameTranslation = locMatch[1].trim().replace(/^['"]|['"]$/g, '');
      }
    }
  }

  const existingTranslationPath = join(opts.rootDir, 'pages', opts.locale, `${opts.slug}.md`);
  const existingTalkPath = join(opts.rootDir, 'pages', opts.locale, `${opts.slug}.translation.talk.md`);
  const existingTranslation = existsSync(existingTranslationPath)
    ? await readFile(existingTranslationPath, 'utf8')
    : undefined;
  const existingTalkResolved = existsSync(existingTalkPath)
    ? extractResolvedSection(await readFile(existingTalkPath, 'utf8'))
    : undefined;

  const relatedTranslations = collectRelatedTranslations(
    opts.rootDir,
    canonicalPage.body,
    opts.locale as Locale,
    opts.slug,
  );

  opts.write(`translating ${opts.slug} -> ${opts.locale}...\n`);
  if (relatedTranslations.length > 0) {
    opts.write(`  ${relatedTranslations.length} related translation(s) found in ${opts.locale}\n`);
  }

  const response = await opts.translator({
    canonicalBody: canonicalPage.body,
    canonicalMeta: canonicalPage.meta as unknown as Record<string, unknown>,
    locale: opts.locale as Locale,
    subjectSex,
    nameTranslation,
    relatedTranslations,
    existingTranslation,
    existingTalkResolved,
  });

  const today = new Date().toISOString().slice(0, 10);
  // LLM-authored content records the actual model. Override via WAI_AUTHOR_MODEL.
  const authorModel = process.env.WAI_AUTHOR_MODEL ?? 'Claude Opus 4.7';
  const frontmatter = `---
schemaVersion: ${canonicalPage.meta.schemaVersion}
title: ${yamlScalar(stripTitleQuotes(response.titleTranslation))}
author: ${authorModel}
lang: ${opts.locale}
translation_of: ${opts.slug}
canonical_sha: ${canonicalSha}
translated_at: '${today}'
---
`;
  const translationFile = `${frontmatter}${response.body}`;

  // ─── Talk-page translation (optional) ──────────────────────────────
  // Runs after the article translation when (1) the orchestrator
  // includes a talkTranslator, (2) the caller hasn't opted out via
  // includeTalk: false (mirrors the CLI's `--no-talk` flag), and (3)
  // the EN canonical has an editorial talk page at
  // pages/en/<slug>.talk.md. Skipped silently otherwise — many short
  // articles have no talk page and that's fine.
  const includeTalk = opts.includeTalk !== false;
  const enTalkPath = join(opts.rootDir, 'pages', 'en', `${opts.slug}.talk.md`);
  const localizedTalkPath = join(opts.rootDir, 'pages', opts.locale, `${opts.slug}.talk.md`);
  const willTranslateTalk = includeTalk && !!opts.talkTranslator && existsSync(enTalkPath);
  let talkAuditSection = '';
  if (willTranslateTalk && opts.talkTranslator) {
    const enTalkRaw = await readFile(enTalkPath, 'utf8');
    // Talk pages carry type: meta which intentionally fails the article
    // schema, so don't run them through parsePage. The format is stable
    // (`---\n<yaml>\n---\n<body>`) — split by hand.
    const enTalkBody = stripFrontmatter(enTalkRaw);
    const enTalkSha = gitHeadSha(opts.rootDir, `pages/en/${opts.slug}.talk.md`);
    const existingTalkTranslation = existsSync(localizedTalkPath)
      ? await readFile(localizedTalkPath, 'utf8')
      : undefined;

    opts.write(`translating ${opts.slug}.talk -> ${opts.locale}...\n`);
    const talkResponse = await opts.talkTranslator({
      slug: opts.slug,
      canonicalTalkBody: enTalkBody,
      canonicalTalkMeta: {},
      locale: opts.locale as Locale,
      articleTitleTranslation: stripTitleQuotes(response.titleTranslation),
      articleTranslatedBody: response.body,
      existingTalkTranslation,
    });

    // Categories field follows the same EN spec: [Open editorial questions]
    // iff the translated body has at least one ::open thread (markers
    // preserve verbatim across locales, so the count should match EN).
    const openCount = parseTalkThreads(talkResponse.body)
      .filter(t => t.marker === 'open').length;
    const categories = openCount > 0 ? '[Open editorial questions]' : '[]';
    const subjectTitle = stripTitleQuotes(response.titleTranslation);
    const localizedTalkTitle = yamlScalar(`${talkResponse.titlePrefix}: ${subjectTitle}`);

    // Frontmatter shape: 7 baseline fields (per the editorial-guide
    // format spec) PLUS the translation stamps (lang, translation_of,
    // canonical_sha, translated_at) — the translated talk is still
    // translated content with its own staleness lifecycle. The
    // talk-page-format detector skips non-EN paths so these extras
    // don't trip rule 1's frontmatter contract.
    const talkPageFrontmatter = `---
schemaVersion: 1
title: ${localizedTalkTitle}
author: ${authorModel}
type: meta
aliases: []
categories: ${categories}
created: '${today}'
lang: ${opts.locale}
translation_of: ${opts.slug}
canonical_sha: ${enTalkSha}
translated_at: '${today}'
---
`;
    await mkdir(join(opts.rootDir, 'pages', opts.locale), { recursive: true });
    await atomicWrite(localizedTalkPath, `${talkPageFrontmatter}\n${talkResponse.body}`);

    // Fold the talk-page translation audit into the single
    // .translation.talk.md. The entries are checkbox-style unresolved
    // decisions semantically equivalent to the article's `## Unresolved`
    // items, so they belong INSIDE that section — appending after the
    // entire response.talk string would land them under `## Resolved`,
    // which is for human-confirmed decisions, not waiting-for-review.
    talkAuditSection = talkResponse.auditEntries.trim()
      ? `\n### Talk-page translation\n\n${talkResponse.auditEntries.trim()}\n`
      : '';
  }

  const articleTalk = talkAuditSection
    ? mergeIntoUnresolved(response.talk, talkAuditSection)
    : response.talk;
  const talkFile = `---
type: translation-talk
author: ${authorModel}
translation_of: ${opts.slug}
lang: ${opts.locale}
canonical_sha_when_logged: ${canonicalSha}
synced_at: '${today}'
---

# Translation notes — ${opts.locale} (${response.titleTranslation})

${articleTalk}`;

  await mkdir(join(opts.rootDir, 'pages', opts.locale), { recursive: true });
  await atomicWrite(existingTranslationPath, translationFile);
  await atomicWrite(existingTalkPath, talkFile);

  opts.write(`wrote pages/${opts.locale}/${opts.slug}.md\n`);
  opts.write(`wrote pages/${opts.locale}/${opts.slug}.translation.talk.md\n`);
  if (willTranslateTalk) {
    opts.write(`wrote pages/${opts.locale}/${opts.slug}.talk.md\n`);
  }
}

/** Strip surrounding YAML quotes if present so the value is usable as
 *  a substring (e.g. composing a Talk-page title). */
function stripTitleQuotes(t: string): string {
  return t.trim().replace(/^["']|["']$/g, '');
}

/**
 * Write `path` atomically: write `path.tmp`, fsync-implicit-via-rename
 * to `path`. SIGINT-safe: an interrupted run leaves either the old
 * file intact or `path.tmp` orphaned (next run rewrites it). The
 * data-repo's PageStore uses the same .tmp+rename pattern; this
 * orchestrator was bypassing it with raw `writeFile`, which on
 * interrupt could leave a half-written page that the backfill's
 * resume logic would then skip as "already done."
 */
async function atomicWrite(path: string, content: string): Promise<void> {
  const tmp = `${path}.tmp`;
  try {
    await writeFile(tmp, content);
    await rename(tmp, path);
  } catch (err) {
    // Best-effort cleanup of the tmp if we crashed between writeFile and
    // rename. Swallow tmp-cleanup errors — the original error matters more.
    try { await unlink(tmp); } catch { /* ignore */ }
    throw err;
  }
}

/**
 * Resolve the HEAD commit SHA that last touched `relPath`. Uses
 * `execFileSync` (no shell) so the rootDir and the interpolated slug in
 * `relPath` can never reach a shell parser. Returns an empty string for
 * an untracked path (`git log` exits 0 with no output).
 */
function gitHeadSha(rootDir: string, relPath: string): string {
  return execFileSync(
    'git',
    ['-C', rootDir, 'log', '-1', '--format=%H', '--', relPath],
    { encoding: 'utf8' },
  ).trim();
}

/**
 * Talk-only sync path. Reuses the existing article translation for
 * anchor context (title + body) and runs only the talk translator.
 * Used by the P2.16 bulk-backfill where the 181 existing article
 * translations per locale are current and re-translating would burn
 * money for ~no benefit.
 *
 * Refusals (emit to `write`, return — these are user-correctable):
 *   - `talkTranslator` not provided (programmer error / agent path off)
 *   - `pages/{locale}/<slug>.md` missing (no article translation to anchor)
 *   - `pages/en/<slug>.talk.md` missing (nothing to translate)
 */
async function runTalkOnly(opts: RunI18nSyncOpts, canonicalPath: string): Promise<void> {
  if (!opts.talkTranslator) {
    opts.write(`--talk-only requires a talk translator; aborting\n`);
    return;
  }
  const existingArticlePath = join(opts.rootDir, 'pages', opts.locale, `${opts.slug}.md`);
  if (!existsSync(existingArticlePath)) {
    opts.write(`--talk-only refuses: pages/${opts.locale}/${opts.slug}.md missing — run a full sync first to create the article translation\n`);
    return;
  }
  const enTalkPath = join(opts.rootDir, 'pages', 'en', `${opts.slug}.talk.md`);
  if (!existsSync(enTalkPath)) {
    opts.write(`--talk-only: no EN talk page at pages/en/${opts.slug}.talk.md; nothing to translate\n`);
    return;
  }

  // Read existing article translation for title + body anchor context.
  const articleRaw = await readFile(existingArticlePath, 'utf8');
  const articleTitleMatch = articleRaw.match(/^title:\s*(.+?)\s*$/m);
  const articleTitle = articleTitleMatch ? stripTitleQuotes(articleTitleMatch[1]!) : opts.slug;
  const articleBody = stripFrontmatter(articleRaw);

  // Read EN talk + (optionally) existing localized talk for incremental re-sync.
  const enTalkRaw = await readFile(enTalkPath, 'utf8');
  const enTalkBody = stripFrontmatter(enTalkRaw);
  const enTalkSha = gitHeadSha(opts.rootDir, `pages/en/${opts.slug}.talk.md`);
  const localizedTalkPath = join(opts.rootDir, 'pages', opts.locale, `${opts.slug}.talk.md`);
  const existingTalkTranslation = existsSync(localizedTalkPath)
    ? await readFile(localizedTalkPath, 'utf8')
    : undefined;

  opts.write(`translating ${opts.slug}.talk -> ${opts.locale} (talk-only)...\n`);
  const talkResponse = await opts.talkTranslator({
    slug: opts.slug,
    canonicalTalkBody: enTalkBody,
    canonicalTalkMeta: {},
    locale: opts.locale as Locale,
    articleTitleTranslation: articleTitle,
    articleTranslatedBody: articleBody,
    existingTalkTranslation,
  });

  const today = new Date().toISOString().slice(0, 10);
  const authorModel = process.env.WAI_AUTHOR_MODEL ?? 'Claude Opus 4.7';
  const openCount = parseTalkThreads(talkResponse.body).filter(t => t.marker === 'open').length;
  const categories = openCount > 0 ? '[Open editorial questions]' : '[]';
  const localizedTalkTitle = yamlScalar(`${talkResponse.titlePrefix}: ${articleTitle}`);

  const talkPageFrontmatter = `---
schemaVersion: 1
title: ${localizedTalkTitle}
author: ${authorModel}
type: meta
aliases: []
categories: ${categories}
created: '${today}'
lang: ${opts.locale}
translation_of: ${opts.slug}
canonical_sha: ${enTalkSha}
translated_at: '${today}'
---
`;
  await mkdir(join(opts.rootDir, 'pages', opts.locale), { recursive: true });
  await atomicWrite(localizedTalkPath, `${talkPageFrontmatter}\n${talkResponse.body}`);
  opts.write(`wrote pages/${opts.locale}/${opts.slug}.talk.md\n`);

  // Update the audit file's ### Talk-page translation subsection in
  // place. If a prior subsection exists from a previous run, strip it
  // first so we don't accumulate duplicates.
  const auditPath = join(opts.rootDir, 'pages', opts.locale, `${opts.slug}.translation.talk.md`);
  if (talkResponse.auditEntries.trim() && existsSync(auditPath)) {
    const auditRaw = await readFile(auditPath, 'utf8');
    const stripped = stripExistingTalkSection(auditRaw);
    const newSection = `\n### Talk-page translation\n\n${talkResponse.auditEntries.trim()}\n`;
    const updated = mergeIntoUnresolved(stripped, newSection);
    await atomicWrite(auditPath, updated);
    opts.write(`updated pages/${opts.locale}/${opts.slug}.translation.talk.md (talk-page audit)\n`);
  }
  // Don't suppress useful warnings: when there ARE talk entries but no
  // audit file exists, surface it. (Practical: --talk-only is meant to
  // run after a full sync, so the audit file should always exist; if it
  // doesn't, something's off and the entries would otherwise be lost.)
  else if (talkResponse.auditEntries.trim() && !existsSync(auditPath)) {
    opts.write(`warning: talk audit entries produced but no audit file at pages/${opts.locale}/${opts.slug}.translation.talk.md — entries not persisted\n`);
  }
}

/** Strip any prior `### Talk-page translation` subsection from a
 *  translation.talk.md body so the merge-in step doesn't accumulate
 *  duplicates across re-syncs. Removes from the subsection heading
 *  through to the next `## ` or `### ` heading (or end of file). */
function stripExistingTalkSection(audit: string): string {
  return audit.replace(/\n### Talk-page translation\n[\s\S]*?(?=\n##\s|\n###\s|$)/, '');
}

/** Insert `section` at the end of the `## Unresolved` block of `talk`,
 *  just before the next `## ` heading (typically `## Resolved`). When
 *  `## Unresolved` is missing, appends `section` to the end as a
 *  last-resort fallback so entries never get silently dropped. */
function mergeIntoUnresolved(talk: string, section: string): string {
  const match = talk.match(/(## Unresolved[\s\S]*?)(\n## [A-Za-z])/);
  if (match) {
    return talk.replace(/(## Unresolved[\s\S]*?)(\n## [A-Za-z])/, `$1${section}$2`);
  }
  // No "## Resolved" follows — the Unresolved section runs to EOF (or
  // there is no Unresolved at all). Append.
  return talk.endsWith('\n') ? `${talk}${section}` : `${talk}\n${section}`;
}

/** Split off the YAML frontmatter and return only the body, trimmed of
 *  leading newlines. Format assumed: `---\n<yaml>\n---\n<body>`. When
 *  no frontmatter is present, returns the raw text trimmed. */
function stripFrontmatter(raw: string): string {
  const lines = raw.split('\n');
  if (lines[0]?.trim() !== '---') return raw.trimStart();
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.trim() === '---') {
      return lines.slice(i + 1).join('\n').trimStart();
    }
  }
  return raw.trimStart();
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

/**
 * Walk every [[wikilink]] in the canonical body. For each slug, check
 * whether a translation already exists at pages/{locale}/<slug>.md. If
 * yes, extract its English canonical title + its translated title, so
 * the translator can mirror naming conventions across the article set
 * instead of inventing fresh renderings.
 */
function collectRelatedTranslations(
  rootDir: string,
  canonicalBody: string,
  locale: Locale,
  currentSlug: string,
): RelatedTranslation[] {
  // Wiki convention: [[Display Title]] OR [[slug|Display Title]]. The
  // first form requires slugification; the second pre-slugified form is
  // taken as-is. toSlug() handles both (it's idempotent on slug input).
  const wikilinkRe = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  const slugs = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = wikilinkRe.exec(canonicalBody)) !== null) {
    const raw = m[1]?.trim().replace(/\.md$/, '');
    if (!raw || raw.startsWith('#')) continue;
    const slug = toSlug(raw);
    if (!slug || slug === currentSlug) continue;
    slugs.add(slug);
  }

  const out: RelatedTranslation[] = [];
  for (const slug of slugs) {
    const enPath = join(rootDir, 'pages', 'en', `${slug}.md`);
    const localePath = join(rootDir, 'pages', locale, `${slug}.md`);
    if (!existsSync(enPath) || !existsSync(localePath)) continue;

    const enTitle = extractTitle(enPath);
    const localeTitle = extractTitle(localePath);
    if (!enTitle || !localeTitle) continue;

    out.push({ slug, enTitle, localeTitle });
  }

  out.sort((a, b) => a.slug.localeCompare(b.slug));
  return out;
}

/**
 * Read just the `title:` line out of a markdown frontmatter without
 * pulling in a YAML parser. The format is stable enough that a regex
 * on the first ~4KB is sufficient and keeps the CLI dep-free.
 */
function extractTitle(path: string): string | undefined {
  try {
    const head = readFileSync(path, 'utf8').slice(0, 4096);
    const titleMatch = head.match(/^title:\s*(.+?)\s*$/m);
    if (!titleMatch) return undefined;
    return titleMatch[1]?.trim().replace(/^['"]|['"]$/g, '');
  } catch {
    return undefined;
  }
}
