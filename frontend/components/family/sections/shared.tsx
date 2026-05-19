import type { ReactNode } from 'react';
import type { BrowserPersonView, BrowserRelationView } from '@/lib/family';

export function familyTreeHref(person: string): string {
  return `/family/tree?person=${encodeURIComponent(person)}`;
}

export function formatDates(person: BrowserPersonView): string | null {
  const birth = person.birth?.date ?? null;
  const death = person.death?.date ?? null;
  if (birth && death) return `${birth} – ${death}`;
  if (birth) return `b. ${birth}`;
  if (death) return `d. ${death}`;
  return null;
}

export function formatTileMeta(person: BrowserPersonView): string | null {
  const dates = formatDates(person);
  const place = person.birth?.place ?? null;
  return [dates, place].filter(Boolean).join('  ·  ') || null;
}

export function relationMeta(relation: BrowserRelationView): string | null {
  return relation.detail || null;
}

/** Join non-empty metadata fragments with the project's mid-dot separator
 *  (` · `). Falsy parts (`null`, `undefined`, empty string) are dropped, so
 *  callers can pass conditional values directly without extra branching. */
export function joinMeta(parts: Array<string | null | undefined | false>): string {
  return parts.filter((p): p is string => Boolean(p)).join(' · ');
}

export function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div>
      <dt className="font-display text-[0.62rem] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 flex items-baseline gap-1.5">
        <span className="font-display text-2xl font-medium tabular-nums leading-none text-foreground">
          {value}
        </span>
        {sub ? (
          <span className="font-mono text-[0.6rem] tracking-tight text-muted-foreground">
            {sub}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

export function SectionHeader({
  title,
  count,
  after,
}: {
  title: string;
  count?: number;
  after?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 border-b rule-hair pb-2">
      <h2 className="flex items-baseline gap-2.5">
        <span className="font-display text-xs uppercase tracking-[0.32em] text-muted-foreground">
          {title}
        </span>
        {typeof count === 'number' ? (
          <span className="font-mono text-[0.7rem] tabular-nums text-muted-foreground/70">
            {String(count).padStart(2, '0')}
          </span>
        ) : null}
      </h2>
      {after}
    </div>
  );
}

export function RelationLabel({ children }: { children: string }) {
  return (
    <span className="font-display text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
      {children}
    </span>
  );
}

export function GenerationHeader({
  ordinal,
  heading,
  count,
}: {
  ordinal: string;
  heading: string;
  count?: ReactNode;
}) {
  return (
    <header className="flex items-baseline gap-3 px-3 py-1.5">
      <span className="font-display text-[0.7rem] font-medium tabular-nums tracking-tight text-muted-foreground/70">
        {ordinal}
      </span>
      <h4 className="flex-1 truncate font-display text-[0.78rem] uppercase tracking-[0.16em] text-muted-foreground">
        {heading}
      </h4>
      {count != null ? (
        <span className="font-mono text-[0.62rem] tabular-nums text-muted-foreground/70">
          {count}
        </span>
      ) : null}
    </header>
  );
}
