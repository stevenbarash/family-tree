import type { DerivedRecord } from './types.ts';

/**
 * Normalize a raw YAML-parsed object into a DerivedRecord, filling missing
 * array fields defensively. Returns null if the value is missing the required
 * `record` or `name` fields.
 */
export function normalizeDerivedRecord(raw: unknown): DerivedRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['record'] !== 'string' || !r['record']) return null;
  if (typeof r['name'] !== 'string' || !r['name']) return null;

  return {
    record: r['record'] as string,
    name: r['name'] as string,
    birth: (r['birth'] as DerivedRecord['birth']) ?? null,
    death: (r['death'] as DerivedRecord['death']) ?? null,
    parents: Array.isArray(r['parents']) ? (r['parents'] as DerivedRecord['parents']) : [],
    spouses: Array.isArray(r['spouses']) ? (r['spouses'] as DerivedRecord['spouses']) : [],
    children: Array.isArray(r['children']) ? (r['children'] as DerivedRecord['children']) : [],
    residences: Array.isArray(r['residences']) ? (r['residences'] as DerivedRecord['residences']) : [],
    occupations: Array.isArray(r['occupations']) ? (r['occupations'] as DerivedRecord['occupations']) : [],
    sources: Array.isArray(r['sources']) ? (r['sources'] as DerivedRecord['sources']) : [],
  };
}
