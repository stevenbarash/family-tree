import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/routing';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getFamily, type AncestorView } from '@/lib/family';

export const dynamic = 'force-dynamic';

type GenKey = 'gen1' | 'gen2' | 'gen3' | 'gen4' | 'gen5' | 'gen6';

const GEN_KEY: Record<number, GenKey> = {
  1: 'gen1',
  2: 'gen2',
  3: 'gen3',
  4: 'gen4',
  5: 'gen5',
  6: 'gen6',
};

function lineTone(side: AncestorView['side']): string {
  if (side === 'paternal') return 'border-l-sky-500';
  if (side === 'maternal') return 'border-l-rose-500';
  return 'border-l-muted';
}

function PersonCard({
  a,
  t,
}: {
  a: AncestorView;
  t: ReturnType<typeof useTranslations>;
}) {
  const b = a.birth?.date ?? null;
  const d = a.death?.date ?? null;
  let dates = '';
  if (b && d) dates = t('bornDiedDate', { birth: b, death: d });
  else if (b) dates = t('bornDate', { date: b });
  else if (d) dates = t('diedDate', { date: d });

  const place = a.birth?.place ?? null;
  const line = t('lineSide', { side: a.side ?? 'other' });
  const titleNode = a.slug
    ? <Link href={`/${a.slug}`} className="text-primary underline-offset-4 hover:underline">{a.name}</Link>
    : a.name;
  return (
    <Card size="sm" className={`border-l-4 ${lineTone(a.side)}`}>
      <CardHeader>
        <CardDescription className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide">
          <span>{a.label}</span>
          <span aria-hidden="true">/</span>
          <span>{line}</span>
        </CardDescription>
        <CardTitle>{titleNode}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-sm">
        {dates ? <p className="text-sm">{dates}</p> : null}
        {place ? <p className="text-xs text-muted-foreground">{place}</p> : null}
        <p className="text-xs text-muted-foreground">{a.record}</p>
      </CardContent>
    </Card>
  );
}

export default async function FamilyPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = useTranslations('Page.Family');

  const view = await getFamily();
  if (!view) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <Link href="/" className="text-sm text-muted-foreground">{t('navIndex')}</Link>
        <h1 className="text-3xl font-bold mt-4 mb-4">{t('noDataTitle')}</h1>
        <p className="text-muted-foreground">
          {t.rich('noDataDescription', {
            code: (chunks) => <code>{chunks}</code>,
          })}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <Link href="/" className="text-sm text-muted-foreground">{t('navIndex')}</Link>
      <h1 className="text-3xl font-bold mt-4 mb-1">{t('pageTitle')}</h1>
      <p className="text-muted-foreground mb-6">
        {t.rich('pageDescription', {
          name: view.self.name,
          strong: (chunks) => <span className="font-semibold">{chunks}</span>,
        })}
      </p>
      <p className="mb-6">
        <Link href="/family/tree" className="text-primary underline-offset-4 hover:underline">{t('browseTree')}</Link>
      </p>
      <div className="mb-8">
        <PersonCard a={view.self} t={t} />
      </div>

      {view.byGeneration.map(({ generation, ancestors }) => {
        const paternal = ancestors.filter(a => a.side === 'paternal');
        const maternal = ancestors.filter(a => a.side === 'maternal');
        const genKey = GEN_KEY[generation];
        const heading = genKey ? t(genKey) : t('genFallback', { n: generation });
        return (
          <section key={generation} className="mb-10">
            <h2 className="text-xl font-semibold mb-4">{heading}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">{t('paternalLine')}</h3>
                <div className="flex flex-col gap-3">
                  {paternal.length === 0
                    ? <p className="text-sm text-muted-foreground italic">{t('unknown')}</p>
                    : paternal.map(a => <PersonCard key={a.record} a={a} t={t} />)}
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">{t('maternalLine')}</h3>
                <div className="flex flex-col gap-3">
                  {maternal.length === 0
                    ? <p className="text-sm text-muted-foreground italic">{t('unknown')}</p>
                    : maternal.map(a => <PersonCard key={a.record} a={a} t={t} />)}
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </main>
  );
}
