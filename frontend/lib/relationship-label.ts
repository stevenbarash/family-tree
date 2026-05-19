import type { useTranslations } from 'next-intl';
import type { RelationshipKind } from '@core/family/relationship.ts';

type LabelT = ReturnType<typeof useTranslations<'Page.Article.Relationship.label'>>;

/**
 * Grammatical gender of the relationship target, used by the `yours`
 * message template to pick the right possessive pronoun in languages
 * that mark gender on possessives (Russian "Ваш" vs "Ваша", etc.).
 *
 * We only know the target's gender for ancestors (from the GEDCOM role).
 * Everything else defaults to `other` — the message catalog falls back
 * to a gender-neutral form for those cases.
 */
export function relationshipGender(kind: RelationshipKind): 'male' | 'female' | 'other' {
  if (kind.kind === 'ancestor') {
    if (kind.role === 'father') return 'male';
    if (kind.role === 'mother') return 'female';
  }
  return 'other';
}

/**
 * Render a `RelationshipKind` as a localized kinship term. The caller passes
 * a translator scoped to `Page.Article.Relationship.label` — e.g.
 * `const t = useTranslations('Page.Article.Relationship.label')`.
 *
 * Output is the kinship term only (e.g. "great-grandmother",
 * "second cousin once removed"), not the full "Your X." sentence — for
 * that, the article-page caller wraps with the `yours` key:
 *
 *     t('yours', { label: localizedRelationshipLabel(kind, t) })
 *
 * For degrees 1–3 we use discrete keys per locale (parent / grandparent /
 * great-grandparent) since the patterns differ structurally across
 * languages — e.g. Russian uses "пра-" prefix per generation rather than
 * the English "great-" word. Degree 4+ falls back to a counted form.
 */
export function localizedRelationshipLabel(kind: RelationshipKind, t: LabelT): string {
  switch (kind.kind) {
    case 'self':
      return t('self');
    case 'sibling':
      return t('sibling');
    case 'ancestor': {
      const { degree, role } = kind;
      if (degree === 1) return t('ancestor1', { role });
      if (degree === 2) return t('ancestor2', { role });
      if (degree === 3) return t('ancestor3', { role });
      return t('ancestorN', { greats: String(degree - 2), role });
    }
    case 'descendant': {
      const { degree } = kind;
      if (degree === 1) return t('descendant1');
      if (degree === 2) return t('descendant2');
      if (degree === 3) return t('descendant3');
      return t('descendantN', { greats: String(degree - 2) });
    }
    case 'auntUncle': {
      const { degree } = kind;
      if (degree === 2) return t('auntUncle2');
      if (degree === 3) return t('auntUncle3');
      return t('auntUncleN', { greats: String(degree - 2) });
    }
    case 'nieceNephew': {
      const { degree } = kind;
      if (degree === 2) return t('nieceNephew2');
      if (degree === 3) return t('nieceNephew3');
      return t('nieceNephewN', { greats: String(degree - 2) });
    }
    case 'cousin': {
      const { degree, removed } = kind;
      if (removed === 0) return t('cousin', { degree });
      return t('cousinRemoved', { degree, removed });
    }
  }
}
