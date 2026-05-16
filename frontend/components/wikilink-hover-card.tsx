'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { initials } from '@/lib/initials';
import type { HoverCardData } from '@/lib/page-card-data';

interface Props {
  slug: string;
  data: HoverCardData;
  /** The anchor's inner content (usually the resolved title text). */
  children: ReactNode;
  /** Pass-through className for the anchor. */
  className?: string;
}

const AVATAR_PX = 48;

/**
 * Inline link that pops a preview card on hover. Card content is fully
 * precomputed at SSR — no client-side fetch, no loading flicker. Base-ui's
 * PreviewCard primitive handles the hover delay (default ~200ms), viewport
 * positioning, focus, keyboard (Esc closes), and touch (no card on touch
 * devices).
 *
 * The 48px avatar is rendered inline (rather than via `AvatarMonogram`,
 * which only supports the 22/28px sizes used in family-tree lists) but
 * mirrors that component's shape: portrait → rounded `<img>`; fallback →
 * tinted initials disc.
 */
export function WikilinkHoverCard({ slug, data, children, className }: Props) {
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <Link href={`/${slug}`} className={className}>
            {children}
          </Link>
        }
      />
      <HoverCardContent>
        <div className="flex gap-3">
          <div className="shrink-0">
            {data.portrait ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.portrait}
                alt=""
                aria-hidden
                width={AVATAR_PX}
                height={AVATAR_PX}
                className="rounded-full object-cover ring-1 ring-foreground/10"
                style={{ width: AVATAR_PX, height: AVATAR_PX }}
              />
            ) : (
              <span
                aria-hidden
                className="inline-flex items-center justify-center rounded-full font-display font-medium tabular-nums text-background"
                style={{
                  width: AVATAR_PX,
                  height: AVATAR_PX,
                  backgroundColor: 'var(--muted-foreground)',
                  opacity: 0.85,
                  fontSize: '1rem',
                }}
              >
                {initials(data.title)}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-foreground">{data.title}</div>
            {data.born || data.died ? (
              <div className="font-mono text-xs tabular-nums text-muted-foreground">
                {data.born ?? '?'}–{data.died ?? ''}
              </div>
            ) : null}
            {data.lead ? (
              <p className="mt-1 line-clamp-3 text-xs leading-snug text-muted-foreground">
                {data.lead}
              </p>
            ) : null}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
