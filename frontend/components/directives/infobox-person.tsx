import Link from 'next/link';
import type { ReactNode } from 'react';
import { Calendar, Users, Heart, Baby, Home, Briefcase } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { DerivedRecord } from '@core/gedcom/types.ts';
import { parseGedcomYear } from '@core/family/dates.ts';
import { normalizeDate } from '@core/format/dates.ts';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { toSlug } from '@/lib/slug';
import { initials } from '@/lib/initials';
import {
  Infobox,
  InfoboxBody,
  InfoboxHeader,
  InfoboxRow,
  extractFieldsFromChildren,
} from './infobox-shell';

interface Props {
  derived?: DerivedRecord | null;
  children?: ReactNode;
}

export function InfoboxPerson({ derived, children }: Props) {
  const t = useTranslations('Directives.infoboxPerson');
  const fields = derived ? null : extractFieldsFromChildren(children);
  const name = derived?.name ?? fields?.name ?? 'Person';
  const lifespan = derived ? formatLifespan(derived, t) : null;

  return (
    <Infobox>
      <InfoboxHeader
        eyebrow={t('eyebrow')}
        title={name}
        description={lifespan}
        avatar={
          <Avatar size="lg" className="ring-2 ring-infobox-border/60">
            <AvatarFallback className="bg-infobox-border/30 font-heading text-sm text-infobox-foreground">
              {initials(name)}
            </AvatarFallback>
          </Avatar>
        }
      />
      <InfoboxBody>
        {derived ? renderDerivedRows(derived, t) : renderFallbackRows(fields ?? {})}
      </InfoboxBody>
    </Infobox>
  );
}

function renderDerivedRows(d: DerivedRecord, t: ReturnType<typeof useTranslations>): ReactNode[] {
  const rows: ReactNode[] = [];

  if (d.birth) {
    rows.push(
      <InfoboxRow key="born" label={t('born')} icon={Calendar}>
        {formatPlaceDate(d.birth.date, d.birth.place)}
      </InfoboxRow>,
    );
  }
  if (d.death) {
    rows.push(
      <InfoboxRow key="died" label={t('died')} icon={Calendar}>
        {formatPlaceDate(d.death.date, d.death.place)}
      </InfoboxRow>,
    );
  }
  if (d.parents.length > 0) {
    rows.push(
      <InfoboxRow key="parents" label={t('parents')} icon={Users}>
        <PersonList items={d.parents} />
      </InfoboxRow>,
    );
  }
  if (d.spouses.length > 0) {
    rows.push(
      <InfoboxRow key="spouses" label={t('spouses')} icon={Heart}>
        <PersonList items={d.spouses} />
      </InfoboxRow>,
    );
  }
  if (d.children.length > 0) {
    rows.push(
      <InfoboxRow key="children" label={t('children')} icon={Baby}>
        <PersonList items={d.children} />
      </InfoboxRow>,
    );
  }
  if (d.residences.length > 0) {
    rows.push(
      <InfoboxRow key="residences" label={t('residences')} icon={Home}>
        <ul className="flex flex-col gap-0.5 list-none p-0">
          {d.residences.map((r, i) => (
            <li key={i}>{formatPlaceDate(r.date, r.place)}</li>
          ))}
        </ul>
      </InfoboxRow>,
    );
  }
  if (d.occupations.length > 0) {
    rows.push(
      <InfoboxRow key="occupations" label={t('work')} icon={Briefcase}>
        <div className="flex flex-wrap gap-1.5">
          {d.occupations.map((o, i) => (
            <Badge
              key={i}
              variant="outline"
              className="border-infobox-border/70 bg-infobox-border/15 text-[0.7rem] text-infobox-foreground"
            >
              {o.title}
              {o.date ? (
                <span className="text-infobox-muted">
                  · <DateText date={o.date} />
                </span>
              ) : null}
            </Badge>
          ))}
        </div>
      </InfoboxRow>,
    );
  }

  return rows;
}

function renderFallbackRows(fields: Record<string, string>): ReactNode[] {
  return Object.entries(fields)
    .filter(([k]) => k !== 'name')
    .map(([k, v]) => (
      <InfoboxRow key={k} label={k}>
        {v}
      </InfoboxRow>
    ));
}

function PersonList({ items }: { items: { record: string; name: string }[] }) {
  return (
    <span>
      {items.map((p, i) => (
        <span key={p.record}>
          {i > 0 ? <span className="text-infobox-muted">, </span> : null}
          <Link
            href={`/${toSlug(p.name)}`}
            className="font-medium text-infobox-accent decoration-infobox-accent/40 underline-offset-4 transition-colors hover:underline"
          >
            {p.name}
          </Link>
        </span>
      ))}
    </span>
  );
}

function formatLifespan(d: DerivedRecord, t: ReturnType<typeof useTranslations>): string | null {
  const b = parseGedcomYear(d.birth?.date);
  const dy = parseGedcomYear(d.death?.date);
  if (b && dy) return t('lifespanBornDied', { birth: labelYear(b), death: dy.year });
  if (b) return t('lifespanBornOnly', { year: labelYear(b) });
  if (dy) return t('lifespanDiedOnly', { year: dy.year });
  return null;
}

function labelYear(p: { year: number; qualifier?: 'about' | 'before' | 'after' | 'range' }): string {
  if (p.qualifier === 'about' || p.qualifier === 'range') return `c. ${p.year}`;
  if (p.qualifier === 'before') return `<${p.year}`;
  if (p.qualifier === 'after') return `>${p.year}`;
  return String(p.year);
}

function formatPlaceDate(date: string | null | undefined, place: string | null | undefined): ReactNode {
  if (!date && !place) return '—';
  if (!date) return place;
  if (!place) return <DateText date={date} />;
  return (
    <>
      <DateText date={date} /> · {place}
    </>
  );
}

function DateText({ date }: { date: string }): ReactNode {
  if (normalizeDate(date).ambiguous) {
    return (
      <>
        {date}
        <span
          className="ml-1 cursor-help text-infobox-muted"
          title="Date format ambiguous (m/d/y vs d/m/y) — original record needs disambiguation"
          aria-label="ambiguous date"
        >
          ?
        </span>
      </>
    );
  }
  return <>{date}</>;
}

