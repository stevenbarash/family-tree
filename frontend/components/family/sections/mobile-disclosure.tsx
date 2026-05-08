'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface Props {
  storageKey: string;
  children: ReactNode;
}

export function MobileDisclosure({ storageKey, children }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(`whoami:disclosure:${storageKey}`) === '1') {
        setOpen(true);
      }
    } catch {}
  }, [storageKey]);

  const toggle = () => {
    setOpen(prev => {
      const next = !prev;
      try {
        if (next) localStorage.setItem(`whoami:disclosure:${storageKey}`, '1');
        else localStorage.removeItem(`whoami:disclosure:${storageKey}`);
      } catch {}
      return next;
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="-mt-1 mb-2 flex w-full items-center justify-between font-display text-[0.62rem] uppercase tracking-[0.18em] text-muted-foreground/70 sm:hidden"
      >
        <span>{open ? 'Hide' : 'Show'}</span>
        <ChevronDown
          className={`size-3 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      <div className={open ? '' : 'hidden sm:block'}>{children}</div>
    </>
  );
}
