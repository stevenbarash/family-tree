import { statSync } from 'node:fs';
import { join } from 'node:path';
import { applyCorrections } from '@core/corrections/overlay.ts';
import {
  loadPageCorrections,
  loadPageCorrectionsWithSource,
  type SourcedCorrection,
} from '@core/corrections/load.ts';
import type { DerivedRecord } from '@core/gedcom/types.ts';
import type { Correction } from '@core/pages/types.ts';

// Re-export for callers (preserves plan-3's API surface).
export { loadPageCorrections, loadPageCorrectionsWithSource };
export type { SourcedCorrection };

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

const PAGES_DIR = join(process.env.WHOAMI_ROOT || join(process.env.HOME || '/tmp', 'whoami'), 'pages');
const CACHE_TTL_MS = 5_000;

interface CacheEntry {
  corrections: Map<string, Correction[]>;
  expiresAt: number;
  mtimeMs: number;
}

let _cache: CacheEntry | null = null;

/**
 * Cached wrapper around `loadPageCorrections`. Reuses the cached map until
 * the pages dir mtime changes or the TTL expires, mirroring the
 * `getCachedDerivedRecords` pattern in `frontend/lib/family.ts`.
 */
export function getCachedPageCorrections(): Map<string, Correction[]> {
  const now = Date.now();
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(PAGES_DIR).mtimeMs;
  } catch {
    return new Map();
  }
  if (_cache && _cache.expiresAt > now && _cache.mtimeMs === mtimeMs) {
    return _cache.corrections;
  }
  const corrections = loadPageCorrections(PAGES_DIR);
  _cache = { corrections, expiresAt: now + CACHE_TTL_MS, mtimeMs };
  return corrections;
}
