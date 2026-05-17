import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { AncestorTile } from '@/components/family/ancestor-tile';
import { RegistryCard } from '@/components/family/registry-card';
import { roman } from '@/lib/utils';
import type { BrowserPersonView, FamilyTreeView } from '@/lib/family';
import { GenerationHeader, SectionHeader, familyTreeHref, formatTileMeta } from './shared';

interface Props {
  view: FamilyTreeView;
}

export function LineageSection({ view }: Props) {
  const t = useTranslations('Page.FamilyTree.lineage');
  const paternalGroups = view.byGeneration.map(g => ({ generation: g.generation, people: g.paternal }));
  const maternalGroups = view.byGeneration.map(g => ({ generation: g.generation, people: g.maternal }));
  let ancestorCount = 0;
  for (const g of view.byGeneration) {
    ancestorCount += g.paternal.length + g.maternal.length;
  }
  if (ancestorCount === 0) return null;

  return (
    <section className="registry-rise" style={{ animationDelay: '160ms' }}>
      <SectionHeader
        title={t('title')}
        count={ancestorCount}
        after={
          <p className="font-display text-[0.7rem] tracking-tight text-muted-foreground">
            <span className="inline-block size-1.5 -translate-y-px rounded-full bg-paternal mr-1.5 align-baseline" aria-hidden />
            {t('legendPaternal')}
            <span className="mx-2 text-border">|</span>
            <span className="inline-block size-1.5 -translate-y-px rounded-full bg-maternal mr-1.5 align-baseline" aria-hidden />
            {t('legendMaternal')}
          </p>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        <LineageColumn title={t('legendPaternal')} columnLine={t('columnLine')} absentia={t('absentia')} headingFor={n => t('headings', { n })} groups={paternalGroups} side="paternal" />
        <LineageColumn title={t('legendMaternal')} columnLine={t('columnLine')} absentia={t('absentia')} headingFor={n => t('headings', { n })} groups={maternalGroups} side="maternal" />
      </div>
    </section>
  );
}

function LineageColumn({
  title,
  columnLine,
  absentia,
  headingFor,
  groups,
  side,
}: {
  title: string;
  columnLine: string;
  absentia: string;
  headingFor: (n: number) => string;
  groups: { generation: number; people: BrowserPersonView[] }[];
  side: 'paternal' | 'maternal';
}) {
  const accentVar = side === 'paternal' ? 'var(--paternal)' : 'var(--maternal)';
  const total = groups.reduce((sum, g) => sum + g.people.length, 0);

  return (
    <RegistryCard style={{ borderLeft: `2px solid ${accentVar}` }}>
      <header className="flex items-center justify-between border-b rule-hair bg-muted/40 px-4 py-2.5">
        <div className="flex items-baseline gap-2.5">
          <h3 className="font-display text-lg font-medium tracking-tight text-foreground">
            {title}
          </h3>
          <span
            className="font-display text-[0.62rem] uppercase tracking-[0.22em]"
            style={{ color: accentVar }}
          >
            {columnLine}
          </span>
        </div>
        <Badge
          variant="outline"
          className="border-foreground/15 bg-transparent font-mono text-[0.65rem] tabular-nums text-foreground/80"
        >
          {String(total).padStart(2, '0')}
        </Badge>
      </header>
      <div className="flex flex-col">
        {groups.map(group => (
          <GenerationBlock
            key={`${side}-${group.generation}`}
            generation={group.generation}
            people={group.people}
            heading={headingFor(group.generation)}
            absentia={absentia}
          />
        ))}
      </div>
    </RegistryCard>
  );
}

function GenerationBlock({
  generation,
  people,
  heading,
  absentia,
}: {
  generation: number;
  people: BrowserPersonView[];
  heading: string;
  absentia: string;
}) {
  const sidePossible = generation > 0 && generation <= 10 ? 2 ** (generation - 1) : null;
  const isEmpty = people.length === 0;

  return (
    <section className="border-b rule-hair last:border-b-0">
      <GenerationHeader
        ordinal={roman(generation)}
        heading={heading}
        count={
          sidePossible
            ? `${String(people.length).padStart(2, '0')} / ${String(sidePossible).padStart(2, '0')}`
            : undefined
        }
      />
      {isEmpty ? (
        <p className="px-3 pb-2 font-mono text-[0.65rem] text-muted-foreground/55">{absentia}</p>
      ) : (
        <div className="grid gap-x-2 px-2 pb-1.5 sm:grid-cols-2">
          {people.map((p, i) => (
            <AncestorTile
              key={`${p.record}-${p.pathFromRoot.join('-')}`}
              href={familyTreeHref(p.record)}
              name={p.name}
              meta={formatTileMeta(p)}
              ordinal={roman(i + 1).toLowerCase()}
              side={p.side === 'self' ? null : p.side}
              portrait={p.portrait}
            />
          ))}
        </div>
      )}
    </section>
  );
}
