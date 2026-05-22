'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations, useLocale } from 'next-intl';
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
  const t = useTranslations('Page.Article.ResearchNotes.History');
  // Bumped by Retry to force a refetch. Used as part of HistoryBody's
  // `key` so a retry remounts the body — that's how state resets to
  // `loading` again without a setState-in-effect call.
  const [nonce, setNonce] = useState(0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        {open ? (
          <HistoryBody
            key={`${slug}|${noteId}|${nonce}`}
            slug={slug}
            noteId={noteId}
            onRetry={() => setNonce((n) => n + 1)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface HistoryBodyProps {
  slug: string;
  noteId: string;
  onRetry: () => void;
}

/**
 * The body is split out so a change in `(slug, noteId, nonce)` remounts
 * the component via the parent's `key` prop. That makes "reset to
 * loading on dependency change" a side effect of React's reconciliation
 * rather than a setState-in-effect call — eliminating the anti-pattern
 * the per-task fetch effect would otherwise need.
 */
function HistoryBody({ slug, noteId, onRetry }: HistoryBodyProps) {
  const t = useTranslations('Page.Article.ResearchNotes.History');
  const tErr = useTranslations('Errors');
  const locale = useLocale();
  // Initial state is 'loading' on every mount. No reset needed because
  // dependency changes remount via the parent's `key`.
  const [fetched, setFetched] = useState<Fetched>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/notes/${encodeURIComponent(slug)}/${noteId}/history`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setFetched({
            state: 'error',
            message: typeof body?.error === 'string' ? body.error : tErr('requestFailedWithStatus', { status: String(res.status) }),
          });
          return;
        }
        const body = (await res.json()) as { events: NoteEvent[] };
        setFetched({ state: 'loaded', events: body.events });
      })
      .catch((err) => {
        if (cancelled) return;
        setFetched({ state: 'error', message: err?.message ?? tErr('requestFailed') });
      });
    return () => { cancelled = true; };
  }, [slug, noteId, tErr]);

  return renderBody(fetched, onRetry, t, locale);
}

function eventLabel(
  kind: NoteEventKind,
  t: ReturnType<typeof useTranslations<'Page.Article.ResearchNotes.History'>>,
): string {
  if (kind === 'created') return t('eventCreated');
  if (kind === 'edited') return t('eventEdited');
  if (kind === 'retracted') return t('eventRetracted');
  return t('eventRestored');
}

function renderBody(
  fetched: Fetched,
  retry: () => void,
  t: ReturnType<typeof useTranslations<'Page.Article.ResearchNotes.History'>>,
  locale: string,
): ReactNode {
  if (fetched.state === 'loading') {
    return <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  }
  if (fetched.state === 'error') {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">{fetched.message}</p>
        <Button size="sm" variant="outline" onClick={retry}>{t('retry')}</Button>
      </div>
    );
  }
  if (fetched.events.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('empty')}</p>;
  }
  return (
    <ol className="space-y-3">
      {fetched.events.map((e, i) => (
        <li key={i} className="border-s-2 border-border ps-3">
          <div className="flex items-baseline gap-2 text-sm">
            <span className="font-display text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
              {eventLabel(e.kind, t)}
            </span>
            <span className="text-foreground" title={e.at ?? undefined}>
              {e.at ? formatRelative(e.at, locale) : t('unknownTime')}
            </span>
            <span className="text-muted-foreground">
              {e.by ? t('byAuthor', { by: e.by }) : <em>{t('unknownAuthor')}</em>}
            </span>
          </div>
          {e.kind === 'edited' && typeof e.prevText === 'string' ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                {t('showSnapshot')}
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
