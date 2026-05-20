import { useTranslations } from 'next-intl';
import { GroupedList } from '@/components/family/grouped-list';
import type { FamilyTreeView } from '@/lib/family';
import { SectionHeader } from './shared';

const FIELD_KEY: Record<string, string> = {
  'birth.date': 'birthDate',
  'birth.place': 'birthPlace',
  'death.date': 'deathDate',
  'death.place': 'deathPlace',
};

function fieldKey(field: string): { key: string; raw: string } {
  if (FIELD_KEY[field]) return { key: FIELD_KEY[field]!, raw: field };
  if (field.startsWith('marriage.')) {
    const tail = field.split('.').slice(-1)[0];
    return { key: tail === 'place' ? 'marriagePlace' : 'marriageDate', raw: field };
  }
  return { key: 'other', raw: field };
}

interface Props {
  view: FamilyTreeView;
}

export function ConflictsSection({ view }: Props) {
  const t = useTranslations('Page.FamilyTree.conflicts');
  const conflicts = view.selectedConflicts;
  if (conflicts.length === 0) return null;

  const unresolved = conflicts.filter(c => !c.resolved).length;
  return (
    <section className="registry-rise mb-12" style={{ animationDelay: '110ms' }}>
      <SectionHeader
        title={t('title')}
        count={conflicts.length}
        after={
          unresolved > 0 ? (
            <p className="font-mono text-[0.7rem] tabular-nums text-amber-600 dark:text-amber-400">
              {t('unresolved', { n: unresolved })}
            </p>
          ) : null
        }
      />
      <GroupedList>
        {conflicts.map((c, i) => {
          const f = fieldKey(c.field);
          return (
            <div key={`conflict-${i}`} className="flex flex-col gap-2 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-[0.7rem] uppercase tracking-[0.18em] text-foreground">
                  {t('field', { field: f.key, raw: f.raw })}
                </h3>
                {c.resolved ? (
                  <span className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground/70">
                    {t('resolved')}
                  </span>
                ) : null}
              </div>
              <ul className="flex flex-col gap-1.5 text-sm">
                {c.values.map((v, j) => (
                  <li key={`v-${j}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <span className="font-medium text-foreground tabular-nums"><bdi>{v.value}</bdi></span>
                    {v.source ? (
                      <span className="text-xs text-muted-foreground">{v.source}</span>
                    ) : null}
                    {typeof v.weight === 'number' ? (
                      <span className="font-mono text-[0.65rem] text-muted-foreground/70">
                        {t('weight', { value: v.weight.toFixed(2) })}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {c.note ? (
                <p className="text-xs text-muted-foreground italic">{c.note}</p>
              ) : null}
            </div>
          );
        })}
      </GroupedList>
    </section>
  );
}
