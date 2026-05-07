'use client';

import { useState, useTransition, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, Undo2 } from 'lucide-react';
import { EditNoteForm } from './edit-note-form';
import { NoteHistoryDialog } from './note-history-dialog';
import { formatRelative } from './relative-time';

export interface NoteItemView {
  id: string;
  date: string;
  by: string;
  kind: 'human' | 'agent';
  createdAt: string | null;
  editedAt: string | null;
  editedBy: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  isLegacy: boolean;
  text: string;
  rendered: ReactElement;
}

interface Props {
  slug: string;
  note: NoteItemView;
}

export function NoteItem({ slug, note }: Props) {
  const [editing, setEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Mount the dialog on first open and keep it mounted so the exit
  // animation can play; avoids mounting it for every note on the page.
  const [historyEverOpened, setHistoryEverOpened] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isDeleted = !!note.deletedAt;
  const canMutate = !note.isLegacy && !isDeleted;

  const onDelete = () => {
    if (!confirm('Retract this note? Reversible from the panel.')) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/notes/${encodeURIComponent(slug)}/${note.id}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ by: localStorage.getItem('whoami:author') ?? undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(typeof body?.error === 'string' ? body.error : `request failed (${res.status})`);
        return;
      }
      router.refresh();
    });
  };

  const onRestore = () => {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/notes/${encodeURIComponent(slug)}/${note.id}/restore`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ by: localStorage.getItem('whoami:author') ?? undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(typeof body?.error === 'string' ? body.error : `request failed (${res.status})`);
        return;
      }
      router.refresh();
    });
  };

  return (
    <li className={`group/note relative py-1.5 ${isDeleted ? 'opacity-60' : ''}`}>
      {editing ? (
        <EditNoteForm
          slug={slug}
          id={note.id}
          initialText={note.text}
          onCancel={() => setEditing(false)}
          onSaved={() => { setEditing(false); router.refresh(); }}
        />
      ) : (
        <>
          <div className={isDeleted ? 'line-through' : ''}>
            {note.rendered}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              by {note.by}
              {note.kind === 'agent' ? ' (agent)' : ''}
              {note.createdAt ? ` · ${formatRelative(note.createdAt)}` : ''}
            </span>
            {note.editedAt ? (
              <span>
                ·{' '}
                <button
                  type="button"
                  onClick={() => { setHistoryEverOpened(true); setHistoryOpen(true); }}
                  className="cursor-pointer underline-offset-2 hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  aria-label="Show note history"
                >
                  edited {formatRelative(note.editedAt)}{note.editedBy ? ` by ${note.editedBy}` : ''}
                </button>
              </span>
            ) : null}
            {isDeleted ? (
              <span>· retracted by {note.deletedBy} · {formatRelative(note.deletedAt)}</span>
            ) : null}
            <span className="ml-auto flex gap-1 opacity-0 transition-opacity group-hover/note:opacity-100">
              {canMutate ? (
                <>
                  <Button size="sm" variant="ghost" className="h-6 px-1.5" disabled={isPending} onClick={() => setEditing(true)} aria-label="Edit note">
                    <Pencil className="size-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 px-1.5" disabled={isPending} onClick={onDelete} aria-label="Retract note">
                    <Trash2 className="size-3" />
                  </Button>
                </>
              ) : null}
              {isDeleted ? (
                <Button size="sm" variant="ghost" className="h-6 px-1.5" disabled={isPending} onClick={onRestore} aria-label="Restore note">
                  <Undo2 className="size-3" />
                </Button>
              ) : null}
            </span>
          </div>
          {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
          {historyEverOpened ? (
            <NoteHistoryDialog
              slug={slug}
              noteId={note.id}
              open={historyOpen}
              onOpenChange={setHistoryOpen}
            />
          ) : null}
        </>
      )}
    </li>
  );
}
