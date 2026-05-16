import type { RelationshipFromSelf } from '@/lib/relationship-from-self';

interface Props {
  relationship: RelationshipFromSelf;
}

/**
 * One-line "Your <relation>" subtitle rendered between the H1 and the
 * categories row on a person page. Italic, body-size, muted-foreground —
 * orienting but not loud. v1 renders the label only; a follow-up will
 * add a hoverable trail of avatar crumbs from self → target.
 */
export function RelationshipStrip({ relationship }: Props) {
  return (
    <p className="mt-3 text-base italic text-muted-foreground/90">
      Your {relationship.label}.
    </p>
  );
}
