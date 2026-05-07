'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatRelative } from './relative-time';

export type NoteEventKind = 'created' | 'edited' | 'retracted' | 'restored';

export interface NoteEvent {
  kind: NoteEventKind;
  at: string | null;
  by: string | null;
  prevText?: string;
}

interface Props {
  slug: string;
  noteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Fetched =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'loaded'; events: NoteEvent[] };

const KIND_LABEL: Record<NoteEventKind, string> = {
  created: 'created',
  edited: 'edited',
  retracted: 'retracted',
  restored: 'restored',
};

export function NoteHistoryDialog({ slug, noteId, open, onOpenChange }: Props) {
  const [fetched, setFetched] = useState<Fetched>({ state: 'idle' });

  useEffect(() => {
    if (!open) return;
    if (fetched.state === 'loaded') return;
    let cancelled = false;
    setFetched({ state: 'loading' });
    fetch(`/api/notes/${encodeURIComponent(slug)}/${noteId}/history`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setFetched({
            state: 'error',
            message: typeof body?.error === 'string' ? body.error : `request failed (${res.status})`,
          });
          return;
        }
        const body = (await res.json()) as { events: NoteEvent[] };
        setFetched({ state: 'loaded', events: body.events });
      })
      .catch((err) => {
        if (cancelled) return;
        setFetched({ state: 'error', message: err?.message ?? 'request failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [open, slug, noteId, fetched.state]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Note history</DialogTitle>
        </DialogHeader>
        {fetched.state === 'loading' || fetched.state === 'idle' ? (
          <p className="text-sm text-muted-foreground">Loading history…</p>
        ) : fetched.state === 'error' ? (
          <div className="space-y-2">
            <p className="text-sm text-destructive">{fetched.message}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFetched({ state: 'idle' })}
            >
              Retry
            </Button>
          </div>
        ) : fetched.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No history for this note.</p>
        ) : (
          <ol className="space-y-3">
            {fetched.events.map((e, i) => (
              <li key={i} className="border-l-2 border-border pl-3">
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="font-display text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                    {KIND_LABEL[e.kind]}
                  </span>
                  <span className="text-foreground" title={e.at ?? undefined}>
                    {e.at ? formatRelative(e.at) : 'unknown time'}
                  </span>
                  <span className="text-muted-foreground">
                    {e.by ? `by ${e.by}` : <em>(unknown)</em>}
                  </span>
                </div>
                {e.kind === 'edited' && typeof e.prevText === 'string' ? (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                      Show snapshot
                    </summary>
                    <pre className="mt-1 whitespace-pre-wrap rounded-sm bg-muted/50 p-2 font-mono text-xs">
                      {e.prevText}
                    </pre>
                  </details>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
