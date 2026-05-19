import type { ReactElement } from 'react';
import type { RoadmapSection } from '@/lib/roadmap';
import { renderRoadmapMarkdown } from '@/lib/roadmap';

interface SectionBlockProps {
  section: RoadmapSection;
  kindLabel: string;
}

const KIND_ACCENT: Record<RoadmapSection['kind'], string> = {
  snapshot: 'border-s-primary',
  track: 'border-s-foreground/35',
  parking: 'border-s-amber-500/55 dark:border-s-amber-400/55',
  cut: 'border-s-muted-foreground/30',
  shipped: 'border-s-emerald-500/45 dark:border-s-emerald-400/45',
  narrative: 'border-s-border',
};

export async function SectionBlock({ section, kindLabel }: SectionBlockProps): Promise<ReactElement> {
  const body = await renderRoadmapMarkdown(section.bodyMarkdown);
  const accent = KIND_ACCENT[section.kind] ?? KIND_ACCENT.narrative;
  return (
    <article
      id={section.id}
      className={`registry-rise scroll-mt-20 border-s-2 ${accent} ps-6 pb-2`}
    >
      <header className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-mono text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
          {kindLabel}
        </p>
        {section.itemCount > 0 ? (
          <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground/65">
            · {section.itemCount}
          </span>
        ) : null}
      </header>
      <h2 className="font-display text-3xl font-light tracking-tight text-foreground sm:text-[2.25rem]">
        {section.title}
      </h2>
      {body ? <div className="roadmap-prose mt-6 max-w-none">{body}</div> : null}
    </article>
  );
}
