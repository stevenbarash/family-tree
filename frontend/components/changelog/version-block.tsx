import type { ReactElement } from 'react';
import type { VersionSection } from '@/lib/changelog';
import { renderChangelogMarkdown } from '@/lib/changelog';
import { Subsection } from './subsection';
import { NumberMark, StatusPill } from './header-marks';

interface VersionBlockProps {
  data: VersionSection;
  nested?: boolean;
}

export async function VersionBlock({ data, nested = false }: VersionBlockProps): Promise<ReactElement> {
  const intro = data.intro ? await renderChangelogMarkdown(data.intro) : null;
  return (
    <article
      id={data.id}
      className={`registry-rise scroll-mt-20 ${nested ? 'border-l border-border/50 pl-6' : 'border-t border-foreground/12 pt-12 first-of-type:border-t-0 first-of-type:pt-2'}`}
    >
      <header className="relative">
        <NumberMark n={data.number} />
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">
          {nested ? 'Tagged release' : 'Revision'}
        </p>
        <h2 className="mt-2 font-display text-4xl font-light tracking-tight text-foreground sm:text-[2.75rem]">
          {data.label}
        </h2>
        {data.subtitle ? (
          <p className="mt-2 max-w-prose text-[0.95rem] italic text-muted-foreground">
            {data.subtitle}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <StatusPill status={data.status} />
        </div>
      </header>
      {intro ? <div className="changelog-prose mt-6">{intro}</div> : null}
      {data.subsections.length > 0 ? (
        <div className="mt-8">
          {data.subsections.map(sub => (
            <Subsection key={`${data.id}-${sub.kind}-${sub.qualifier ?? ''}`} data={sub} />
          ))}
        </div>
      ) : null}
    </article>
  );
}
