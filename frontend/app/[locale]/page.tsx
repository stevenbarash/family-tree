import { Link } from '@/i18n/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { getCachedList, getCachedSnapshots, getRecentlyRevised, getCachedOpenGaps, getRedlinks } from '@/lib/server-services';
import { getFamilyTree } from '@/lib/family';
import { GENEALOGY_DIR, PAGES_DIR, SELF_RECORD } from '@/lib/env';
import { joinMeta } from '@/components/family/sections/shared';
import { getEventsForToday } from '@/lib/on-this-day-view';
import { OnThisDayRibbon } from '@/components/on-this-day-ribbon';
import { OpenGapsCard } from '@/components/dashboard/open-gaps-card';
import { RedlinksCard } from '@/components/dashboard/redlinks-card';

export const dynamic = 'force-dynamic';

const STALE_SNAPSHOT_DAYS = 30;
const RECENT_LIMIT = 6;
const FRONTIER_LIMIT = 4;
const GAPS_LIMIT = 5;
const REDLINKS_LIMIT = 5;

type MonthKey = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12';
type SideKey = 'sidePaternal' | 'sideMaternal';
type MissingKey = 'missingFather' | 'missingMother' | 'missingBoth';

function snapshotAgeDays(date: string | undefined): number | null {
  if (!date) return null;
  const ts = new Date(date).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.floor((Date.now() - ts) / 86400000);
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tMonths] = await Promise.all([
    getTranslations({ locale, namespace: 'Page.Home' }),
    getTranslations({ locale, namespace: 'Months.long' }),
  ]);

  const { list } = await getCachedList();
  const live = list.filter(p => !p.isTalk && !p.isArchived);
  const talk = list.filter(p => p.isTalk && !p.isArchived);

  const [tree, recent, snapshots, gaps, redlinks] = await Promise.all([
    getFamilyTree(SELF_RECORD, null),
    getRecentlyRevised(PAGES_DIR, RECENT_LIMIT),
    getCachedSnapshots(GENEALOGY_DIR),
    getCachedOpenGaps(GAPS_LIMIT),
    getRedlinks(),
  ]);

  const now = new Date();
  const todayEvents = getEventsForToday(live, now);
  const monthKey = String(now.getUTCMonth() + 1) as MonthKey;
  const dayLabel = t('dayLabel', { month: tMonths(monthKey), day: String(now.getUTCDate()) });

  const latestSnap = snapshots[snapshots.length - 1];
  const snapAge = snapshotAgeDays(latestSnap?.date);
  const snapDate = latestSnap?.date?.slice(0, 10) ?? null;

  const frontier = tree?.coverage.frontier.slice(0, FRONTIER_LIMIT) ?? [];
  const generations = tree
    ? tree.byGeneration.filter(g => g.paternal.length + g.maternal.length > 0).length
    : 0;
  const ancestors = tree
    ? tree.byGeneration.reduce((s, g) => s + g.paternal.length + g.maternal.length, 0)
    : 0;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-10">
      <header className="mb-10 border-b pb-7">
        <p className="font-display text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground/80">
          {t('registry')}
        </p>
        <h1 className="mt-2 text-4xl font-semibold leading-tight tracking-normal text-foreground sm:text-5xl">
          whoami.wiki
        </h1>
        <p className="mt-3 font-mono text-[0.75rem] uppercase tracking-[0.08em] text-muted-foreground/85">
          {joinMeta([
            ancestors > 0 ? t('ancestorsAcrossGenerations', { ancestors, generations }) : null,
            t('articlesCount', { count: live.length }),
            snapDate ? t('gedcomSync', { date: snapDate }) : null,
          ])}
        </p>
        <nav className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <Link href="/family" className="font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t('navFamily')}</Link>
          <Link href="/family/tree" className="font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t('navTree')}</Link>
          <Link href="/search" className="font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t('navSearch')}</Link>
        </nav>
      </header>

      {snapAge !== null && snapAge > STALE_SNAPSHOT_DAYS && snapDate ? (
        <div className="mb-8 rounded-md border border-amber-300/60 bg-amber-50/60 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          {t.rich('snapshotStale', {
            days: snapAge,
            date: snapDate,
            code: chunks => (
              <code className="rounded bg-amber-100/70 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-500/20">
                {chunks}
              </code>
            ),
          })}
        </div>
      ) : null}

      <OnThisDayRibbon events={todayEvents} dayLabel={dayLabel} />

      {frontier.length > 0 ? (
        <section className="mb-10">
          <h2 className="mb-3 font-display text-xs uppercase tracking-[0.32em] text-muted-foreground">
            {t('continueResearch')}
          </h2>
          <ul className="flex flex-col gap-1.5">
            {frontier.map(f => {
              const sideKey: SideKey = f.side === 'paternal' ? 'sidePaternal' : 'sideMaternal';
              const missingKey: MissingKey =
                f.missing === 'father' ? 'missingFather' : f.missing === 'mother' ? 'missingMother' : 'missingBoth';
              return (
                <li key={f.record} className="text-sm">
                  <Link
                    href={`/family/tree?person=${encodeURIComponent(f.record)}`}
                    className="underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {f.name}
                  </Link>{' '}
                  <span className="font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground/80">
                    {t('frontierMeta', {
                      generation: String(f.generation),
                      side: t(sideKey),
                      missing: t(missingKey),
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <OpenGapsCard view={gaps} />

      {recent.length > 0 ? (
        <section className="mb-10">
          <h2 className="mb-3 font-display text-xs uppercase tracking-[0.32em] text-muted-foreground">
            {t('recentlyRevised')}
          </h2>
          <ul className="flex flex-col gap-1.5">
            {recent.map(p => (
              <li key={p.slug} className="text-sm">
                <Link
                  href={`/${p.slug}`}
                  className="underline-offset-4 hover:text-foreground hover:underline"
                >
                  {p.title}
                </Link>{' '}
                <span className="font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground/80">
                  · {new Date(p.mtime).toISOString().slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <RedlinksCard entries={redlinks} rowLimit={REDLINKS_LIMIT} />

      <footer className="mt-12 flex flex-col gap-1 border-t pt-6 font-mono text-[0.75rem] uppercase tracking-[0.08em] text-muted-foreground">
        <Link href="/index" className="hover:text-foreground hover:underline">
          {t('browseAllArticles', { count: live.length })}
        </Link>
        {talk.length > 0 ? (
          <Link href="/index#talk" className="hover:text-foreground hover:underline">
            {t('browseAllTalkPages', { count: talk.length })}
          </Link>
        ) : null}
        <Link href="/changelog" className="hover:text-foreground hover:underline">
          {t('navChangelog')}
        </Link>
        <Link href="/roadmap" className="hover:text-foreground hover:underline">
          {t('navRoadmap')}
        </Link>
      </footer>
    </main>
  );
}
