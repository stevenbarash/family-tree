import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SearchIndex } from './index.ts';

/** Sentinel key stored alongside FlexSearch shards. Holds the list of
 *  restricted slugs so the privacy gate round-trips through persist/load.
 *  Prefixed with `__` to avoid collision with FlexSearch's internal keys. */
const RESTRICTED_KEY = '__restricted_slugs';

/** Serialize the index's shards to a single JSON file (atomic write). */
export async function saveSearchIndex(idx: SearchIndex, path: string): Promise<void> {
  const shards: Record<string, unknown> = {};
  // Async callback selects the Promise-returning overload; we await all shards.
  await idx._raw().export(async (key: string, data: string) => {
    shards[String(key)] = data;
  });
  shards[RESTRICTED_KEY] = [...idx.restrictedSlugs()];
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(shards), 'utf-8');
  renameSync(tmp, path);
}

/** Load shards into an existing index. Returns false on missing/corrupt. */
export async function loadSearchIndex(idx: SearchIndex, path: string): Promise<boolean> {
  let shards: Record<string, unknown>;
  try {
    shards = JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return false;
  }
  if (!shards || typeof shards !== 'object') return false;
  for (const [key, data] of Object.entries(shards)) {
    if (key === RESTRICTED_KEY) {
      if (Array.isArray(data)) idx.setRestrictedSlugs(data.filter((s): s is string => typeof s === 'string'));
      continue;
    }
    idx._raw().import(key, data as never);
  }
  return true;
}
