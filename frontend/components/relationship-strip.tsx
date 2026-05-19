import { useTranslations } from 'next-intl';
import type { RelationshipFromSelf } from '@/lib/relationship-from-self';
import { localizedRelationshipLabel, relationshipGender } from '@/lib/relationship-label';

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
 * The kinship term is now locale-aware via `RelationshipKind` from core;
 * the chrome ("Your X.") wraps it via the `yours` ICU template.
 */
export function RelationshipStrip({ relationship }: Props) {
  const t = useTranslations('Page.Article.Relationship');
  const tLabel = useTranslations('Page.Article.Relationship.label');
  const label = localizedRelationshipLabel(relationship.kind, tLabel);
  const gender = relationshipGender(relationship.kind);
  return (
    <p className="mt-3 text-base font-medium text-foreground/90">
      {t('yours', { label, gender })}
    </p>
  );
}
