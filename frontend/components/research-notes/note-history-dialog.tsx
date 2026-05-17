'use client';

import { useEffect, useState, type ReactNode } from 'react';
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
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'loaded'; events: NoteEvent[] };

export function NoteHistoryDialog({ slug, noteId, open, onOpenChange }: Props) {
  const [fetched, setFetched] = useState<Fetched>({ state: 'loading' });
  // Bumped by Retry to force a refetch without conflating with `fetched`.
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!open) return;
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
    return () => { cancelled = true; };
  }, [open, slug, noteId, nonce]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Note history</DialogTitle>
        </DialogHeader>
        {renderBody(fetched, () => setNonce((n) => n + 1))}
      </DialogContent>
    </Dialog>
  );
}

function renderBody(fetched: Fetched, retry: () => void): ReactNode {
  if (fetched.state === 'loading') {
    return <p className="text-sm text-muted-foreground">Loading history…</p>;
  }
  if (fetched.state === 'error') {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">{fetched.message}</p>
        <Button size="sm" variant="outline" onClick={retry}>Retry</Button>
      </div>
    );
  }
  if (fetched.events.length === 0) {
    return <p className="text-sm text-muted-foreground">No history for this note.</p>;
  }
  return (
    <ol className="space-y-3">
      {fetched.events.map((e, i) => (
        <li key={i} className="border-s-2 border-border ps-3">
          <div className="flex items-baseline gap-2 text-sm">
            <span className="font-display text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
              {e.kind}
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
  );
}
