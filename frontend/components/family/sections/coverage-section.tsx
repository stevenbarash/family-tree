import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { RegistryCard } from '@/components/family/registry-card';
import { roman } from '@/lib/utils';
import type { FamilyTreeView } from '@/lib/family';
import { SectionHeader, familyTreeHref } from './shared';

interface Props {
  view: FamilyTreeView;
}

export function CoverageSection({ view }: Props) {
  const t = useTranslations('Page.FamilyTree.coverage');
  const tLineage = useTranslations('Page.FamilyTree.lineage');
  const { coverage } = view;
  if (coverage.knownTotal === 0) return null;

  return (
    <section className="registry-rise mb-12" style={{ animationDelay: '100ms' }}>
      <SectionHeader
        title={t('title')}
        count={coverage.knownTotal}
        after={
          <p className="font-mono text-[0.7rem] tabular-nums text-muted-foreground/80">
            {t('knownOfPossible', { known: String(coverage.knownTotal), possible: String(coverage.possibleTotal) })}
          </p>
        }
      />
      <div className="grid gap-4 md:grid-cols-[auto_1fr]">
        <RegistryCard>
          <header className="border-b rule-hair bg-muted/40 px-3 py-2">
            <h3 className="font-display text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
              {t('perGeneration')}
            </h3>
          </header>
          <ul className="divide-y rule-hair">
            {coverage.byGeneration.map(g => (
              <li
                key={`cov-${g.generation}`}
                className="flex items-baseline justify-between gap-4 px-3 py-1.5 font-mono text-[0.72rem] tabular-nums"
              >
                <span className="text-muted-foreground/70 w-5">
                  {roman(g.generation)}
                </span>
                <span className="flex-1 truncate font-display tracking-tight text-foreground">
                  {tLineage('headings', { n: String(g.generation) })}
                </span>
                <span className={g.known === g.possible ? 'text-foreground' : 'text-muted-foreground'}>
                  {String(g.known).padStart(2, '0')} / {String(g.possible).padStart(2, '0')}
                </span>
              </li>
            ))}
          </ul>
        </RegistryCard>

        {coverage.frontier.length > 0 ? (
          <RegistryCard>
            <header className="border-b rule-hair bg-muted/40 px-3 py-2 flex items-baseline justify-between gap-3">
              <h3 className="font-display text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                {t('researchFrontier')}
              </h3>
              <span className="font-mono text-[0.62rem] tabular-nums text-muted-foreground/70">
                {String(coverage.frontier.length).padStart(2, '0')}
              </span>
            </header>
            <ul className="divide-y rule-hair">
              {coverage.frontier.map(f => (
                <li key={`fr-${f.record}`}>
                  <Link
                    href={familyTreeHref(f.record)}
                    className="flex items-baseline gap-3 px-3 py-1.5 transition-colors hover:bg-accent/45"
                  >
                    <span className="font-mono text-[0.62rem] tabular-nums text-muted-foreground/70 w-5 shrink-0">
                      {roman(f.generation)}
                    </span>
                    <span className="flex-1 truncate font-display tracking-tight text-foreground">
                      <bdi>{f.name}</bdi>
                    </span>
                    <span className="font-display text-[0.62rem] uppercase tracking-[0.18em] text-muted-foreground">
                      {t('missing', { what: f.missing })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </RegistryCard>
        ) : (
          <Card className="flex items-center justify-center p-6 shadow-none ring-foreground/12">
            <p className="font-display text-sm text-muted-foreground">
              {t('complete')}
            </p>
          </Card>
        )}
      </div>
    </section>
  );
}
