import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { ArrowLeft, Home } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { CommandPalette } from '@/components/command-palette';
import { SELF_RECORD } from '@/lib/env';
import { getFamilyTree } from '@/lib/family';
import {
  getCachedList,
  readTalkBody,
  buildNotesView,
  resolveSlugForRecord,
  UnknownRecordError,
  NameEmptySlugError,
  InvalidRecordIdError,
} from '@/lib/server-services';
import { toTalkSlug } from '@core/pages/slug.ts';
import { ConflictsSection } from '@/components/family/sections/conflicts-section';
import { CoverageSection } from '@/components/family/sections/coverage-section';
import { DescendantsSection } from '@/components/family/sections/descendants-section';
import { FamilySection } from '@/components/family/sections/family-section';
import { LifespansSection } from '@/components/family/sections/lifespans-section';
import { LineageSection } from '@/components/family/sections/lineage-section';
import { MediaSection } from '@/components/family/sections/media-section';
import { PersonHeaderSection } from '@/components/family/sections/person-header-section';
import { PlacesSection } from '@/components/family/sections/places-section';
import { familyTreeHref } from '@/components/family/sections/shared';
import { ResearchNotesPanel } from '@/components/research-notes/panel';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ person?: string; from?: string }>;
}

type Crumb = { record: string; name: string; slug?: string };
type AbridgedCrumb =
  | { kind: 'crumb'; record: string; name: string }
  | { kind: 'ellipsis' };

/** Cap rendered breadcrumbs at 5 items: keep the perspective (first), the
 *  current person + their immediate ancestor (last two), and ellipsis the
 *  middle. Cousin-twice-removed paths can be 10+ hops; beyond that they
 *  become noise in the header. */
function abridgeCrumbs(crumbs: Crumb[]): AbridgedCrumb[] {
  if (crumbs.length <= 5) {
    return crumbs.map(c => ({ kind: 'crumb', record: c.record, name: c.name }));
  }
  const first = crumbs[0]!;
  const penult = crumbs[crumbs.length - 2]!;
  const last = crumbs[crumbs.length - 1]!;
  return [
    { kind: 'crumb', record: first.record, name: first.name },
    { kind: 'ellipsis' },
    { kind: 'crumb', record: penult.record, name: penult.name },
    { kind: 'crumb', record: last.record, name: last.name },
  ];
}

export default async function FamilyTreePage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Page.FamilyTree' });

  const sp = await searchParams;
  const rootRecord = sp.person ?? SELF_RECORD;

  // Kick off the family-tree compute and the slug-resolution in parallel —
  // resolveSlugForRecord doesn't depend on the assembled view, only on the
  // root record, and both feed the page's data.
  const viewPromise = getFamilyTree(rootRecord, sp.from ?? null);
  const notesSlugPromise = resolveSlugForRecord(rootRecord).catch(err => {
    if (
      err instanceof UnknownRecordError
      || err instanceof NameEmptySlugError
      || err instanceof InvalidRecordIdError
    ) return null;
    throw err;
  });

  const [view, notesSlug] = await Promise.all([viewPromise, notesSlugPromise]);
  if (!view) notFound();

  // Now that we have the slug, fetch talk body and slug-index in parallel,
  // then render notes — the original code did these three awaits sequentially.
  const notes = notesSlug
    ? await (async () => {
        const [talkBody, { index }] = await Promise.all([
          readTalkBody(toTalkSlug(notesSlug)),
          getCachedList(),
        ]);
        return buildNotesView(talkBody, index);
      })()
    : [];

  const isMe = view.root.record === SELF_RECORD;
  let ancestorCount = 0;
  let generationCount = 0;
  for (const g of view.byGeneration) {
    const n = g.paternal.length + g.maternal.length;
    ancestorCount += n;
    if (n > 0) generationCount += 1;
  }

  const familyCount = view.selectedRelations.parents.length
    + view.selectedRelations.spouses.length
    + view.selectedRelations.children.length
    + view.cohort.siblings.length
    + view.cohort.cousins.length;
  const isEmpty = familyCount === 0
    && ancestorCount === 0
    && view.descendants.total === 0;

  return (
    <main className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 border-b rule-hair bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <Link
            href="/family"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4 rtl:scale-x-[-1]" aria-hidden />
            <span className="font-display tracking-tight">{t('navFamily')}</span>
          </Link>
          <div className="font-display text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground/80">
            {t('registry')}
          </div>
          <div className="flex items-center gap-2">
            {!isMe ? (
              <Link
                href={familyTreeHref(SELF_RECORD)}
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                <Home data-icon="inline-start" />
                {t('buttonMe')}
              </Link>
            ) : null}
            <CommandPalette />
          </div>
        </div>
        {view.relationship && view.relationship.crumbs.length > 1 ? (
          <nav
            aria-label={t('lineagePathAria')}
            className="mx-auto max-w-6xl overflow-x-auto px-4 pb-2 sm:px-6"
          >
            <ol className="flex items-center gap-x-1.5 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground/85 whitespace-nowrap">
              {abridgeCrumbs(view.relationship.crumbs).map((c, i, arr) => (
                <li key={`${c.kind}-${i}`} className="flex items-center gap-x-1.5">
                  {c.kind === 'ellipsis' ? (
                    <span aria-hidden>…</span>
                  ) : i === arr.length - 1 ? (
                    <span className="text-foreground" aria-current="location">{c.name}</span>
                  ) : (
                    <Link
                      href={familyTreeHref(c.record)}
                      className="underline-offset-4 hover:text-foreground hover:underline"
                    >
                      {c.name}
                    </Link>
                  )}
                  {i < arr.length - 1 ? <span aria-hidden className="text-muted-foreground/40">→</span> : null}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-8 pb-24 sm:px-6 sm:pt-12">
        <PersonHeaderSection view={view} ancestorCount={ancestorCount} generationCount={generationCount} />
        <FamilySection view={view} />
        <ConflictsSection view={view} />
        <CoverageSection view={view} />
        <PlacesSection view={view} />
        <LifespansSection view={view} />
        <DescendantsSection view={view} />
        <MediaSection view={view} />
        <LineageSection view={view} />

        {isEmpty ? (
          <p className="font-display text-center text-sm text-muted-foreground">
            {t('emptyState')}
          </p>
        ) : null}

        {notesSlug ? (
          <ResearchNotesPanel slug={notesSlug} notes={notes} />
        ) : null}
      </div>
    </main>
  );
}
