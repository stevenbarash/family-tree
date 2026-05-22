'use client';

import dynamic from 'next/dynamic';

/**
 * Client-only wrapper for the research-note form. The real implementation
 * (`AddNoteFormClient`) hydrates the `author` input from `localStorage`
 * synchronously in `useState`'s lazy initializer — the React-blessed
 * alternative to the `setState`-in-effect anti-pattern. That initializer
 * can only run on the client (no `localStorage` during SSR), so
 * `ssr: false` makes the server emit a small placeholder and the client
 * lazy-loads the real form with the persisted value already in place.
 *
 * `ssr: false` requires this wrapper itself to be a Client Component
 * (Next constraint).
 */
export const AddNoteForm = dynamic(
  () => import('./add-note-form-client').then((m) => m.AddNoteFormClient),
  {
    ssr: false,
    loading: () => <div className="h-32 not-prose" aria-hidden />,
  },
);
