'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  slug: string;
}

export function AddNoteForm({ slug }: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startTransition] = useTransition();
  const router = useRouter();

  const submit = () => {
    const note = text.trim();
    if (!note) {
      setError('write something first');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/notes/${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note }),
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
