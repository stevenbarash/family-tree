import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  getPageStore,
  getCachedList,
  readTalkBody,
  buildNotesView,
} from '@/lib/server-services';
import { renderMarkdown } from '@/lib/render';
import { loadDerivedRecord } from '@/lib/derived';
import { isValidSlug, isTalkSlug, toTalkSlug } from '@core/pages/index.ts';
import { FutureSchemaVersionError } from '@core/pages/migrations/index.ts';
import { WHOAMI_ROOT } from '@/lib/env';
import type { Page } from '@core/pages/index.ts';
import { ResearchNotesPanel } from '@/components/research-notes/panel';

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

  const [{ index }, derived, talkBody] = await Promise.all([
    indexPromise,
    derivedPromise,
    talkBodyPromise,
  ]);

  const [tree, notes] = await Promise.all([
    renderMarkdown(page.body, index, { derived }),
    buildNotesView(talkBody, index),
  ]);

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
        {page.meta.categories.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {page.meta.categories.map(category => (
              <span key={category} className="rounded-full border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {category}
              </span>
            ))}
          </div>
        ) : null}
      </header>
      <article className="wiki-article prose prose-stone dark:prose-invert max-w-none prose-headings:font-heading prose-headings:tracking-normal prose-h2:mt-12 prose-h2:text-2xl prose-h3:text-xl prose-p:leading-8 prose-li:my-1 prose-a:font-medium prose-a:decoration-primary/35 hover:prose-a:decoration-primary prose-blockquote:rounded-r-lg prose-blockquote:bg-muted/35 prose-blockquote:py-1 prose-blockquote:not-italic">
        {tree}
      </article>
      {isTalkSlug(slug) ? null : (
        <ResearchNotesPanel slug={slug} notes={notes} />
      )}
    </main>
  );
}
