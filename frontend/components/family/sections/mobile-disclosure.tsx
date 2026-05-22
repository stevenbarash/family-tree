'use client';

import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface Props {
  storageKey: string;
  showLabel: string;
  hideLabel: string;
  children: ReactNode;
}

const SAME_TAB_EVENT = 'whoami:disclosure-change';

function keyFor(storageKey: string): string {
  return `whoami:disclosure:${storageKey}`;
}

/**
 * Subscribe to changes for any disclosure key. Cross-tab updates arrive
 * via the native `storage` event; same-tab `toggle` calls dispatch our
 * custom event below (the `storage` event does not fire in the tab that
 * wrote the value). One subscriber per disclosure instance is fine —
 * the cost is negligible and the event channels are app-global.
 */
function subscribe(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  window.addEventListener(SAME_TAB_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(SAME_TAB_EVENT, callback);
  };
}

export function MobileDisclosure({ storageKey, showLabel, hideLabel, children }: Props) {
  // External state lives in localStorage. Reading via useSyncExternalStore
  // is the React-blessed alternative to a useEffect that calls setState —
  // hydration is correct (server snapshot is `false`, replaced post-mount
  // with the persisted value) without a setState-in-effect.
  const open = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(keyFor(storageKey)) === '1';
      } catch {
        return false;
      }
    },
    () => false,
  );

  const toggle = () => {
    const next = !open;
    try {
      if (next) localStorage.setItem(keyFor(storageKey), '1');
      else localStorage.removeItem(keyFor(storageKey));
      // Same-tab change: native `storage` only fires cross-tab, so kick
      // our own event for any disclosure subscribers in this tab.
      window.dispatchEvent(new Event(SAME_TAB_EVENT));
    } catch {}
  };

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="-mt-1 mb-2 flex w-full items-center justify-between font-display text-[0.62rem] uppercase tracking-[0.18em] text-muted-foreground/70 sm:hidden"
      >
        <span>{open ? hideLabel : showLabel}</span>
        <ChevronDown
          className={`size-3 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      <div className={open ? '' : 'hidden sm:block'}>{children}</div>
    </>
  );
}
