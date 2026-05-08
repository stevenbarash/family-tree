import type { ReactElement } from 'react';
import type { SubsectionKind, Subsection as SubsectionData } from '@/lib/changelog';
import { renderChangelogMarkdown } from '@/lib/changelog';

const KIND_TONE: Record<SubsectionKind, string> = {
  Added: 'bg-foreground',
  Changed: 'bg-muted-foreground/70',
  Removed: 'bg-destructive',
  Fixed: 'bg-infobox-accent',
  Deprecated: 'bg-muted-foreground/50',
  Security: 'bg-destructive',
  Notes: 'bg-muted-foreground/50',
  Other: 'bg-muted-foreground/40',
};

const KIND_GLYPH: Record<SubsectionKind, string> = {
  Added: '+',
  Changed: '~',
  Removed: '−',
  Fixed: '✓',
  Deprecated: '·',
  Security: '!',
  Notes: '§',
  Other: '·',
};

interface SubsectionProps {
  data: SubsectionData;
}

export async function Subsection({ data }: SubsectionProps): Promise<ReactElement> {
  const body = await renderChangelogMarkdown(data.bodyMarkdown);
  const tone = KIND_TONE[data.kind];
  const glyph = KIND_GLYPH[data.kind];
  return (
    <section className="changelog-subsection mt-9 first:mt-0">
      <header className="mb-4 flex items-baseline gap-3">
        <span
          aria-hidden
          className={`inline-flex h-5 w-5 items-center justify-center rounded-sm font-mono text-[0.7rem] font-bold leading-none text-background ${tone}`}
        >
          {glyph}
        </span>
        <h3 className="font-mono text-[0.72rem] uppercase tracking-[0.22em] text-foreground">
          {data.kind === 'Other' ? (data.qualifier ?? 'Notes') : data.kind}
        </h3>
        {data.qualifier && data.kind !== 'Other' ? (
          <>
            <span aria-hidden className="text-muted-foreground/50">·</span>
            <span className="font-display text-[0.85rem] italic text-muted-foreground">
              {data.qualifier}
            </span>
          </>
        ) : null}
      </header>
      <div className="changelog-prose">{body}</div>
    </section>
  );
}
