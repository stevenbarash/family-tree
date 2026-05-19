import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
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
        <bdi>{person.name}</bdi>
      </Link>
    );
  }
  return <span className="font-medium text-foreground"><bdi>{person.name}</bdi></span>;
}

function EventLine({ event, t }: { event: TodayEventView; t: ReturnType<typeof useTranslations> }) {
  if (event.type === 'birth') {
    return <li><span className="font-mono text-muted-foreground tabular-nums">{event.year}</span> — <PersonLink person={event.primary} /> {t('event', { kind: 'birth' })}</li>;
  }
  if (event.type === 'death') {
    return <li><span className="font-mono text-muted-foreground tabular-nums">{event.year}</span> — <PersonLink person={event.primary} /> {t('event', { kind: 'death' })}</li>;
  }
  // Marriage
  return (
    <li>
      <span className="font-mono text-muted-foreground tabular-nums">{event.year}</span>
      {' — '}
      <PersonLink person={event.primary} />
      {event.secondary ? <> {t('marriedWithSecondary')} <PersonLink person={event.secondary} /></> : <> {t('event', { kind: 'marriage' })}</>}
    </li>
  );
}

/**
 * Almanac strip rendered under the home-page header. Shows what happened on
 * today's calendar date across the family tree, sorted oldest-first. Renders
 * nothing when `events` is empty.
 */
export function OnThisDayRibbon({ events, dayLabel }: Props) {
  const t = useTranslations('Directives.onThisDay');
  if (events.length === 0) return null;
  return (
    <section className="mb-10 border-s-2 border-muted-foreground/30 ps-4">
      <h2 className="font-display text-xs uppercase tracking-[0.32em] text-muted-foreground">
        {t('heading', { dayLabel })}
      </h2>
      <ul className="mt-3 space-y-1 text-sm leading-7 text-foreground/90">
        {events.map((e, i) => <EventLine key={i} event={e} t={t} />)}
      </ul>
    </section>
  );
}
