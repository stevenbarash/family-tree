import type { DerivedRecord } from './types.ts';

/**
 * Coerce a YAML-parsed object into a fully-populated `DerivedRecord`, filling
 * in any array-shaped fields that may be missing because the YAML on disk was
 * written by an older deriver. Returns `null` if the input is too malformed
 * to use (missing `record` or `name`).
 *
 * This is a defensive *normalizer*, not a *validator*: existing array entries
 * (`parents`, `marriages`, etc.) are presumed well-formed because our own
 * deriver wrote them. The normalizer only protects against the
 * "newer code reads older YAML" case where new array fields are absent —
 * accessing `.map()` on `undefined` would crash. Run `wai sync-gedcom --force`
 * to regenerate YAMLs against the current deriver and remove the need for
 * defaults.
 */
export function normalizeDerivedRecord(raw: unknown): DerivedRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.record !== 'string' || !/^I\d+$/.test(r.record)) return null;
  if (typeof r.name !== 'string') return null;

  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

  return {
    record: r.record,
    name: r.name,
    sex: (r.sex === 'M' || r.sex === 'F' || r.sex === 'U') ? r.sex : 'U',
    birth: (r.birth as DerivedRecord['birth']) ?? null,
    death: (r.death as DerivedRecord['death']) ?? null,
    parents: arr(r.parents),
    spouses: arr(r.spouses),
    children: arr(r.children),
    familyOfOrigin: arr(r.familyOfOrigin),
    marriages: arr(r.marriages),
    residences: arr(r.residences),
    occupations: arr(r.occupations),
    sources: arr(r.sources),
    media: arr(r.media),
    privacy: (r.privacy as DerivedRecord['privacy']) ?? { restricted: false, reason: 'none' },
  };
}
