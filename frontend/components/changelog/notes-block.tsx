import type { ReactElement } from 'react';
import type { NotesSection } from '@/lib/changelog';
import { renderChangelogMarkdown } from '@/lib/changelog';

interface NotesBlockProps {
  data: NotesSection;
}

export async function NotesBlock({ data }: NotesBlockProps): Promise<ReactElement> {
  const body = await renderChangelogMarkdown(data.bodyMarkdown);
  return (
    <section
      id={data.id}
      className="registry-rise scroll-mt-20 border-t border-foreground/12 pt-12"
    >
      <header>
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">
          Colophon
        </p>
        <h2 className="mt-2 font-display text-2xl font-light tracking-tight text-foreground">
          {data.title}
        </h2>
      </header>
      <div className="changelog-prose mt-6 max-w-prose">{body}</div>
    </section>
  );
}
