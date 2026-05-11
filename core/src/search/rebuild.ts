import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import yaml from 'js-yaml';
import { parsePage } from '../pages/frontmatter.ts';
import type { DerivedRecord } from '../gedcom/types.ts';
import { normalizeDerivedRecord } from '../gedcom/normalize.ts';
import type { SearchIndex } from './index.ts';
import { buildSearchDoc } from './doc-builder.ts';

export interface RebuildConfig {
  pagesDir: string;
  genealogyDir: string;
}

export async function rebuildSearchIndex(idx: SearchIndex, cfg: RebuildConfig): Promise<number> {
  let count = 0;
  for (const entry of readdirSync(cfg.pagesDir)) {
    if (entry.startsWith('_')) continue;
    if (!entry.endsWith('.md')) continue;
    if (entry.endsWith('.narrative.md')) continue; // authoring input only
    const slug = basename(entry, '.md');
    const raw = readFileSync(join(cfg.pagesDir, entry), 'utf-8');
    let page;
    try { page = parsePage(slug, raw); } catch { continue; }
    let derived: DerivedRecord | null = null;
    if (page.meta.gedcom?.record) {
      const dpath = join(cfg.genealogyDir, 'derived', `${page.meta.gedcom.record}.yml`);
      if (existsSync(dpath)) {
        try {
          // Use normalize so pre-privacy YAMLs default to unrestricted
          // instead of crashing on missing fields.
          derived = normalizeDerivedRecord(yaml.load(readFileSync(dpath, 'utf-8')));
        } catch { /* ignore */ }
      }
    }
    idx.upsert(buildSearchDoc(page, derived), { restricted: derived?.privacy?.restricted === true });
    count++;
  }
  return count;
}
