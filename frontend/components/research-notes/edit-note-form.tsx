'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  slug: string;
  id: string;
  initialText: string;
  onCancel: () => void;
  onSaved: () => void;
}

export function EditNoteForm({ slug, id, initialText, onCancel, onSaved }: Props) {
  const t = useTranslations('Page.Article.ResearchNotes.Edit');
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    const body = text.trim();
    if (body === '') {
      setError(t('emptyError'));
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/notes/${encodeURIComponent(slug)}/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          note: body,
          by: typeof window !== 'undefined' ? localStorage.getItem('whoami:author') ?? undefined : undefined,
        }),
      });
      if (!res.ok) {
        const respBody = await res.json().catch(() => null);
        setError(typeof respBody?.error === 'string' ? respBody.error : `request failed (${res.status})`);
        return;
      }
      onSaved();
    });
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  };

  return (
    <div className="flex flex-col gap-2 not-prose">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKey}
        rows={3}
        autoFocus
        disabled={isPending}
        className="min-h-16 text-sm"
      />
      <div className="flex items-center justify-between gap-3">
        <span className={error ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
          {error ?? t('help')}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={isPending}>{t('cancel')}</Button>
          <Button size="sm" onClick={submit} disabled={isPending}>{isPending ? t('saving') : t('save')}</Button>
        </div>
      </div>
    </div>
  );
}
