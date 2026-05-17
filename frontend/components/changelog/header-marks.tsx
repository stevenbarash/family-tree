import type { ReactElement } from 'react';
import type { VersionStatus } from '@/lib/changelog';

interface NumberMarkProps {
  n: number | null;
}

export function NumberMark({ n }: NumberMarkProps): ReactElement | null {
  if (n == null) return null;
  return (
    <p
      aria-hidden
      className="absolute -top-1 end-0 select-none font-display text-[5rem] font-light leading-none text-foreground/[0.04] sm:text-[7rem]"
    >
      §{n}
    </p>
  );
}

const STATUS_LABEL: Record<VersionStatus, string> = {
  unreleased: 'Unreleased',
  'pre-release': 'Pre-release',
  released: 'Released',
  retired: 'Retired',
};

const STATUS_TONE: Record<VersionStatus, string> = {
  unreleased: 'border-foreground/35 text-foreground bg-foreground/5',
  'pre-release': 'border-infobox-accent/40 text-infobox-accent bg-infobox-accent/10',
  released: 'border-border text-muted-foreground bg-muted/40',
  retired: 'border-border/60 text-muted-foreground/70 bg-transparent',
};

interface StatusPillProps {
  status: VersionStatus;
}

export function StatusPill({ status }: StatusPillProps): ReactElement {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.18em] ${STATUS_TONE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
