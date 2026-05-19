import { Link } from '@/i18n/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { getRedlinks } from '@/lib/server-services';

export const dynamic = 'force-dynamic';

export default async function RedlinksPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Page.Redlinks' });

  const entries = await getRedlinks();
  const totalRefs = entries.reduce((s, e) => s + e.count, 0);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-10">
      <header className="mb-10 border-b pb-7">
        <p className="font-display text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground/80">
          {t('registry')}
        </p>
        <h1 className="mt-2 text-4xl font-semibold leading-tight tracking-normal text-foreground sm:text-5xl">
          {t('title')}
        </h1>
        <p className="mt-3 font-mono text-[0.75rem] uppercase tracking-[0.08em] text-muted-foreground/85">
          {t('summary', { targets: entries.length, refs: totalRefs })}
        </p>
        <nav className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <Link href="/" className="font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            {t('navHome')}
          </Link>
        </nav>
      </header>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-6">
          {entries.map(r => (
            <li key={r.canonical}>
              <div className="text-lg font-medium">
                <span className="redlink">[[ <bdi>{r.target}</bdi> ]]</span>
                <span className="ms-3 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground/80">
                  {t('refCount', { count: r.count })}
                </span>
              </div>
              <p className="mt-1 text-xs uppercase tracking-[0.1em] text-muted-foreground">
                {t('linkedFrom')}
              </p>
              <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {r.sources.map(s => (
                  <li key={s}>
                    <Link href={`/${s}`} className="underline-offset-4 hover:text-foreground hover:underline">
                      <bdi>{s}</bdi>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
