import type { ReactElement } from 'react';
import { toTalkSlug } from '@core/pages/slug.ts';
import { AddNoteForm } from './add-note-form';

interface Props {
  slug: string;
  /** Rendered notes section (or null if the talk page has no section yet). */
  notes: ReactElement | null;
}

export function ResearchNotesPanel({ slug, notes }: Props) {
  const talkSlug = toTalkSlug(slug);

  return (
    <section
      aria-labelledby="research-notes-heading"
      className="mt-12 border-t pt-8 not-prose"
    >
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2
          id="research-notes-heading"
          className="font-heading text-2xl tracking-normal text-foreground"
        >
          Research notes
        </h2>
        <p className="text-xs text-muted-foreground">
          Captured on this person; folded into the article when the editor next runs.
        </p>
      </div>

      <div className="mb-6">
        <AddNoteForm slug={slug} />
      </div>

      {notes ? (
        <div className="prose prose-stone dark:prose-invert max-w-none prose-h3:mt-6 prose-h3:text-base prose-h3:font-semibold prose-h3:text-muted-foreground prose-li:my-0.5 prose-ul:my-2">
          {notes}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No notes yet. The first one you save creates the section in <code className="text-xs">{talkSlug}</code>.
        </p>
      )}
    </section>
  );
}
