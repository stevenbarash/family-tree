import { useTranslations } from 'next-intl';
import { LifespanBar } from '@/components/family/lifespan-bar';
import { RegistryCard } from '@/components/family/registry-card';
import type { FamilyTreeView } from '@/lib/family';
import { MobileDisclosure } from './mobile-disclosure';
import { SectionHeader, familyTreeHref } from './shared';

interface Props {
  view: FamilyTreeView;
}

export function LifespansSection({ view }: Props) {
  const t = useTranslations('Page.FamilyTree.lifespans');
  const tDisclosure = useTranslations('Page.FamilyTree.disclosure');
  const { timeline } = view;
  if (timeline.entries.length === 0 || !timeline.range) return null;

  return (
    <section className="registry-rise mb-12" style={{ animationDelay: '110ms' }}>
      <SectionHeader
        title={t('title')}
        count={timeline.entries.length}
        after={
          <p className="font-mono text-[0.7rem] tabular-nums text-muted-foreground/80">
            {t('range', { min: String(timeline.range.minYear), max: String(timeline.range.maxYear) })}
          </p>
        }
      />
      <MobileDisclosure
        storageKey="lifespans"
        showLabel={tDisclosure('show')}
        hideLabel={tDisclosure('hide')}
      >
        <RegistryCard>
          <div className="divide-y rule-hair">
            {timeline.entries.map(e => (
              <LifespanBar
                key={`life-${e.record}`}
                href={familyTreeHref(e.record)}
                name={e.name}
                birthYear={e.birthYear}
                deathYear={e.deathYear}
                side={e.side}
                rangeMin={timeline.range!.minYear}
                rangeMax={timeline.range!.maxYear}
                endYear={e.endYear}
                birthQualified={e.birthQualified}
                deathQualified={e.deathQualified}
                portrait={e.portrait}
              />
            ))}
          </div>
        </RegistryCard>
      </MobileDisclosure>
    </section>
  );
}
