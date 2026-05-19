'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Defer cmdk + Dialog to first open. The palette ships in every page header
// but most navigations never open it; loading the heavy dialog body on demand
// keeps the global JS shell small.
const CommandPaletteDialog = dynamic(() => import('./command-palette-dialog'), {
  ssr: false,
});

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const t = useTranslations('Chrome.CommandPalette');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(o => !o);
        setHasOpened(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => { setOpen(true); setHasOpened(true); }}
        className="gap-2"
        aria-label={t('openSearch')}
      >
        <Search data-icon="inline-start" />
        <span className="hidden sm:inline">{t('searchButton')}</span>
        <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 font-mono text-[0.65rem] text-muted-foreground sm:inline">
          ⌘K
        </kbd>
      </Button>
      {hasOpened ? (
        <CommandPaletteDialog open={open} onOpenChange={setOpen} />
      ) : null}
    </>
  );
}
