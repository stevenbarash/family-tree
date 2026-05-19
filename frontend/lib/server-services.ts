import type { ReactElement } from 'react';
import { randomBytes } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { computeTranslationStatus, parseTranslationTalk, type TranslationStatus } from '@core/i18n/index.ts';
import { readManifest } from '@core/gedcom/snapshots.ts';
import type { SnapshotEntry } from '@core/gedcom/types.ts';
import { createPageStore, type PageStore, type PageMetaSummary, type Page, type PageMeta, type PageType, type NoteKind } from '@core/pages/index.ts';
import { buildSlugIndex, type SlugIndex } from './wikilinks';
import {
  createSearchIndex, loadSearchIndex, saveSearchIndex, rebuildSearchIndex,
  type SearchIndex, type SearchResult,
} from '@core/search/module.ts';
import { runMigrate, type MigrateRunnerOptions, type MigrateReport } from '@core/pages/migrate-runner.ts';
import {
  appendResearchNote,
  extractResearchNotesSection,
  parseResearchNotes,
  editResearchNote,
  softDeleteResearchNote,
  restoreResearchNote,
  NoteNotFoundError,
} from '@core/pages/research-notes.ts';
import { parseTalkThreads, aggregateOpenGaps, type ThreadMarker, type OpenGapsRow } from '@core/pages/talk-threads.ts';
import { findRedlinks, type RedlinkEntry } from '@core/pages/redlinks.ts';
import { toSlug, toTalkSlug, titleCaseFromSlug } from '@core/pages/slug.ts';
import { lastSegment } from '@core/family/places.ts';
import { CURRENT_SCHEMA_VERSION } from '@core/pages/migrations/index.ts';
import { PageNotFoundError } from '@core/pages/store.ts';
import { WHOAMI_ROOT, PAGES_DIR, GENEALOGY_DIR, SEARCH_INDEX_FILE, DEFAULT_AUTHOR } from './env.ts';
import { isSearchIndexStale } from './search-staleness';
import { getCachedDerivedRecords } from './family';
import { renderMarkdown } from './render';

const ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'; // Crockford base32 lowercase, no i/l/o/u

/** Generate `n_` + 8 random base32 chars (40 bits, ~1e12 keyspace). */
export function generateNoteId(): string {
  const bytes = randomBytes(5);
  // Treat 5 bytes as 8 base32 groups by extracting 5-bit chunks.
  // We process bits from MSB to LSB across the 40-bit buffer.
  // bits[i] = extract 5 bits starting at offset i*5 from the 40-bit value.
  let out = '';
  for (let i = 0; i < 8; i++) {
    const bitOffset = i * 5;
    const byteIndex = Math.floor(bitOffset / 8);
    const bitShift = bitOffset % 8;
    // Read up to 2 bytes to span the 5-bit window
    const lo = bytes[byteIndex];
    const hi = byteIndex + 1 < bytes.length ? bytes[byteIndex + 1] : 0;
    const word = (lo << 8) | hi;
    // Extract 5 bits at bitShift from the MSB side of the 16-bit word
    const val = (word >> (11 - bitShift)) & 0x1f;
    out += ID_ALPHABET[val];
  }
  return `n_${out}`;
}

let _pages: PageStore | null = null;

export function getPageStore(): PageStore {
  if (!_pages) {
    _pages = createPageStore({ repoRoot: WHOAMI_ROOT, pagesDir: PAGES_DIR });
  }
  return _pages;
}

// Cached page list + slug index. `store.list()` is O(N) over the pages dir
// (107 file reads today, ~2k at scale); we don't want that on every render.
// 2-second TTL is a pragmatic trade-off — recent edits stay visible quickly,
// reads of repeated pages share the parsed list. Writes call invalidateListCache.
const LIST_TTL_MS = 2000;
let _listCache: { list: PageMetaSummary[]; index: SlugIndex; expiresAt: number } | null = null;

export async function getCachedList(): Promise<{ list: PageMetaSummary[]; index: SlugIndex }> {
  const now = Date.now();
  if (_listCache && _listCache.expiresAt > now) {
    return { list: _listCache.list, index: _listCache.index };
  }
  const list = await getPageStore().list();
  const index = buildSlugIndex(list.filter(p => !p.isTalk).map(p => ({
    slug: p.slug,
    title: p.title,
    aliases: p.aliases,
  })));
  _listCache = { list, index, expiresAt: now + LIST_TTL_MS };
  return { list, index };
}

export function invalidateListCache(): void {
  _listCache = null;
  _recentCache = null;
  _gapsCache = null;
  _redlinksCache = null;
}

// Snapshot manifest is read by the dashboard (age banner) and by every
// article page that has a frontmatter snapshot (date resolution). Same TTL
// as the page list — short enough that a fresh sync shows up quickly.
let _snapshotsCache: { entries: SnapshotEntry[]; expiresAt: number } | null = null;

export async function getCachedSnapshots(genealogyDir: string): Promise<SnapshotEntry[]> {
  const now = Date.now();
  if (_snapshotsCache && _snapshotsCache.expiresAt > now) return _snapshotsCache.entries;
  const entries = await readManifest(genealogyDir);
  _snapshotsCache = { entries, expiresAt: now + LIST_TTL_MS };
  return entries;
}

// Recently-revised articles by file mtime. Caching this avoids 100+ fs.stat
// calls on every dashboard render; stale by up to LIST_TTL_MS is acceptable
// because a freshly-edited page jumps to the top within a couple of seconds.
let _recentCache: { items: RecentItem[]; expiresAt: number } | null = null;

interface RecentItem extends PageMetaSummary {
  mtime: number;
}

export async function getRecentlyRevised(pagesDir: string, limit: number): Promise<RecentItem[]> {
  const now = Date.now();
  if (_recentCache && _recentCache.expiresAt > now) return _recentCache.items.slice(0, limit);
  const { list } = await getCachedList();
  const live = list.filter(p => !p.isTalk && !p.isArchived);
  const items = await Promise.all(
    live.map(async p => {
      try {
        const s = await stat(join(pagesDir, `${p.slug}.md`));
        return { ...p, mtime: s.mtimeMs };
      } catch {
        return { ...p, mtime: 0 };
      }
    }),
  );
  items.sort((a, b) => b.mtime - a.mtime);
  _recentCache = { items, expiresAt: now + LIST_TTL_MS };
  return items.slice(0, limit);
}

// Editorial-gaps top-N for the home dashboard. Walks every live page's
// talk body (~50 reads today, ~500 at scale). 2s TTL collapses repeated
// renders; invalidated whenever the list cache is invalidated (any page
// write).
let _gapsCache: { rows: OpenGapsRow[]; total: number; articles: number; expiresAt: number } | null = null;

export interface OpenGapsView {
  rows: OpenGapsRow[];
  /** Total unresolved threads across the whole wiki. */
  total: number;
  /** Number of articles that have at least one unresolved thread. */
  articles: number;
}

export async function getCachedOpenGaps(limit: number): Promise<OpenGapsView> {
  const now = Date.now();
  if (_gapsCache && _gapsCache.expiresAt > now) {
    return { rows: _gapsCache.rows.slice(0, limit), total: _gapsCache.total, articles: _gapsCache.articles };
  }
  const { list } = await getCachedList();
  const live = list.filter(p => !p.isTalk && !p.isArchived);

  // Read every live page's talk body in parallel (silent on missing).
  const withTalk = await Promise.all(
    live.map(async p => ({
      slug: p.slug,
      title: p.title,
      talkBody: await readTalkBody(toTalkSlug(p.slug)),
    })),
  );

  // Full-list aggregate (for the footer) computed off the same data,
  // then slice to `limit` for display.
  const fullRows = aggregateOpenGaps(withTalk, Number.POSITIVE_INFINITY);
  const total = fullRows.reduce((s, r) => s + r.count, 0);
  const articles = fullRows.length;

  _gapsCache = { rows: fullRows, total, articles, expiresAt: now + LIST_TTL_MS };
  return { rows: fullRows.slice(0, limit), total, articles };
}

let _search: SearchIndex | null = null;
let _searchReady: Promise<void> | null = null;
let _devStaleCheck: Promise<void> | null = null;

export async function getSearchIndex(): Promise<SearchIndex> {
  if (!_search) {
    _search = createSearchIndex();
    _searchReady = (async () => {
      const loaded = await loadSearchIndex(_search!, SEARCH_INDEX_FILE);
      if (!loaded) {
        await rebuildSearchIndex(_search!, {
          pagesDir: PAGES_DIR,
          genealogyDir: GENEALOGY_DIR,
        });
        await saveSearchIndex(_search!, SEARCH_INDEX_FILE);
      }
    })();
  }
  await _searchReady;
  // Dev only: if pages have been edited outside the API path, rebuild
  // before returning. Single in-flight guard collapses concurrent checks.
  if (process.env.NODE_ENV === 'development') {
    if (!_devStaleCheck) {
      _devStaleCheck = (async () => {
        try {
          if (isSearchIndexStale(PAGES_DIR, SEARCH_INDEX_FILE)) {
            await rebuildSearchIndexFromDisk();
          }
        } finally {
          _devStaleCheck = null;
        }
      })();
    }
    await _devStaleCheck;
  }
  return _search!;
}

export async function persistSearchIndex(): Promise<void> {
  if (!_search) return;
  await saveSearchIndex(_search, SEARCH_INDEX_FILE);
}

// Talk + archived pages are skipped: notes and tombstones shouldn't
// grow the want-list of articles to write. Cached because the
// fan-out read across every page body is the same cost as the gaps
// walk; invalidated whenever any page is written.
let _redlinksCache: { entries: RedlinkEntry[]; expiresAt: number } | null = null;

export async function getRedlinks(): Promise<RedlinkEntry[]> {
  const now = Date.now();
  if (_redlinksCache && _redlinksCache.expiresAt > now) return _redlinksCache.entries;
  const { list, index } = await getCachedList();
  const live = list.filter(p => !p.isTalk && !p.isArchived);
  const store = getPageStore();
  const pages = await Promise.all(
    live.map(async p => {
      try {
        const page = await store.read(p.slug);
        return { slug: p.slug, body: page.body };
      } catch (err) {
        console.warn(`getRedlinks: skipping ${p.slug}: ${(err as Error).message}`);
        return { slug: p.slug, body: '' };
      }
    }),
  );
  const entries = findRedlinks(pages, new Set(index.byCanonical.keys()));
  _redlinksCache = { entries, expiresAt: now + LIST_TTL_MS };
  return entries;
}

export async function rebuildSearchIndexFromDisk(): Promise<{ pages: number; ms: number }> {
  const t0 = Date.now();
  const idx = createSearchIndex();
  const pages = await rebuildSearchIndex(idx, {
    pagesDir: PAGES_DIR,
    genealogyDir: GENEALOGY_DIR,
  });
  await saveSearchIndex(idx, SEARCH_INDEX_FILE);
  _search = idx;
  return { pages, ms: Date.now() - t0 };
}

/**
 * Pure orchestration: run the migrate runner, then trigger the
 * rebuild only when at least one page was actually migrated and we
 * are not in dry-run. Pulled out for unit testing without touching
 * real disk or the real rebuild path.
 */
export async function orchestrateMigrate(
  opts: MigrateRunnerOptions,
  runner: (o: MigrateRunnerOptions) => Promise<MigrateReport>,
  rebuild: () => Promise<unknown>,
): Promise<MigrateReport> {
  const report = await runner(opts);
  if (!opts.dryRun && report.migrated.length > 0) {
    await rebuild();
  }
  return report;
}

/**
 * Server-side wrapper that wires runMigrate to the real
 * rebuildSearchIndexFromDisk and the real WHOAMI_ROOT / PAGES_DIR.
 */
export async function runMigrateOnDisk(
  opts: Pick<MigrateRunnerOptions, 'page' | 'dryRun' | 'force'>,
): Promise<MigrateReport> {
  return orchestrateMigrate(
    { repoRoot: WHOAMI_ROOT, pagesDir: PAGES_DIR, ...opts },
    runMigrate,
    rebuildSearchIndexFromDisk,
  );
}

export class InvalidRecordIdError extends Error {
  constructor(public readonly recordId: string) {
    super(`invalid record id: ${recordId}`);
    this.name = 'InvalidRecordIdError';
  }
}

export class UnknownRecordError extends Error {
  constructor(public readonly recordId: string) {
    super(`unknown record: ${recordId}`);
    this.name = 'UnknownRecordError';
  }
}

export class NameEmptySlugError extends Error {
  constructor(public readonly name: string) {
    super(`name produces empty slug: ${name}`);
    this.name = 'NameEmptySlugError';
  }
}

interface PageDefaultsOpts {
  title: string;
  type?: PageType;
}

export function defaultPageMeta(opts: PageDefaultsOpts): PageMeta {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    title: opts.title,
    owner: DEFAULT_AUTHOR.name,
    editors: [],
    type: opts.type ?? 'meta',
    aliases: [],
    categories: [],
    created: new Date().toISOString().slice(0, 10),
    corrections: [],
  };
}

/**
 * Resolve a GEDCOM record id to the article slug its notes hang under.
 * Prefers an article tagged with the record; otherwise falls back to a
 * name-derived slug, suffixed with the record id when that base slug
 * is already taken.
 */
export async function resolveSlugForRecord(recordId: string): Promise<string> {
  if (!/^I\d+$/.test(recordId)) throw new InvalidRecordIdError(recordId);
  const { list } = await getCachedList();

  let tagged: PageMetaSummary | undefined;
  let nameConflict: PageMetaSummary | undefined;
  let baseSlug = '';
  // First pass: find the record-tagged article if it exists.
  for (const p of list) {
    if (p.isArchived) continue;
    if (p.gedcomRecord === recordId) { tagged = p; break; }
  }
  if (tagged) return tagged.slug;

  const derived = getCachedDerivedRecords().get(recordId);
  if (!derived) throw new UnknownRecordError(recordId);
  baseSlug = toSlug(derived.name);
  if (!baseSlug) throw new NameEmptySlugError(derived.name);

  for (const p of list) {
    if (p.isArchived) continue;
    if (p.slug === baseSlug) { nameConflict = p; break; }
  }
  return nameConflict ? `${baseSlug}-${recordId.toLowerCase()}` : baseSlug;
}

const noteLocks = new Map<string, Promise<unknown>>();

async function withTalkLock<T>(talkSlug: string, fn: () => Promise<T>): Promise<T> {
  const prev = noteLocks.get(talkSlug);
  const next = (async () => {
    if (prev) await prev.catch(() => undefined);
    return fn();
  })();
  noteLocks.set(talkSlug, next);
  try {
    return await next;
  } finally {
    if (noteLocks.get(talkSlug) === next) noteLocks.delete(talkSlug);
  }
}

export interface AppendNoteInput {
  text: string;
  by: string;
  kind: NoteKind;
}

export interface AppendNoteResult {
  date: string;
  id: string;
}

/**
 * Append a dated research note to `<slug>.talk.md`'s `## Research notes`
 * section. Serialized per talk slug so concurrent writes can't drop
 * each other's entries between read and write.
 */
export async function appendNoteOnDisk(
  slug: string,
  input: AppendNoteInput,
): Promise<AppendNoteResult> {
  const talkSlug = toTalkSlug(slug);
  const now = new Date();
  const createdAt = now.toISOString();
  const date = createdAt.slice(0, 10);
  return withTalkLock(talkSlug, async () => {
    const pages = getPageStore();
    let body = '';
    let meta: PageMeta;
    try {
      const page = await pages.read(talkSlug);
      body = page.body;
      meta = page.meta;
    } catch (err) {
      if (!(err instanceof PageNotFoundError)) throw err;
      meta = defaultPageMeta({ title: `Talk: ${titleCaseFromSlug(talkSlug)}` });
    }
    const id = uniqueIdForBody(body);
    const nextBody = appendResearchNote(body, {
      id,
      text: input.text,
      by: input.by,
      kind: input.kind,
      createdAt,
    }, { date });
    const nextPage: Page = { slug: talkSlug, meta, body: nextBody };
    await pages.write(talkSlug, nextPage, DEFAULT_AUTHOR, `note: ${date}`);
    invalidateListCache();
    return { date, id };
  });
}

function uniqueIdForBody(body: string): string {
  const existing = new Set(parseResearchNotes(body).map((n) => n.id));
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = generateNoteId();
    if (!existing.has(id)) return id;
  }
  throw new Error('failed to generate unique note id after 10 attempts');
}

export async function editNoteOnDisk(
  slug: string,
  id: string,
  newText: string,
  editor: string,
): Promise<{ id: string; editedAt: string }> {
  const talkSlug = toTalkSlug(slug);
  const editedAt = new Date().toISOString();
  return withTalkLock(talkSlug, async () => {
    const pages = getPageStore();
    let page;
    try {
      page = await pages.read(talkSlug);
    } catch (err) {
      if (err instanceof PageNotFoundError) throw new NoteNotFoundError(id);
      throw err;
    }
    const nextBody = editResearchNote(page.body, id, newText, editor, editedAt);
    const next: Page = { slug: talkSlug, meta: page.meta, body: nextBody };
    await pages.write(talkSlug, next, DEFAULT_AUTHOR, `note: edit ${id.slice(0, 10)}`);
    invalidateListCache();
    return { id, editedAt };
  });
}

export async function softDeleteNoteOnDisk(
  slug: string,
  id: string,
  deleter: string,
): Promise<{ id: string; deletedAt: string }> {
  const talkSlug = toTalkSlug(slug);
  const deletedAt = new Date().toISOString();
  return withTalkLock(talkSlug, async () => {
    const pages = getPageStore();
    let page;
    try {
      page = await pages.read(talkSlug);
    } catch (err) {
      if (err instanceof PageNotFoundError) throw new NoteNotFoundError(id);
      throw err;
    }
    const nextBody = softDeleteResearchNote(page.body, id, deleter, deletedAt);
    const next: Page = { slug: talkSlug, meta: page.meta, body: nextBody };
    await pages.write(talkSlug, next, DEFAULT_AUTHOR, `note: retract ${id.slice(0, 10)}`);
    invalidateListCache();
    return { id, deletedAt };
  });
}

export async function restoreNoteOnDisk(
  slug: string,
  id: string,
  restorer: string,
): Promise<{ id: string; restoredAt: string }> {
  const talkSlug = toTalkSlug(slug);
  const restoredAt = new Date().toISOString();
  return withTalkLock(talkSlug, async () => {
    const pages = getPageStore();
    let page;
    try {
      page = await pages.read(talkSlug);
    } catch (err) {
      if (err instanceof PageNotFoundError) throw new NoteNotFoundError(id);
      throw err;
    }
    const nextBody = restoreResearchNote(page.body, id, restorer, restoredAt);
    const next: Page = { slug: talkSlug, meta: page.meta, body: nextBody };
    await pages.write(talkSlug, next, DEFAULT_AUTHOR, `note: restore ${id.slice(0, 10)}`);
    invalidateListCache();
    return { id, restoredAt };
  });
}

/**
 * Read the talk-page body, returning '' when no talk page exists.
 * Used by the article and tree pages so they can fire the read in
 * parallel with the rest of their data fetching.
 *
 * Locale-aware (Phase B.3): when `locale` is non-`en`, tries
 * `pages/{locale}/<talkSlug>.md` first and falls back to the EN
 * canonical when the localized file is missing. Callers on
 * `/<locale>/<slug>` routes pass their `locale` so readers on the
 * Russian wiki see Russian editorial threads (once those translations
 * have been produced by `wai i18n sync` from the B.1/B.2 pipeline).
 */
export async function readTalkBody(talkSlug: string, locale: string = 'en'): Promise<string> {
  return readTalkBodyWithStore(getPageStore(), talkSlug, locale);
}

/** DI-friendly internal: same logic, accepts the store explicitly so
 *  tests can pass a tmpdir-backed PageStore without env-var setup. */
export async function readTalkBodyWithStore(
  store: PageStore,
  talkSlug: string,
  locale: string,
): Promise<string> {
  if (locale && locale !== 'en') {
    try {
      return (await store.read(talkSlug, { locale })).body;
    } catch (err) {
      if (!(err instanceof PageNotFoundError)) throw err;
      // Fall through to the EN canonical.
    }
  }
  try {
    return (await store.read(talkSlug)).body;
  } catch (err) {
    if (err instanceof PageNotFoundError) return '';
    throw err;
  }
}

export interface TranslationInfo {
  status: TranslationStatus;
  unresolvedCount: number;
  page: Page;
}

/**
 * Resolve a page + its translation status for the given locale. For
 * the canonical locale (en) this short-circuits to a plain read with
 * status "current". For other locales it compares the translation's
 * `canonical_sha` to the canonical EN file's HEAD commit sha and
 * counts unresolved entries in the translation talk page; status is
 * computed from the triple via `computeTranslationStatus`. When the
 * translation is missing (or has no `canonical_sha`), the canonical
 * EN page is returned so the article still renders behind a "not
 * translated yet" banner.
 */
export async function getTranslationInfo(slug: string, locale: string): Promise<TranslationInfo> {
  const store = getPageStore();

  if (locale === 'en') {
    const page = await store.read(slug);
    return { status: 'current', unresolvedCount: 0, page };
  }

  let translationPage: Page | undefined;
  try {
    translationPage = await store.read(slug, { locale });
  } catch {
    translationPage = undefined;
  }

  const canonicalHeadSha = getCanonicalHeadSha(slug);
  const translationCanonicalSha = translationPage?.meta.canonicalSha;

  const talkPath = join(WHOAMI_ROOT, 'pages', locale, `${slug}.translation.talk.md`);
  const talkBody = existsSync(talkPath) ? readFileSync(talkPath, 'utf8') : '';
  const talkSummary = parseTranslationTalk(talkBody);

  const status = computeTranslationStatus({
    translationCanonicalSha,
    canonicalHeadSha,
    unresolvedTalkEntries: talkSummary.unresolved,
  });

  const page = (status === 'missing' || translationPage === undefined)
    ? await store.read(slug)
    : translationPage;

  return { status, unresolvedCount: talkSummary.unresolved, page };
}

/**
 * HEAD commit sha for the canonical EN file of `slug`, or '' when git
 * can't answer (file untracked, repo missing). Sync exec is acceptable
 * here: one short git call per article render, and the async
 * equivalent (spawn + stream) is materially more code.
 */
function getCanonicalHeadSha(slug: string): string {
  try {
    return execSync(
      `git -C "${WHOAMI_ROOT}" log -1 --format=%H -- pages/en/${slug}.md`,
      { encoding: 'utf8' },
    ).trim();
  } catch {
    return '';
  }
}

/** Render the `## Research notes` section of a talk-page body, or null
 *  if the section is absent. */
export async function renderNotesSection(
  talkBody: string,
  index: SlugIndex,
): Promise<ReactElement | null> {
  const section = extractResearchNotesSection(talkBody);
  if (!section) return null;
  return renderMarkdown(section, index);
}

export interface NoteView {
  id: string;
  date: string;
  by: string;
  kind: NoteKind;
  createdAt: string | null;
  editedAt: string | null;
  editedBy: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  isLegacy: boolean;
  /** Raw bullet prose, preserved so the edit form has source text. */
  text: string;
  /** Pre-rendered prose (wikilinks resolved). */
  rendered: ReactElement;
}

export async function buildNotesView(
  talkBody: string,
  index: SlugIndex,
): Promise<NoteView[]> {
  const notes = parseResearchNotes(talkBody);
  return Promise.all(notes.map(async n => ({
    id: n.id,
    date: n.date,
    by: n.by,
    kind: n.kind,
    createdAt: n.createdAt,
    editedAt: n.editedAt,
    editedBy: n.editedBy,
    deletedAt: n.deletedAt,
    deletedBy: n.deletedBy,
    isLegacy: n.isLegacy,
    text: n.text,
    rendered: await renderMarkdown(n.text, index),
  })));
}

export interface TalkThreadView {
  level: 2 | 3;
  heading: string;
  marker: ThreadMarker;
  rendered: ReactElement;
}

export interface TalkThreadsView {
  open: TalkThreadView[];        // marker: 'open' | 'gap'
  resolved: TalkThreadView[];    // marker: 'closed'
  superseded: TalkThreadView[];  // marker: 'superseded'
}

/**
 * Parse the `::open`/`::closed`/`::superseded`/`::gap` threads from a
 * talk-page body and pre-render each body to a React tree (with
 * wikilinks resolved against the global slug index). Empty groups are
 * empty arrays — the caller decides whether to render the panel.
 */
export async function buildTalkThreadsView(
  talkBody: string,
  index: SlugIndex,
): Promise<TalkThreadsView> {
  const threads = parseTalkThreads(talkBody);
  if (threads.length === 0) {
    return { open: [], resolved: [], superseded: [] };
  }
  const views = await Promise.all(threads.map(async (t): Promise<TalkThreadView> => ({
    level: t.level,
    heading: t.heading,
    marker: t.marker,
    rendered: await renderMarkdown(t.body, index),
  })));
  return {
    open: views.filter(v => v.marker === 'open' || v.marker === 'gap'),
    resolved: views.filter(v => v.marker === 'closed'),
    superseded: views.filter(v => v.marker === 'superseded'),
  };
}

export async function searchAndJoin(
  query: string,
  limit: number,
  opts: { includeRestricted?: boolean } = {},
): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  const idx = await getSearchIndex();
  const hits = idx.query(query, { limit, includeRestricted: opts.includeRestricted });
  if (hits.length === 0) return [];
  const { list } = await getCachedList();
  const bySlug = new Map(list.map(p => [p.slug, p]));
  const records = getCachedDerivedRecords();
  const results: SearchResult[] = [];
  for (const h of hits) {
    const meta = bySlug.get(h.slug);
    if (!meta || meta.isArchived) continue;
    const derived = meta.gedcomRecord ? records.get(meta.gedcomRecord) : null;
    const place = derived?.birth?.place ?? null;
    results.push({
      slug: h.slug,
      title: meta.title,
      type: meta.type,
      place,
      placeBucket: placeBucketOf(place),
    });
  }
  return results;
}

/** Bucket key for the search-page place facet — `lastSegment` (which already
 *  handles country normalization like `USA` → `United States`), lowercased
 *  for case-insensitive matching. Round-trips back to display form via the
 *  caller's title-case helper. */
function placeBucketOf(place: string | null | undefined): string | null {
  if (!place) return null;
  return lastSegment(place).toLowerCase() || null;
}
