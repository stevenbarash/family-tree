import { useTranslations } from 'next-intl';
import type { RelationshipFromSelf } from '@/lib/relationship-from-self';

interface Props {
  relationship: RelationshipFromSelf;
}

/**
 * One-line "Your <relation>" subtitle rendered between the H1 and the
 * categories row on a person page. Body-size, foreground/90 — bolder
 * than the muted chrome around it so the relationship-to-self doesn't
 * recede behind the categories. v1 renders the label only; a follow-up
 * will add a hoverable trail of avatar crumbs from self → target.
 *
 * The relationship label itself ("second cousin once removed") still
 * comes from `computeRelationship` in English; localizing the label is
 * a separate workstream that needs translation maps in `core/family/`.
 */
export function RelationshipStrip({ relationship }: Props) {
  const t = useTranslations('Page.Article.Relationship');
  return (
    <p className="mt-3 text-base font-medium text-foreground/90">
      {t('yours', { label: relationship.label })}
    </p>
  );
}
