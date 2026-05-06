import { toTalkSlug } from '@core/pages/slug.ts';
import { AddNoteForm } from './add-note-form';
import { NoteItem, type NoteItemView } from './note-item';

interface Props {
  slug: string;
  notes: NoteItemView[];
}

export function ResearchNotesPanel({ slug, notes }: Props) {
  const talkSlug = toTalkSlug(slug);
  // Group by date heading, preserving the parser's newest-first order.
  const byDate: { date: string; items: NoteItemView[] }[] = [];
  for (const n of notes) {
    const last = byDate[byDate.length - 1];
    if (last && last.date === n.date) last.items.push(n);
    else byDate.push({ date: n.date, items: [n] });
  }

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

      {byDate.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No notes yet. The first one you save creates the section in <code className="text-xs">{talkSlug}</code>.
        </p>
      ) : (
        <div className="space-y-6">
          {byDate.map((day) => (
            <div key={day.date}>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{day.date}</h3>
              <ul className="space-y-1 text-sm">
                {day.items.map((n) => (
                  <NoteItem key={n.id} slug={slug} note={n} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
