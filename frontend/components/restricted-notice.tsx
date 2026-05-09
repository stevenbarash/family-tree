import type { Page } from '@core/pages/types.ts';
import type { DerivedRecord } from '@core/gedcom/types.ts';
import { redactRecord } from '@core/export/redact.ts';

interface Props {
  page: Page;
  derived: DerivedRecord;
}

/**
 * Render in place of a person page's body and infobox when the joined
 * derived record is flagged restricted by the privacy gate. Shows the
 * redacted minimum (initials + birth year) so a reader who already
 * knows the URL learns nothing more than the URL itself implies.
 *
 * The page title still renders — it's part of the URL slug, so hiding
 * it would only confuse readers without adding privacy.
 */
export function RestrictedNotice({ page, derived }: Props) {
  const reduced = redactRecord(derived);
  const reasonLabel =
    derived.privacy.reason === 'living-heuristic'
      ? 'a living-person heuristic (no death record on file, recent enough birth)'
      : derived.privacy.reason.startsWith('gedcom-resn-')
        ? `a GEDCOM RESN ${derived.privacy.reason.replace('gedcom-resn-', '')} tag`
        : derived.privacy.reason;

  return (
    <section
      aria-labelledby="restricted-heading"
      className="mt-8 rounded-lg border border-dashed border-border bg-muted/30 p-6"
    >
      <h2
        id="restricted-heading"
        className="font-heading text-lg font-semibold text-foreground"
      >
        Restricted record
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        This page&rsquo;s content is hidden because the person it describes
        was flagged by the privacy gate. The reason: {reasonLabel}.
      </p>
      <dl className="mt-5 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 font-mono text-[0.78rem]">
        <dt className="text-muted-foreground">initials</dt>
        <dd className="text-foreground">{reduced.name || '—'}</dd>
        <dt className="text-muted-foreground">birth year</dt>
        <dd className="text-foreground">{reduced.birth?.date ?? '—'}</dd>
      </dl>
      <p className="mt-5 text-xs text-muted-foreground">
        To unlock: add a death record to the GEDCOM, or remove the{' '}
        <code className="rounded bg-muted px-1 text-[0.7rem]">RESN</code>{' '}
        tag from this individual and re-run{' '}
        <code className="rounded bg-muted px-1 text-[0.7rem]">wai sync-gedcom --force</code>.
      </p>
    </section>
  );
}
