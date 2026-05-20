import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import type { FamilyTreeView } from '@/lib/family';
import { Stat, formatDates } from './shared';
import { localizedRelationshipLabel } from '@/lib/relationship-label';

interface Props {
  view: FamilyTreeView;
  ancestorCount: number;
  generationCount: number;
}

export function PersonHeaderSection({ view, ancestorCount, generationCount }: Props) {
  const t = useTranslations('Page.FamilyTree.person');
  const tLabel = useTranslations('Page.Article.Relationship.label');
  const person = view.root;
  const dates = formatDates(person);
  const { parents, spouses, children } = view.selectedRelations;
  const { siblings } = view.cohort;
  const { sourceCoverage } = view.coverage;
  const sourcedPercent = sourceCoverage.total > 0
    ? Math.round((sourceCoverage.cited / sourceCoverage.total) * 100)
    : null;
  const relationshipLabel = view.relationship
    ? localizedRelationshipLabel(view.relationship.kind, tLabel)
    : null;

  return (
    <section
      className="registry-rise mb-10 grid gap-6 border-b rule-hair pb-7 sm:grid-cols-[1fr_auto] sm:items-start"
      style={{ animationDelay: '0ms' }}
    >
      <div className="min-w-0">
        <p className="font-display text-[0.66rem] uppercase tracking-[0.32em] text-muted-foreground">
          {t('folio', { record: person.record })}
        </p>
        <h1 className="mt-2 font-display text-[2.4rem] font-medium leading-[1.05] tracking-[-0.01em] text-balance text-foreground sm:text-[3rem]">
          <bdi>{person.name}</bdi>
        </h1>
        {(dates || person.birth?.place) ? (
          <p className="mt-2 font-mono text-sm tracking-tight text-muted-foreground">
            {dates ? <bdi>{dates}</bdi> : ''}
            {dates && person.birth?.place ? '  ·  ' : ''}
            {person.birth?.place ? <bdi>{person.birth.place}</bdi> : ''}
          </p>
        ) : null}

        {view.relationship && relationshipLabel ? (
          <p className="mt-1.5 font-display text-[0.72rem] uppercase tracking-[0.18em] text-muted-foreground">
            {relationshipLabel}{' '}
            <span className="text-muted-foreground/60">
              {t('perspectiveSuffix', {
                isMe: view.relationship.perspective.isMe ? 'true' : 'false',
                name: view.relationship.perspective.name,
              })}
            </span>
          </p>
        ) : null}

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 border-t rule-hair pt-4 sm:max-w-xl sm:grid-cols-6">
          <Stat label={t('statParents')} value={parents.length} />
          <Stat label={t('statSiblings')} value={siblings.length} />
          <Stat label={t('statSpouses')} value={spouses.length} />
          <Stat label={t('statChildren')} value={children.length} />
          <Stat label={t('statAncestors')} value={ancestorCount} sub={t('statGenerations', { n: generationCount })} />
          {sourcedPercent !== null ? (
            <Stat
              label={t('statSourced')}
              value={`${sourcedPercent}%`}
              sub={t('statSourcedFraction', { cited: String(sourceCoverage.cited), total: String(sourceCoverage.total) })}
            />
          ) : null}
        </dl>
      </div>

      {person.slug ? (
        <div className="flex items-start sm:pt-1">
          <Link
            href={`/${person.slug}`}
            className={buttonVariants({ variant: 'default', size: 'sm' })}
          >
            <FileText data-icon="inline-start" />
            {t('buttonArticle')}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
