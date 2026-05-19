import { Link } from '@/i18n/navigation';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { getRoadmap, renderRoadmapMarkdown } from '@/lib/roadmap';
import { SectionBlock } from '@/components/roadmap/section-block';
import { RoadmapIndex } from '@/components/roadmap/roadmap-index';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Roadmap · whoami.wiki',
  description: 'Strategic sequencing of whoami.wiki — tracks, parking lot, and what just shipped, sourced from docs/ROADMAP.md.',
};

export default async function RoadmapPage({ params }: { params: Promise<{ locale: Locale }> }): Promise<ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Page.Roadmap' });

  const doc = await getRoadmap();
  const intro = doc.intro ? await renderRoadmapMarkdown(doc.intro) : null;
  const generatedDate = doc.generatedAt.slice(0, 10);
  const { tracks, shipped, ready, inFlight, parked, cut } = doc.totals;

  const kindLabels = {
    snapshot: t('snapshotLabel'),
    track: t('trackLabel'),
    parking: t('parkingLabel'),
    cut: t('cutLabel'),
    shipped: t('shippedLabel'),
    narrative: t('narrativeLabel'),
  } as const;

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
          <span>{t('statTracks', { count: tracks })}</span>
          <span aria-hidden className="text-muted-foreground/40">/</span>
          <span>{t('statReady', { count: String(ready) })}</span>
          {inFlight > 0 ? (
            <>
              <span aria-hidden className="text-muted-foreground/40">/</span>
              <span>{t('statInFlight', { count: String(inFlight) })}</span>
            </>
          ) : null}
          <span aria-hidden className="text-muted-foreground/40">/</span>
          <span>{t('statShipped', { count: String(shipped) })}</span>
          <span aria-hidden className="text-muted-foreground/40">/</span>
          <span>{t('statParked', { count: String(parked) })}</span>
          {cut > 0 ? (
            <>
              <span aria-hidden className="text-muted-foreground/40">/</span>
              <span>{t('statCut', { count: String(cut) })}</span>
            </>
          ) : null}
          <span aria-hidden className="text-muted-foreground/40">/</span>
          <span>{t('statUpdated', { date: doc.lastUpdated ?? generatedDate })}</span>
        </div>
        {intro ? (
          <div className="roadmap-prose mt-8 max-w-prose">{intro}</div>
        ) : null}
        <div
          aria-hidden
          className="absolute -bottom-px start-0 h-px w-full bg-gradient-to-r from-foreground/40 via-foreground/15 to-transparent"
        />
      </header>

      <details className="group mb-12 rounded-md border border-border/70 px-4 py-3 lg:hidden">
        <summary className="flex cursor-pointer items-center justify-between font-mono text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">
          <span>{t('onThisPage')}</span>
          <span aria-hidden className="transition-transform group-open:rotate-90">→</span>
        </summary>
        <div className="mt-4">
          <RoadmapIndex sections={doc.sections} onThisPageLabel={t('onThisPage')} />
        </div>
      </details>

      <div className="grid gap-x-12 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0">
          <div className="flex flex-col gap-12">
            {await Promise.all(doc.sections.map(async s => (
              <SectionBlock key={s.id} section={s} kindLabel={kindLabels[s.kind]} />
            )))}
          </div>
          <p className="mt-16 border-t border-foreground/12 pt-6 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
            <a
              href="https://github.com/stevenbarash/family-tree/blob/main/docs/ROADMAP.md"
              className="hover:text-foreground"
              target="_blank"
              rel="noreferrer noopener"
            >
              {t('viewSource')} ↗
            </a>
          </p>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-10 max-h-[calc(100vh-5rem)] overflow-y-auto pb-12">
            <RoadmapIndex sections={doc.sections} onThisPageLabel={t('onThisPage')} />
          </div>
        </aside>
      </div>
    </main>
  );
}
