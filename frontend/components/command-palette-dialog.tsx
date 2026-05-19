'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

interface SearchHit {
  slug: string;
  title: string;
  type: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CommandPaletteDialog({ open, onOpenChange }: Props) {
  const router = useRouter();
  const t = useTranslations('Chrome.CommandPalette');
  const [q, setQ] = useState('');
  const [resultsFor, setResultsFor] = useState<{ q: string; hits: SearchHit[] }>({ q: '', hits: [] });
  const trimmed = q.trim();
  const displayResults = resultsFor.q === trimmed ? resultsFor.hits : [];

  useEffect(() => {
    if (!trimmed) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}&limit=10`, {
          signal: ctrl.signal,
        });
        const data = (await res.json()) as { results: SearchHit[] };
        setResultsFor({ q: trimmed, hits: data.results ?? [] });
      } catch {
        // ignore abort/network
      }
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [trimmed]);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setQ('');
      setResultsFor({ q: '', hits: [] });
    }
  }

  function go(slug: string) {
    handleOpenChange(false);
    router.push(`/${slug}`);
  }

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <Command shouldFilter={false}>
        <CommandInput
          placeholder={t('placeholder')}
          value={q}
          onValueChange={setQ}
        />
        <CommandList>
          {!trimmed ? (
            <CommandEmpty>{t('emptyStart')}</CommandEmpty>
          ) : displayResults.length === 0 ? (
            <CommandEmpty>{t('emptyNoMatches')}</CommandEmpty>
          ) : null}
          {displayResults.length > 0 ? (
            <CommandGroup heading={t('resultsHeading')}>
              {displayResults.map(r => (
                <CommandItem
                  key={r.slug}
                  value={`${r.title} ${r.slug}`}
                  onSelect={() => go(r.slug)}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{r.title}</span>
                    <span className="text-xs capitalize text-muted-foreground">{r.type}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
