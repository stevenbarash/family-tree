import type { ReactElement } from 'react';
import type { GroupSection } from '@/lib/changelog';
import { renderChangelogMarkdown } from '@/lib/changelog';
import { VersionBlock } from './version-block';
import { NumberMark } from './header-marks';

interface GroupBlockProps {
  data: GroupSection;
}

export async function GroupBlock({ data }: GroupBlockProps): Promise<ReactElement> {
  const intro = data.intro ? await renderChangelogMarkdown(data.intro) : null;
  return (
    <section
      id={data.id}
      className="registry-rise scroll-mt-20 border-t border-foreground/12 pt-12"
    >
      <header className="relative">
        <NumberMark n={data.number} />
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">
          Anthology
        </p>
        <h2 className="mt-2 font-display text-3xl font-light tracking-tight text-foreground sm:text-[2.25rem]">
          {data.title}
        </h2>
      </header>
      {intro ? <div className="changelog-prose mt-6 max-w-prose">{intro}</div> : null}
      <div className="mt-10 flex flex-col gap-10">
        {data.versions.map(v => (
          <VersionBlock key={v.id} data={v} nested />
        ))}
      </div>
    </section>
  );
}
