import { applyCorrections } from '@core/corrections/overlay.ts';
import type { DerivedRecord } from '@core/gedcom/types.ts';
import type { Correction } from '@core/pages/types.ts';

/** Map of `record id` → list of corrections targeting that record. */
export type CorrectionsMap = ReadonlyMap<string, ReadonlyArray<Correction>>;

/**
 * Apply a corrections map to an entire `Map<recordId, DerivedRecord>`.
 * Pure — returns a new map. Records with no corrections in the map are
 * passed through unchanged (same object reference).
 */
export function correctRecords(
  records: Map<string, DerivedRecord>,
  corrections: CorrectionsMap,
): Map<string, DerivedRecord> {
  if (corrections.size === 0) return records;
  const out = new Map<string, DerivedRecord>();
  for (const [id, record] of records) {
    const cs = corrections.get(id);
    if (!cs || cs.length === 0) {
      out.set(id, record);
      continue;
    }
    out.set(id, applyCorrections(record, [...cs]));
  }
  return out;
}
