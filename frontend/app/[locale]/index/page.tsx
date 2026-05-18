import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { getCachedList, getCachedSnapshots } from '@/lib/server-services';
import { getFamilyTree } from '@/lib/family';
import { GENEALOGY_DIR, SELF_RECORD } from '@/lib/env';
import { joinMeta } from '@/components/family/sections/shared';

export const dynamic = 'force-dynamic';

export default async function IndexPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Page.Index' });

  const { list } = await getCachedList();
  const live = list.filter(p => !p.isTalk && !p.isArchived);
  const talk = list.filter(p => p.isTalk && !p.isArchived);

  const [tree, snapshots] = await Promise.all([
    getFamilyTree(SELF_RECORD, null),
    getCachedSnapshots(GENEALOGY_DIR),
  ]);

  const latestSnap = snapshots[snapshots.length - 1];
  const snapDate = latestSnap?.date?.slice(0, 10) ?? null;
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
          Index
        </h1>
        <p className="mt-3 font-mono text-[0.75rem] uppercase tracking-[0.08em] text-muted-foreground/85">
          {joinMeta([
            ancestors > 0 ? t('ancestorsAcrossGenerations', { ancestors, generations }) : null,
            t('articlesCount', { count: live.length }),
            snapDate ? t('gedcomSync', { date: snapDate }) : null,
          ])}
        </p>
        <nav className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <Link href="/" className="font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            {t('navHome')}
          </Link>
        </nav>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 font-display text-xs uppercase tracking-[0.32em] text-muted-foreground">
          {t('allArticlesHeading', { count: String(live.length) })}
        </h2>
        {live.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('emptyArticles')}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {live.map(p => (
              <li key={p.slug}>
                <Link href={`/${p.slug}`} className="underline-offset-4 hover:text-foreground hover:underline">
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="talk">
        <h2 className="mb-3 font-display text-xs uppercase tracking-[0.32em] text-muted-foreground">
          {t('talkPagesHeading', { count: String(talk.length) })}
        </h2>
        {talk.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('emptyTalkPages')}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {talk.map(p => (
              <li key={p.slug}>
                <Link href={`/${p.slug}`} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
