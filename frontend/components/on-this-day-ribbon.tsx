import Link from 'next/link';
import type { TodayEventView, TodayEventViewPerson } from '@/lib/on-this-day-view';

interface Props {
  events: ReadonlyArray<TodayEventView>;
  /** The calendar day this ribbon represents, e.g. "May 16". */
  dayLabel: string;
}

function PersonLink({ person }: { person: TodayEventViewPerson }) {
  if (person.slug) {
    return (
      <Link
        href={`/${person.slug}`}
        className="font-medium text-foreground underline-offset-4 hover:underline"
      >
        {person.name}
      </Link>
    );
  }
  return <span className="font-medium text-foreground">{person.name}</span>;
}

function EventLine({ event }: { event: TodayEventView }) {
  if (event.type === 'birth') {
    return <li><span className="font-mono text-muted-foreground tabular-nums">{event.year}</span> — <PersonLink person={event.primary} /> was born</li>;
  }
  if (event.type === 'death') {
    return <li><span className="font-mono text-muted-foreground tabular-nums">{event.year}</span> — <PersonLink person={event.primary} /> died</li>;
  }
  // Marriage
  return (
    <li>
      <span className="font-mono text-muted-foreground tabular-nums">{event.year}</span>
      {' — '}
      <PersonLink person={event.primary} />
      {event.secondary ? <> married <PersonLink person={event.secondary} /></> : ' married'}
    </li>
  );
}

/**
 * Almanac strip rendered under the home-page header. Shows what happened on
 * today's calendar date across the family tree, sorted oldest-first. Renders
 * nothing when `events` is empty.
 */
export function OnThisDayRibbon({ events, dayLabel }: Props) {
  if (events.length === 0) return null;
  return (
    <section className="mb-10 border-l-2 border-muted-foreground/30 pl-4">
      <h2 className="font-display text-xs uppercase tracking-[0.32em] text-muted-foreground">
        On this day — {dayLabel}
      </h2>
      <ul className="mt-3 space-y-1 text-sm leading-7 text-foreground/90">
        {events.map((e, i) => <EventLine key={i} event={e} />)}
      </ul>
    </section>
  );
}
