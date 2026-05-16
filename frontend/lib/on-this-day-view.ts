import { findOnThisDay, type TodayEvent, type TodayEventPerson } from '@core/family/on-this-day.ts';
import { getCachedDerivedRecords } from './family';
import type { PageMetaSummary } from '@core/pages/index.ts';

export interface TodayEventViewPerson extends TodayEventPerson {
  slug?: string;
}

export interface TodayEventView {
  type: TodayEvent['type'];
  year: number;
  primary: TodayEventViewPerson;
  secondary?: TodayEventViewPerson;
}

/**
 * Compute events on the given calendar day and join each event subject to a
 * wiki slug, if a page exists for that GEDCOM record. Names without a slug
 * still render — they just don't become links.
 */
export function getEventsForToday(
  list: ReadonlyArray<PageMetaSummary>,
  now: Date,
): TodayEventView[] {
  // The server uses UTC; "today" in display means UTC today. For a
  // personal Tailscale-fronted wiki this is fine — single user, same TZ
  // as the server.
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  const events = findOnThisDay(getCachedDerivedRecords(), { month, day }, { now });
  if (events.length === 0) return [];

  const recordToSlug = new Map<string, string>();
  for (const p of list) {
    if (p.gedcomRecord && !p.isTalk && !p.isArchived) {
      recordToSlug.set(p.gedcomRecord, p.slug);
    }
  }
  const decorate = (p: TodayEventPerson): TodayEventViewPerson => ({
    ...p,
    slug: recordToSlug.get(p.record),
  });
  return events.map(e => ({
    type: e.type,
    year: e.year,
    primary: decorate(e.primary),
    ...(e.secondary ? { secondary: decorate(e.secondary) } : {}),
  }));
}
