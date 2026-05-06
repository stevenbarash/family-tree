'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const AUTHOR_KEY = 'whoami:author';

interface Props {
  slug: string;
}

export function AddNoteForm({ slug }: Props) {
  const [text, setText] = useState('');
  const [author, setAuthor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startTransition] = useTransition();
  const router = useRouter();

  // Hydrate author from localStorage on mount; persist on change.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(AUTHOR_KEY) ?? '';
    setAuthor(stored);
  }, []);

  const onAuthorChange = (v: string) => {
    setAuthor(v);
    if (typeof window !== 'undefined') {
      if (v) localStorage.setItem(AUTHOR_KEY, v);
      else localStorage.removeItem(AUTHOR_KEY);
    }
  };

  const submit = () => {
    const note = text.trim();
    if (!note) {
      setError('write something first');
      return;
    }
    setError(null);
    const trimmedAuthor = author.trim();
    const validAuthor = trimmedAuthor && /^[A-Za-z0-9._-]+$/.test(trimmedAuthor);
    if (trimmedAuthor && !validAuthor) {
      setError('your name: letters, numbers, dot, dash, underscore only');
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
        const errorMessage = typeof body?.error === 'string' ? body.error : `request failed (${res.status})`;
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
        onChange={(e) => onAuthorChange(e.target.value)}
        placeholder="Your name (optional, remembered)"
        className="h-8 rounded-md border bg-transparent px-2 text-xs"
        disabled={isSubmitting}
        aria-label="Your name"
      />
      <Textarea
        placeholder="What did you learn? (Cmd/Ctrl+Enter to save)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKey}
        rows={3}
        disabled={isSubmitting}
        className="min-h-20 text-sm"
      />
      <div className="flex items-center justify-between gap-3">
        <span className={error ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
          {error ?? `Will be filed under today's date in ${slug}.talk`}
        </span>
        <Button onClick={submit} disabled={isSubmitting} size="sm">
          {isSubmitting ? 'Saving…' : 'Add note'}
        </Button>
      </div>
    </div>
  );
}
