import { useTranslations } from 'next-intl';
import { GroupedList } from '@/components/family/grouped-list';
import type { FamilyTreeView } from '@/lib/family';
import { SectionHeader, joinMeta } from './shared';

interface Props {
  view: FamilyTreeView;
}

export function MediaSection({ view }: Props) {
  const t = useTranslations('Page.FamilyTree.media');
  const media = view.selectedMedia;
  if (media.length === 0) return null;

  return (
    <section className="registry-rise mb-12" style={{ animationDelay: '120ms' }}>
      <SectionHeader title={t('title')} count={media.length} />
      <GroupedList>
        {media.map(m => (
          <div
            key={`media-${m.record}`}
            className="flex items-baseline gap-3 px-4 py-3 text-sm"
          >
            {m.primary ? (
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-amber-600 dark:text-amber-400">
                {t('primary')}
              </span>
            ) : null}
            <span className="flex-1 text-foreground">
              {m.title ?? m.file ?? t('fallbackTitle', { record: m.record })}
            </span>
            <span className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground/70">
              {joinMeta([m.form, m.record])}
            </span>
          </div>
        ))}
      </GroupedList>
    </section>
  );
}
