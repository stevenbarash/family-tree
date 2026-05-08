import Link from 'next/link';
import type { ReactElement } from 'react';
import type { Section, VersionStatus } from '@/lib/changelog';

type EntryKind = VersionStatus | 'group' | 'notes';

interface IndexEntry {
  id: string;
  label: string;
  subtitle: string | null;
  kind: EntryKind;
  depth: number;
}

const KIND_GLYPH: Record<EntryKind, string> = {
  unreleased: '○',
  'pre-release': '◐',
  released: '●',
  retired: '◌',
  group: '§',
  notes: '¶',
};

function flatten(sections: Section[]): IndexEntry[] {
  const out: IndexEntry[] = [];
  for (const s of sections) {
    if (s.kind === 'version') {
      out.push({ id: s.id, label: s.label, subtitle: s.subtitle, kind: s.status, depth: 0 });
    } else if (s.kind === 'group') {
      out.push({ id: s.id, label: s.title, subtitle: null, kind: 'group', depth: 0 });
      for (const v of s.versions) {
        out.push({ id: v.id, label: v.label, subtitle: v.subtitle, kind: v.status, depth: 1 });
      }
    } else {
      out.push({ id: s.id, label: s.title, subtitle: null, kind: 'notes', depth: 0 });
    }
  }
  return out;
}

interface VersionIndexProps {
  sections: Section[];
  className?: string;
}

export function VersionIndex({ sections, className = '' }: VersionIndexProps): ReactElement {
  const entries = flatten(sections);
  return (
    <nav aria-label="Revisions" className={className}>
      <p className="mb-4 font-mono text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
        On this page
      </p>
      <ol className="flex flex-col gap-1.5 border-l border-foreground/12 pl-4 text-sm">
        {entries.map(e => (
          <li key={e.id} className={e.depth > 0 ? 'pl-3' : ''}>
            <Link
              href={`#${e.id}`}
              className="group inline-flex items-baseline gap-2 leading-snug"
            >
              <span
                aria-hidden
                className="font-mono text-[0.7rem] text-muted-foreground/70 group-hover:text-foreground"
              >
                {KIND_GLYPH[e.kind]}
              </span>
              <span className="font-medium text-foreground/85 underline-offset-4 group-hover:text-foreground group-hover:underline">
                {e.label}
              </span>
              {e.subtitle ? (
                <span className="ml-1 hidden font-mono text-[0.65rem] uppercase tracking-[0.08em] text-muted-foreground/60 xl:inline">
                  {e.subtitle.length > 22 ? `${e.subtitle.slice(0, 20)}…` : e.subtitle}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ol>
      <details className="mt-6 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-mono uppercase tracking-[0.18em] text-muted-foreground/70 hover:text-foreground">
          Legend
        </summary>
        <dl className="mt-3 grid grid-cols-[1.25rem_1fr] gap-x-3 gap-y-1.5 font-mono text-[0.7rem] uppercase tracking-[0.08em]">
          <dt aria-hidden>○</dt><dd>Unreleased</dd>
          <dt aria-hidden>◐</dt><dd>Pre-release</dd>
          <dt aria-hidden>●</dt><dd>Released</dd>
          <dt aria-hidden>◌</dt><dd>Retired</dd>
          <dt aria-hidden>§</dt><dd>Anthology</dd>
          <dt aria-hidden>¶</dt><dd>Notes</dd>
        </dl>
      </details>
    </nav>
  );
}
