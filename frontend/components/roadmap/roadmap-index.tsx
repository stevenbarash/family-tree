import { Link } from '@/i18n/navigation';
import type { ReactElement } from 'react';
import type { RoadmapSection } from '@/lib/roadmap';

const KIND_GLYPH: Record<RoadmapSection['kind'], string> = {
  snapshot: '◆',
  track: '●',
  parking: '◌',
  cut: '×',
  shipped: '✓',
  narrative: '¶',
};

interface RoadmapIndexProps {
  sections: RoadmapSection[];
  onThisPageLabel: string;
  className?: string;
}

export function RoadmapIndex({ sections, onThisPageLabel, className = '' }: RoadmapIndexProps): ReactElement {
  return (
    <nav aria-label={onThisPageLabel} className={className}>
      <p className="mb-4 font-mono text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
        {onThisPageLabel}
      </p>
      <ol className="flex flex-col gap-1.5 border-s border-foreground/12 ps-4 text-sm">
        {sections.map(s => (
          <li key={s.id}>
            <Link
              href={`#${s.id}`}
              className="group inline-flex items-baseline gap-2 leading-snug"
            >
              <span
                aria-hidden
                className="font-mono text-[0.7rem] text-muted-foreground/70 group-hover:text-foreground"
              >
                {KIND_GLYPH[s.kind]}
              </span>
              <span className="font-medium text-foreground/85 underline-offset-4 group-hover:text-foreground group-hover:underline">
                {s.trackName ?? s.title}
              </span>
              {s.itemCount > 0 ? (
                <span className="ms-1 font-mono text-[0.65rem] text-muted-foreground/60">
                  {s.itemCount}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
