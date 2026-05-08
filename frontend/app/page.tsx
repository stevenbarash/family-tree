import Link from 'next/link';
import { getCachedList, getCachedSnapshots, getRecentlyRevised } from '@/lib/server-services';
import { getFamilyTree } from '@/lib/family';
import { GENEALOGY_DIR, PAGES_DIR, SELF_RECORD } from '@/lib/env';
import { joinMeta } from '@/components/family/sections/shared';

export const dynamic = 'force-dynamic';

const STALE_SNAPSHOT_DAYS = 30;
const RECENT_LIMIT = 6;
const FRONTIER_LIMIT = 4;

function snapshotAgeDays(date: string | undefined): number | null {
  if (!date) return null;
  const ts = new Date(date).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.floor((Date.now() - ts) / 86400000);
}

export default async function HomePage() {
  const { list } = await getCachedList();
  const live = list.filter(p => !p.isTalk && !p.isArchived);
  const talk = list.filter(p => p.isTalk && !p.isArchived);

  const [tree, recent, snapshots] = await Promise.all([
    getFamilyTree(SELF_RECORD, null),
    getRecentlyRevised(PAGES_DIR, RECENT_LIMIT),
    getCachedSnapshots(GENEALOGY_DIR),
  ]);

  const latestSnap = snapshots[snapshots.length - 1];
  const snapAge = snapshotAgeDays(latestSnap?.date);
  const snapDate = latestSnap?.date?.slice(0, 10) ?? null;

  const frontier = tree?.coverage.frontier.slice(0, FRONTIER_LIMIT) ?? [];
  const generations = tree
    ? tree.byGeneration.filter(g => g.paternal.length + g.maternal.length > 0).length
    : 0;
  const ancestors = tree
    ? tree.byGeneration.reduce((s, g) => s + g.paternal.length + g.maternal.length, 0)
    : 0;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-10">
      <header className="mb-10 border-b pb-7">
        <p className="font-display text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground/80">
          The Registry
        </p>
        <h1 className="mt-2 text-4xl font-semibold leading-tight tracking-normal text-foreground sm:text-5xl">
          whoami.wiki
        </h1>
        <p className="mt-3 font-mono text-[0.75rem] uppercase tracking-[0.08em] text-muted-foreground/85">
          {joinMeta([
            ancestors > 0 ? `${ancestors} ancestors across ${generations} generations` : null,
            `${live.length} ${live.length === 1 ? 'article' : 'articles'}`,
            snapDate ? `GEDCOM ${snapDate}` : null,
          ])}
        </p>
        <nav className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <Link href="/family" className="font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Family →</Link>
          <Link href="/family/tree" className="font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Tree →</Link>
          <Link href="/search" className="font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Search →</Link>
          <Link href="/changelog" className="font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Changelog →</Link>
        </nav>
      </header>

      {snapAge !== null && snapAge > STALE_SNAPSHOT_DAYS ? (
        <div className="mb-8 rounded-md border border-amber-300/60 bg-amber-50/60 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          GEDCOM snapshot is {snapAge} days old (last sync {snapDate}). Run{' '}
          <code className="rounded bg-amber-100/70 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-500/20">
            wai sync-gedcom --ged-file ... --notes "refresh"
          </code>{' '}
          when you have changes to import.
        </div>
      ) : null}

      {frontier.length > 0 ? (
        <section className="mb-10">
          <h2 className="mb-3 font-display text-xs uppercase tracking-[0.32em] text-muted-foreground">
            Continue research
          </h2>
          <ul className="flex flex-col gap-1.5">
            {frontier.map(f => (
              <li key={f.record} className="text-sm">
                <Link
                  href={`/family/tree?person=${encodeURIComponent(f.record)}`}
                  className="underline-offset-4 hover:text-foreground hover:underline"
                >
                  {f.name}
                </Link>{' '}
                <span className="font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground/80">
                  · gen {f.generation} · {f.side} · missing {f.missing}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {recent.length > 0 ? (
        <section className="mb-10">
          <h2 className="mb-3 font-display text-xs uppercase tracking-[0.32em] text-muted-foreground">
            Recently revised
          </h2>
          <ul className="flex flex-col gap-1.5">
            {recent.map(p => (
              <li key={p.slug} className="text-sm">
                <Link
                  href={`/${p.slug}`}
                  className="underline-offset-4 hover:text-foreground hover:underline"
                >
                  {p.title}
                </Link>{' '}
                <span className="font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground/80">
                  · {new Date(p.mtime).toISOString().slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mb-10">
        <h2 className="mb-3 font-display text-xs uppercase tracking-[0.32em] text-muted-foreground">
          All articles ({live.length})
        </h2>
        <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {live.map(p => (
            <li key={p.slug}>
              <Link href={`/${p.slug}`} className="underline-offset-4 hover:text-foreground hover:underline">
                {p.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {talk.length > 0 ? (
        <section>
          <h2 className="mb-3 font-display text-xs uppercase tracking-[0.32em] text-muted-foreground">
            Talk pages ({talk.length})
          </h2>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {talk.map(p => (
              <li key={p.slug}>
                <Link href={`/${p.slug}`} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
