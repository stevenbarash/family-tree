import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import type { RedlinkEntry } from '@core/pages/redlinks.ts';

interface Props {
  entries: ReadonlyArray<RedlinkEntry>;
  /** How many top rows to display in the card. The aggregate footer
   *  spans the full list, so this is a display-only slice. */
  rowLimit: number;
}

/**
 * Unwritten-pages (redlinks) dashboard card. Renders top-N wikilink
 * targets that don't yet resolve to an article, with a global
 * aggregate footer. Returns null on an empty redlinks list.
 */
export function RedlinksCard({ entries, rowLimit }: Props) {
  const t = useTranslations('Page.Home');
  if (entries.length === 0) return null;

  const rows = entries.slice(0, rowLimit);
  const totalRefs = entries.reduce((s, e) => s + e.count, 0);

  return (
    <section className="mb-10">
      <h2 className="mb-3 font-display text-xs uppercase tracking-[0.32em] text-muted-foreground">
        {t('unwrittenPagesHeading')}
      </h2>
      <ul className="flex flex-col gap-1.5">
        {rows.map(r => (
          <li key={r.canonical} className="text-sm">
            {t.rich('unwrittenPagesRow', {
              target: r.target,
              count: r.count,
              a: chunks => (
                <Link
                  href="/redlinks"
                  className="redlink underline-offset-4 hover:no-underline"
                >
                  <bdi>{chunks}</bdi>
                </Link>
              ),
            })}
          </li>
        ))}
      </ul>
      <p className="mt-3 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground/70">
        {t.rich('unwrittenPagesAggregate', {
          targets: entries.length,
          refs: totalRefs,
          a: chunks => (
            <Link
              href="/redlinks"
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              {chunks}
            </Link>
          ),
        })}
      </p>
    </section>
  );
}
