import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { toTalkSlug } from '@core/pages/slug.ts';
import type { Locale } from '@/i18n/routing';
import type { TalkThreadsView, TalkThreadView } from '@/lib/server-services';

interface Props {
  slug: string;
  locale: Locale;
  threads: TalkThreadsView;
}

/**
 * Surfaces the `::open`/`::closed`/`::superseded` editorial threads
 * from the talk page as collapsible cards inline on the article. The
 * companion to the freshness-strip "talk: …" link at the top: that
 * link routes to the full talk page (research notes, drafting plan,
 * agent log included); this panel renders only the editorial threads
 * — the wiki's research voice — so readers don't have to leave the
 * article to see them.
 */
export async function TalkThreadsPanel({ slug, locale, threads }: Props) {
  if (threads.open.length + threads.resolved.length + threads.superseded.length === 0) {
    return null;
  }

  const t = await getTranslations({ locale, namespace: 'Page.Article.TalkThreads' });

  return (
    <section
      aria-labelledby="talk-threads-heading"
      className="mt-12 border-t pt-8 not-prose"
    >
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2
          id="talk-threads-heading"
          className="font-heading text-2xl tracking-normal text-foreground"
        >
          {t('title')}
        </h2>
        <Link
          href={`/${toTalkSlug(slug)}`}
          className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {t('viewFullTalk')}
        </Link>
      </div>

      {threads.open.length > 0 ? (
        <ThreadGroup
          label={t('openCount', { n: threads.open.length })}
          threads={threads.open}
          defaultOpen
        />
      ) : null}
      {threads.resolved.length > 0 ? (
        <ThreadGroup
          label={t('resolvedCount', { n: threads.resolved.length })}
          threads={threads.resolved}
          defaultOpen={false}
        />
      ) : null}
      {threads.superseded.length > 0 ? (
        <ThreadGroup
          label={t('supersededCount', { n: threads.superseded.length })}
          threads={threads.superseded}
          defaultOpen={false}
        />
      ) : null}
    </section>
  );
}

interface ThreadGroupProps {
  label: string;
  threads: TalkThreadView[];
  defaultOpen: boolean;
}

function ThreadGroup({ label, threads, defaultOpen }: ThreadGroupProps) {
  return (
    <details open={defaultOpen} className="mt-4 first:mt-0">
      <summary className="cursor-pointer list-none font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground">
        {label}
      </summary>
      <ul className="mt-3 space-y-2">
        {threads.map((thread, i) => (
          <li key={`${thread.heading}-${i}`}>
            <details className="rounded-md border bg-card/40 px-4 py-3 hover:border-foreground/30">
              <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
                {thread.heading}
              </summary>
              <div className="prose prose-stone dark:prose-invert mt-3 max-w-none text-sm prose-headings:font-heading prose-p:leading-7">
                {thread.rendered}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </details>
  );
}
