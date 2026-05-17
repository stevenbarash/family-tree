import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { searchAndJoin } from '@/lib/server-services';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ q?: string; type?: string; place?: string }>;
}

const TYPE_ORDER = ['person', 'family', 'event', 'tree', 'meta'] as const;
const PLACE_FACET_LIMIT = 8;

function titleCasePlace(bucket: string): string {
  return bucket
    .split(/\s+/)
    .map(w => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export default async function SearchPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Page.Search' });

  const { q = '', type, place: placeRaw } = await searchParams;
  const trimmed = q.trim();
  const all = await searchAndJoin(trimmed, 200);

  const counts = new Map<string, number>();
  for (const r of all) counts.set(r.type, (counts.get(r.type) ?? 0) + 1);

  // Place buckets respect the active type filter so place counts reflect
  // what the user would actually see; type tabs always show counts across all.
  const placeCounts = new Map<string, number>();
  for (const r of all) {
    if (type && r.type !== type) continue;
    if (!r.placeBucket) continue;
    placeCounts.set(r.placeBucket, (placeCounts.get(r.placeBucket) ?? 0) + 1);
  }
  const topPlaces = [...placeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, PLACE_FACET_LIMIT);

  // Honor the place query param only when it's an actual bucket the current
  // result set surfaces. Anything else (typo, stale URL, hand-crafted) is
  // ignored so the UI can't show "0 results" for a non-existent bucket.
  const validBuckets = new Set(placeCounts.keys());
  const place = placeRaw && validBuckets.has(placeRaw) ? placeRaw : undefined;
  const filtered = all.filter(r =>
    (!type || r.type === type) && (!place || r.placeBucket === place),
  );

  function buildHref(overrides: { type?: string | null; place?: string | null } = {}): string {
    const ps = new URLSearchParams();
    if (trimmed) ps.set('q', trimmed);
    const nextType = overrides.type === undefined ? type : (overrides.type ?? undefined);
    if (nextType) ps.set('type', nextType);
    const nextPlace = overrides.place === undefined ? place : (overrides.place ?? undefined);
    if (nextPlace) ps.set('place', nextPlace);
    const s = ps.toString();
    return s ? `/search?${s}` : '/search';
  }
  const tabHref = (tp?: string) => buildHref({ type: tp ?? null });
  const placeHref = (p?: string) => buildHref({ place: p ?? null });

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/" className="text-sm text-muted-foreground">{t('navIndex')}</Link>
      <h1 className="text-3xl font-bold mt-4 mb-4">{t('heading')}</h1>
      <form className="mb-6">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={t('placeholder')}
          autoFocus
          className="w-full rounded border border-input bg-background px-3 py-2 text-sm shadow-sm"
        />
      </form>

      {trimmed === '' ? (
        <p className="text-muted-foreground">{t('emptyPrompt')}</p>
      ) : all.length === 0 ? (
        <p className="text-muted-foreground">{t('noResults', { query: trimmed })}</p>
      ) : (
        <>
          <nav className="mb-4 flex flex-wrap gap-1.5 border-b rule-hair pb-2">
            <Link
              href={tabHref()}
              className={`rounded-md px-2 py-1 text-xs font-display uppercase tracking-[0.16em] transition-colors ${
                !type ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:bg-accent/45'
              }`}
            >
              {t('tabAll')} <span className="ms-1 font-mono tabular-nums text-muted-foreground/80">{all.length}</span>
            </Link>
            {TYPE_ORDER.map(tp => {
              const n = counts.get(tp) ?? 0;
              if (n === 0) return null;
              const active = type === tp;
              return (
                <Link
                  key={tp}
                  href={tabHref(tp)}
                  className={`rounded-md px-2 py-1 text-xs font-display uppercase tracking-[0.16em] transition-colors ${
                    active ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:bg-accent/45'
                  }`}
                >
                  {t('typeLabel', { type: tp })} <span className="ms-1 font-mono tabular-nums text-muted-foreground/80">{n}</span>
                </Link>
              );
            })}
          </nav>

          {topPlaces.length > 0 ? (
            <nav className="mb-4 flex flex-wrap items-center gap-1.5">
              <span className="font-display text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground/80">
                {t('placesHeading')}
              </span>
              {place ? (
                <Link
                  href={placeHref()}
                  className="rounded-md px-2 py-0.5 text-xs font-mono uppercase tracking-[0.08em] text-muted-foreground hover:bg-accent/45"
                >
                  {t('clearPlaces')}
                </Link>
              ) : null}
              {topPlaces.map(([bucket, n]) => {
                const active = place === bucket;
                return (
                  <Link
                    key={bucket}
                    href={placeHref(active ? undefined : bucket)}
                    className={`rounded-md px-2 py-0.5 text-xs font-mono uppercase tracking-[0.08em] transition-colors ${
                      active ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:bg-accent/45'
                    }`}
                  >
                    {titleCasePlace(bucket)} <span className="ms-1 tabular-nums text-muted-foreground/80">{n}</span>
                  </Link>
                );
              })}
            </nav>
          ) : null}

          {type ? (
            <ul className="space-y-2">
              {filtered.map(r => (
                <li key={r.slug}>
                  <Link href={`/${r.slug}`} className="text-blue-600 hover:underline font-medium"><bdi>{r.title}</bdi></Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-6">
              {TYPE_ORDER.map(tp => {
                const items = all.filter(r => r.type === tp);
                if (items.length === 0) return null;
                return (
                  <section key={tp}>
                    <h2 className="mb-1.5 font-display text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                      {t('typeLabel', { type: tp })}
                      <span className="ms-2 font-mono tabular-nums text-muted-foreground/70">{items.length}</span>
                    </h2>
                    <ul className="space-y-1">
                      {items.map(r => (
                        <li key={r.slug}>
                          <Link href={`/${r.slug}`} className="text-blue-600 hover:underline font-medium"><bdi>{r.title}</bdi></Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </main>
  );
}
