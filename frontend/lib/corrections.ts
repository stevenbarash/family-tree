import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { applyCorrections } from '@core/corrections/overlay.ts';
import type { DerivedRecord } from '@core/gedcom/types.ts';
import type { Correction } from '@core/pages/types.ts';
import { parsePageMeta } from '@core/pages/schema.ts';
import { migrate } from '@core/pages/migrations/index.ts';

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

/**
 * Read all pages in `pagesDir`, extract their frontmatter `corrections[]`,
 * group by target record id (defaulted to the page's own `gedcom.record`
 * when omitted on the correction), and return the resulting map.
 *
 * Boundary module: does file I/O at its public surface. Consumers should
 * call this once per request (or via the cached wrapper) — it walks the
 * pages directory each invocation.
 *
 * Pages whose frontmatter fails schema validation are silently skipped
 * (matches the loader convention in `core/src/checks/load.ts`). A single
 * malformed page does not break the rest of the corrections layer.
 */
export function loadPageCorrections(pagesDir: string): Map<string, Correction[]> {
  const out = new Map<string, Correction[]>();
  if (!existsSync(pagesDir)) return out;
  const entries = readdirSync(pagesDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const path = join(pagesDir, entry.name);
    const raw = readFileSync(path, 'utf-8');
    const parsed = matter(raw);
    const fmRaw = parsed.data ?? {};
    const fmVersion = typeof fmRaw.schemaVersion === 'number' ? fmRaw.schemaVersion : 1;
    let meta;
    try {
      const migrated = migrate(fmRaw, fmVersion);
      meta = parsePageMeta(migrated);
    } catch {
      continue;
    }
    if (!meta.corrections || meta.corrections.length === 0) continue;
    const pageRecord = meta.gedcom?.record;
    for (const c of meta.corrections) {
      const targetId = c.record ?? pageRecord;
      if (!targetId) continue; // no record to attach this correction to
      const stamped = c.record ? c : { ...c, record: targetId };
      const arr = out.get(targetId) ?? [];
      arr.push(stamped);
      out.set(targetId, arr);
    }
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
