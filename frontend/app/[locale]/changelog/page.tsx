import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import { getChangelog, renderChangelogMarkdown } from '@/lib/changelog';
import { VersionBlock } from '@/components/changelog/version-block';
import { GroupBlock } from '@/components/changelog/group-block';
import { NotesBlock } from '@/components/changelog/notes-block';
import { VersionIndex } from '@/components/changelog/version-index';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Changelog · whoami.wiki',
  description: 'Revision history of whoami.wiki, kept in sync with the repository CHANGELOG.md.',
};

export default async function ChangelogPage({ params }: { params: Promise<{ locale: string }> }): Promise<ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = useTranslations('Page.Changelog');

  const doc = await getChangelog();
  const intro = doc.intro ? await renderChangelogMarkdown(doc.intro) : null;
  const { versions, released, entries } = doc.totals;
  const generatedDate = doc.generatedAt.slice(0, 10);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-6 lg:pt-10">
      <header className="relative mb-14 border-b border-foreground/15 pb-12">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href="/"
            className="font-mono text-[0.65rem] uppercase tracking-[0.28em] text-muted-foreground hover:text-foreground"
          >
            {t('navBack')}
          </Link>
          <span aria-hidden className="text-muted-foreground/40">·</span>
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.28em] text-muted-foreground">
            {t('navLabel')}
          </p>
        </div>
        <p className="mt-6 font-display text-[0.95rem] italic text-muted-foreground">
          {t('subtitle')}
        </p>
        <h1 className="mt-1 font-display text-6xl font-light leading-[0.95] tracking-tight text-foreground sm:text-7xl">
          {t('heading')}
        </h1>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[0.72rem] uppercase tracking-[0.16em] text-muted-foreground">
          <span>{t('statRevisions', { count: versions })}</span>
          <span aria-hidden className="text-muted-foreground/40">/</span>
          <span>{t('statReleased', { count: released })}</span>
          <span aria-hidden className="text-muted-foreground/40">/</span>
          <span>{t('statEntries', { count: entries })}</span>
          <span aria-hidden className="text-muted-foreground/40">/</span>
          <span>{t('statUpdated', { date: generatedDate })}</span>
        </div>
        {intro ? (
          <div className="changelog-prose mt-8 max-w-prose">{intro}</div>
        ) : null}
        <div
          aria-hidden
          className="absolute -bottom-px left-0 h-px w-full bg-gradient-to-r from-foreground/40 via-foreground/15 to-transparent"
        />
      </header>

      <details className="group mb-12 rounded-md border border-border/70 px-4 py-3 lg:hidden">
        <summary className="flex cursor-pointer items-center justify-between font-mono text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">
          <span>{t('onThisPage')}</span>
          <span aria-hidden className="transition-transform group-open:rotate-90">→</span>
        </summary>
        <div className="mt-4">
          <VersionIndex sections={doc.sections} />
        </div>
      </details>

      <div className="grid gap-x-12 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0">
          <div className="flex flex-col gap-12">
            {await Promise.all(doc.sections.map(async section => {
              if (section.kind === 'version') return <VersionBlock key={section.id} data={section} />;
              if (section.kind === 'group') return <GroupBlock key={section.id} data={section} />;
              return <NotesBlock key={section.id} data={section} />;
            }))}
          </div>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-10 max-h-[calc(100vh-5rem)] overflow-y-auto pb-12">
            <VersionIndex sections={doc.sections} />
          </div>
        </aside>
      </div>
    </main>
  );
}
