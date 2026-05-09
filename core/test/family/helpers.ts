import type { DerivedRecord } from '../../src/gedcom/types.ts';

/** Build a minimal `DerivedRecord` for tests. Override any field via `patch`. */
export function person(record: string, name: string, patch: Partial<DerivedRecord> = {}): DerivedRecord {
  return {
    record,
    name,
    birth: null,
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
    privacy: { restricted: false, reason: 'none' },
    ...patch,
  };
}
