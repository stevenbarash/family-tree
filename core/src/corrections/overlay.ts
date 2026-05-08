import type { DerivedRecord } from '../gedcom/types.ts';
import type { Correction } from '../pages/types.ts';

/**
 * Overlay a list of corrections onto a derived record, returning a new
 * record with the corrections applied. Pure — does not mutate the input.
 *
 * The caller is responsible for filtering corrections to those targeting
 * this record id; ALL corrections passed in are applied unconditionally.
 * (Plan 3's renderer integration will do the filtering.)
 *
 * Corrections apply in list order; later corrections override earlier ones
 * for the same field.
 */
export function applyCorrections(
  derived: DerivedRecord,
  corrections: Correction[],
): DerivedRecord {
  let result = derived;
  for (const c of corrections) {
    result = applyOne(result, c);
  }
  return result;
}

function applyOne(record: DerivedRecord, c: Correction): DerivedRecord {
  switch (c.field) {
    case 'name':
      return { ...record, name: c.value };
    case 'birth.date':
      return {
        ...record,
        birth: { ...(record.birth ?? { date: null, place: null }), date: c.value },
      };
    case 'birth.place':
      return {
        ...record,
        birth: { ...(record.birth ?? { date: null, place: null }), place: c.value },
      };
    case 'death.date':
      return {
        ...record,
        death: { ...(record.death ?? { date: null, place: null }), date: c.value },
      };
    case 'death.place':
      return {
        ...record,
        death: { ...(record.death ?? { date: null, place: null }), place: c.value },
      };
  }
}
