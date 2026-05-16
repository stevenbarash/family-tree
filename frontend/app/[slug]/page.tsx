import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  getPageStore,
  getCachedList,
  getCachedSnapshots,
  readTalkBody,
  buildNotesView,
} from '@/lib/server-services';
import { renderMarkdown } from '@/lib/render';
import { loadDerivedRecord } from '@/lib/derived';
import { isValidSlug, isTalkSlug, toTalkSlug } from '@core/pages/index.ts';
import { FutureSchemaVersionError } from '@core/pages/migrations/index.ts';
import { GENEALOGY_DIR, PRIVACY_GATE_ENABLED, SELF_RECORD, WHOAMI_ROOT } from '@/lib/env';
import type { Page } from '@core/pages/index.ts';
import { ResearchNotesPanel } from '@/components/research-notes/panel';
import { RestrictedNotice } from '@/components/restricted-notice';
import { countCitations, countOpenGaps, formatTalkLabel } from '@/lib/citations';
import { getCachedDerivedRecords } from '@/lib/family';
import { computeRelationshipFromSelf } from '@/lib/relationship-from-self';
import { RelationshipStrip } from '@/components/relationship-strip';
import { buildHoverDataBySlug } from '@/lib/page-card-data';
import type { PageMetaSummary, PageStore } from '@core/pages/index.ts';

export const dynamic = 'force-dynamic';

export default async function PageRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();

  const store = getPageStore();
  const indexPromise = getCachedList();

  let page: Page;
  try {
    page = await store.read(slug);
  } catch (err) {
    if (err instanceof FutureSchemaVersionError) {
      return (
        <main className="mx-auto max-w-3xl p-6">
          <Link href="/" className="text-sm text-muted-foreground">← Index</Link>
          <h1 className="text-3xl font-bold mt-4 mb-2">Code is out of date</h1>
          <p className="text-muted-foreground">
            This page was written by a newer version of the wiki
            (schema v{err.fromVersion}; this build understands v{err.current}).
            Pull the latest code to read it.
          </p>
        </main>
      );
    }
    notFound();
  }

  const derivedPromise = page.meta.gedcom?.record
    ? loadDerivedRecord(WHOAMI_ROOT, page.meta.gedcom.record)
    : Promise.resolve(null);
  const talkBodyPromise = isTalkSlug(slug) ? Promise.resolve('') : readTalkBody(toTalkSlug(slug));
  const snapshotsPromise = page.meta.gedcom?.snapshot
    ? getCachedSnapshots(GENEALOGY_DIR)
    : Promise.resolve([]);

  const [{ list, index }, derived, talkBody, snapshots] = await Promise.all([
    indexPromise,
    derivedPromise,
    talkBodyPromise,
    snapshotsPromise,
  ]);

  // Compute the relationship from the configured SELF_RECORD to this
  // page's subject, when the page is joined to a GEDCOM record. Skip
  // entirely for talk pages, restricted pages, or pages without a
  // gedcom.record — the conditions are folded into the render guard
  // below; here we just keep the compute cheap when it's unused.
  const targetRecord = page.meta.gedcom?.record ?? null;
  const relationship =
    targetRecord && !isTalkSlug(slug)
      ? (() => {
          // Build record → slug once from the page list. PageMetaSummary
          // carries a flat `gedcomRecord` field; the SlugIndex (keyed by
          // canonical title) can't answer this question on its own.
          const recordToSlug = new Map<string, string>();
          for (const p of list) {
            if (p.gedcomRecord && !p.isTalk && !p.isArchived) {
              recordToSlug.set(p.gedcomRecord, p.slug);
            }
          }
          return computeRelationshipFromSelf({
            selfRecord: SELF_RECORD,
            targetRecord,
            records: getCachedDerivedRecords(),
            findSlug: (record) => recordToSlug.get(record),
          });
        })()
      : null;

  // Privacy gate: when enabled, restricted records render only the
  // redacted minimum (skip the body so directives can't leak fields).
  // The gate is master-toggled in `env.ts`; currently disabled.
  const isRestricted = PRIVACY_GATE_ENABLED && derived?.privacy?.restricted === true;

  // Hover-card data: identify which slugs this page links to, fetch their
  // bodies in parallel, and precompute card content. Limiting to linked
  // slugs (vs. all pages) keeps the request path cheap on dense pages.
  const linkedSlugs = isRestricted ? new Set<string>() : extractLinkedSlugs(page.body, list);
  const bodiesBySlug = isRestricted
    ? new Map<string, string>()
    : await readBodiesForSlugs(getPageStore(), linkedSlugs);
  const hoverDataBySlug = buildHoverDataBySlug(list, getCachedDerivedRecords(), bodiesBySlug);

  const [tree, notes] = isRestricted
    ? [null, []]
    : await Promise.all([
        renderMarkdown(page.body, index, { derived, hoverDataBySlug, currentSlug: slug }),
        buildNotesView(talkBody, index),
      ]);

  const gedcomSnapshotDate = page.meta.gedcom?.snapshot
    ? snapshots.find(s => s.hash === page.meta.gedcom!.snapshot)?.date?.slice(0, 10) ?? null
    : null;
  const sourceCount = countCitations(page.body);
  const liveNoteCount = notes.filter(n => !n.deletedAt).length;
  const openGapCount = countOpenGaps(talkBody);
  const showStrip = !isTalkSlug(slug) && !isRestricted
    && (page.meta.created || page.meta.editors.length > 0 || gedcomSnapshotDate || sourceCount > 0 || liveNoteCount > 0 || openGapCount > 0);

  return (
    <main className="mx-auto min-w-0 max-w-3xl px-4 py-6 sm:px-6 lg:py-10">
      <Link href="/" className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        ← Index
      </Link>
      <header className="mt-7 mb-8 border-b pb-6">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground capitalize">
          {page.meta.type}
        </p>
        <h1 className="text-4xl font-semibold leading-tight tracking-normal text-foreground sm:text-5xl">
          {page.meta.title}
        </h1>
        {!isRestricted && relationship ? (
          <RelationshipStrip relationship={relationship} />
        ) : null}
        {!isRestricted && page.meta.categories.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {page.meta.categories.map(category => (
              <span key={category} className="rounded-full border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {category}
              </span>
            ))}
          </div>
        ) : null}
        {showStrip ? (
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground/85">
            {page.meta.created ? <span>created {page.meta.created}</span> : null}
            {page.meta.editors.length > 0 ? (
              <span>editors: {page.meta.editors.join(', ')}</span>
            ) : null}
            {gedcomSnapshotDate ? (
              <span>GEDCOM snapshot {gedcomSnapshotDate}</span>
            ) : null}
            {sourceCount > 0 ? (
              <span>{sourceCount} {sourceCount === 1 ? 'source' : 'sources'} cited</span>
            ) : null}
            {liveNoteCount > 0 || openGapCount > 0 ? (
              <Link
                href={`/${toTalkSlug(slug)}`}
                className="underline-offset-4 hover:text-foreground hover:underline"
              >
                talk: {formatTalkLabel(liveNoteCount, openGapCount)} →
              </Link>
            ) : null}
          </div>
        ) : null}
      </header>
      {isRestricted && derived ? (
        <RestrictedNotice page={page} derived={derived} />
      ) : (
        <>
          <article className="wiki-article prose prose-stone dark:prose-invert max-w-none prose-headings:font-heading prose-headings:tracking-normal prose-h2:mt-12 prose-h2:text-2xl prose-h3:text-xl prose-p:leading-8 prose-li:my-1 prose-a:font-medium prose-a:decoration-primary/35 prose-a:hover:decoration-primary prose-blockquote:rounded-r-lg prose-blockquote:bg-muted/35 prose-blockquote:py-1 prose-blockquote:not-italic">
            {tree}
          </article>
          {isTalkSlug(slug) ? null : (
            <ResearchNotesPanel slug={slug} notes={notes} />
          )}
        </>
      )}
    </main>
  );
}

/**
 * Scan a page body for `[Text](/<slug>)` links and `[[Title]]` wikilinks,
 * return the set of internal slugs referenced. Used to bound the per-render
 * hover-card data build to just the pages this page actually links to.
 */
function extractLinkedSlugs(body: string, list: ReadonlyArray<PageMetaSummary>): Set<string> {
  const out = new Set<string>();
  // Direct `/<slug>` links from already-resolved markdown.
  for (const m of body.matchAll(/\]\(\/([a-z0-9-]+)(?:[#?][^)]*)?\)/g)) {
    out.add(m[1]!);
  }
  // Unresolved wikilinks — match against title/alias (case-insensitive).
  const byCanonical = new Map<string, string>();
  for (const p of list) {
    if (p.isTalk || p.isArchived) continue;
    byCanonical.set(p.title.toLowerCase(), p.slug);
    for (const a of p.aliases) byCanonical.set(a.toLowerCase(), p.slug);
  }
  for (const m of body.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
    const target = m[1]!.trim().toLowerCase();
    const slug = byCanonical.get(target);
    if (slug) out.add(slug);
  }
  return out;
}

/**
 * Read page bodies for the given slugs in parallel. Errors (missing pages,
 * permission issues) are swallowed — a missing body just yields no lead.
 */
async function readBodiesForSlugs(
  store: PageStore,
  slugs: ReadonlySet<string>,
): Promise<Map<string, string>> {
  const entries = await Promise.all(
    [...slugs].map(async (slug): Promise<[string, string] | null> => {
      try {
        const page = await store.read(slug);
        return [slug, page.body];
      } catch {
        return null;
      }
    }),
  );
  return new Map(entries.filter((e): e is [string, string] => e !== null));
}
