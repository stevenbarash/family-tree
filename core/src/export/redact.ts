import type { DerivedRecord } from '../gedcom/types.ts';

/**
 * Reduce a `DerivedRecord` to the bare minimum a stranger could see without
 * learning anything sensitive about a living person:
 *
 *   - name → initials (`Steven Barash` → `S. B.`)
 *   - birth → year only (`28 Feb 1998` → `1998`); place dropped
 *   - death → dropped (restricted records are presumed-living per the heuristic)
 *   - parents / spouses / children / families / residences / occupations /
 *     sources / media → all dropped (each is a relational leak)
 *   - record id and `privacy` payload preserved so cross-references and
 *     downstream filters still know "this slot is restricted" without
 *     learning who fills it.
 *
 * Lossy by design: an exported redacted record cannot be un-redacted. The
 * caller decides which records to redact (typically `privacy.restricted`).
 */
export function redactRecord(rec: DerivedRecord): DerivedRecord {
  return {
    record: rec.record,
    name: toInitials(rec.name),
    birth: yearOnlyEvent(rec.birth?.date),
    death: null,
    parents: [],
    spouses: [],
    children: [],
    familyOfOrigin: [],
    marriages: [],
    residences: [],
    occupations: [],
    sources: [],
    media: [],
    privacy: rec.privacy,
  };
}

function toInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  return parts.map(p => p[0]!.toUpperCase() + '.').join(' ');
}

function yearOnlyEvent(date: string | null | undefined): { date: string; place: null } | null {
  if (!date) return null;
  const m = date.match(/\d{4}/);
  if (!m) return null;
  return { date: m[0], place: null };
}
