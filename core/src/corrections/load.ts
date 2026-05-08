import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { parsePageMeta } from '../pages/schema.ts';
import { migrate } from '../pages/migrations/index.ts';
import type { Correction } from '../pages/types.ts';

/** A page correction with its source page path attached. */
export interface SourcedCorrection extends Correction {
  /** Absolute path of the page file the correction came from. */
  sourcePagePath: string;
}

/**
 * Walk `pagesDir`, extract each page's frontmatter `corrections[]`,
 * group by target record id (defaulted to the page's own `gedcom.record`
 * when omitted on the correction). Boundary module — does file I/O.
 *
 * Pages whose frontmatter fails Zod validation are silently skipped.
 */
export function loadPageCorrections(pagesDir: string): Map<string, Correction[]> {
  const out = new Map<string, Correction[]>();
  for (const c of loadPageCorrectionsWithSource(pagesDir)) {
    const arr = out.get(c.record!) ?? [];
    // Drop the sourcePagePath when storing in the grouped map (callers don't need it).
    const { sourcePagePath, ...rest } = c;
    arr.push(rest);
    out.set(c.record!, arr);
  }
  return out;
}

/**
 * Like `loadPageCorrections`, but returns a flat list of corrections each
 * tagged with the source page file path. Useful for tools that need to
 * rewrite the source page (e.g. `wai promote-corrections`).
 */
export function loadPageCorrectionsWithSource(pagesDir: string): SourcedCorrection[] {
  const out: SourcedCorrection[] = [];
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
      if (!targetId) continue;
      const stamped = c.record ? c : { ...c, record: targetId };
      out.push({ ...stamped, sourcePagePath: path });
    }
  }
  return out;
}
