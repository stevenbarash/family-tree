import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import type { OpenGapsView } from '@/lib/server-services';

interface Props {
  view: OpenGapsView;
}

/**
 * Editorial-gaps dashboard card. Renders top-N articles by unresolved
 * thread count (`::open` + `::gap`) with a global aggregate footer.
 * Returns null when the wiki has no open gaps.
 */
export function OpenGapsCard({ view }: Props) {
  const t = useTranslations('Page.Home');
  if (view.rows.length === 0) return null;

  return (
    <section className="mb-10">
      <h2 className="mb-3 font-display text-xs uppercase tracking-[0.32em] text-muted-foreground">
        {t('editorialGapsHeading')}
      </h2>
      <ul className="flex flex-col gap-1.5">
        {view.rows.map(r => (
          <li key={r.slug} className="text-sm">
            {t.rich('editorialGapsRow', {
              title: r.title,
              count: r.count,
              a: chunks => (
                <Link
                  href={`/${r.slug}`}
                  className="font-medium underline-offset-4 hover:text-foreground hover:underline"
                >
                  <bdi>{chunks}</bdi>
                </Link>
              ),
              talk: chunks => (
                <Link
                  href={`/${r.slug}#talk-threads-heading`}
                  className="font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground/80 underline-offset-4 hover:text-foreground hover:underline"
                >
                  {chunks}
                </Link>
              ),
            })}
          </li>
        ))}
      </ul>
      <p className="mt-3 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground/70">
        {t('editorialGapsAggregate', { threads: view.total, articles: view.articles })}
      </p>
    </section>
  );
}
