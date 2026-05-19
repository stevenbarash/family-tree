'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const AUTHOR_KEY = 'whoami:author';

interface Props {
  slug: string;
}

export function AddNoteForm({ slug }: Props) {
  const t = useTranslations('Page.Article.ResearchNotes.Add');
  const tErr = useTranslations('Errors');
  const [text, setText] = useState('');
  // The input is server-rendered as empty (no `window` on the server) and
  // hydrated from localStorage post-mount. Hydrating in `useState` directly
  // would mismatch SSR markup and React would warn.
  const [author, setAuthor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setAuthor(localStorage.getItem(AUTHOR_KEY) ?? '');
  }, []);

  // Persist on blur rather than every keystroke — avoids a localStorage write
  // per character when typing a name.
  const onAuthorBlur = () => {
    if (typeof window === 'undefined') return;
    if (author) localStorage.setItem(AUTHOR_KEY, author);
    else localStorage.removeItem(AUTHOR_KEY);
  };

  const submit = () => {
    const note = text.trim();
    if (!note) {
      setError(t('emptyError'));
      return;
    }
    setError(null);
    const trimmedAuthor = author.trim();
    const validAuthor = trimmedAuthor && /^[A-Za-z0-9._-]+$/.test(trimmedAuthor);
    if (trimmedAuthor && !validAuthor) {
      setError(t('authorError'));
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/notes/${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          note,
          ...(validAuthor ? { by: trimmedAuthor } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const errorMessage = typeof body?.error === 'string' ? body.error : tErr('requestFailedWithStatus', { status: String(res.status) });
        setError(errorMessage);
        return;
      }
      setText('');
      router.refresh();
    });
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex flex-col gap-2 not-prose">
      <input
        type="text"
        value={author}
        onChange={(e) => setAuthor(e.target.value)}
        onBlur={onAuthorBlur}
        placeholder={t('authorPlaceholder')}
        className="h-8 rounded-md border bg-transparent px-2 text-xs"
        disabled={isSubmitting}
        aria-label={t('authorAria')}
      />
      <Textarea
        placeholder={t('bodyPlaceholder')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKey}
        rows={3}
        disabled={isSubmitting}
        className="min-h-20 text-sm"
      />
      <div className="flex items-center justify-between gap-3">
        <span className={error ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
          {error ?? t('filedHint', { slug })}
        </span>
        <Button onClick={submit} disabled={isSubmitting} size="sm">
          {isSubmitting ? t('saving') : t('submit')}
        </Button>
      </div>
    </div>
  );
}
