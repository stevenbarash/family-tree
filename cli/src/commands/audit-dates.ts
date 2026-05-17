/**
 * Audit the wiki for ambiguous slash dates (m/d/y vs d/m/y when both fields
 * are ≤ 12). The format-drift detector already refuses to auto-rewrite these,
 * and the infobox renders a `?` glyph for them, but neither surface lists
 * every site that needs manual disambiguation. This is the listing report:
 * one screen of file:line hits the user can walk to fix at the source.
 *
 * Walks three sources:
 *
 *   1. `genealogy/barash-tree.ged` — the GEDCOM source of truth. Fixes here
 *      survive deriver re-runs and propagate everywhere else.
 *   2. `genealogy/derived/*.yml` — the parsed records served to the
 *      frontend. Hits here mean either an un-disambiguated raw value
 *      slipped through OR the deriver is leaking a slash form (a bug).
 *   3. `pages/**\/*.md` (live + talk) — article prose and talk-page
 *      research notes.
 *
 * Exits non-zero when any ambiguous date is found, so this can be wired
 * into pre-commit hooks or CI.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { scanForAmbiguousDates, type AmbiguousDateHit } from '@core/checks/ambiguous-dates.ts';

export interface AuditDatesOptions {
  rootDir: string;
  json: boolean;
  write: (s: string) => void;
}

interface AuditTarget {
  label: 'gedcom' | 'derived' | 'pages';
  // Either a single file or a directory walked recursively.
  files: () => Iterable<string>;
}

export function runAuditDates(opts: AuditDatesOptions): number {
  const targets: AuditTarget[] = [
    {
      label: 'gedcom',
      files: () => walkSingleFile(join(opts.rootDir, 'genealogy', 'barash-tree.ged')),
    },
    {
      label: 'derived',
      files: () => walkMatching(
        join(opts.rootDir, 'genealogy', 'derived'),
        (entry) => entry.endsWith('.yml'),
      ),
    },
    {
      label: 'pages',
      files: () => walkMatching(
        join(opts.rootDir, 'pages'),
        (entry) => entry.endsWith('.md'),
        (entry) => entry === '_archived' || entry === '_meta' || entry.startsWith('.'),
      ),
    },
  ];

  const groups: Array<{ label: AuditTarget['label']; hits: AmbiguousDateHit[] }> = [];
  for (const target of targets) {
    const collected: AmbiguousDateHit[] = [];
    for (const file of target.files()) {
      let text: string;
      try { text = readFileSync(file, 'utf8'); } catch { continue; }
      for (const hit of scanForAmbiguousDates(relative(opts.rootDir, file), text)) {
        collected.push(hit);
      }
    }
    groups.push({ label: target.label, hits: collected });
  }

  const total = groups.reduce((acc, g) => acc + g.hits.length, 0);

  if (opts.json) {
    opts.write(JSON.stringify({
      total,
      groups: groups.map(g => ({ source: g.label, hits: g.hits })),
    }, null, 2) + '\n');
    return total === 0 ? 0 : 1;
  }

  if (total === 0) {
    opts.write('audit dates: no ambiguous slash dates found.\n');
    return 0;
  }

  for (const g of groups) {
    if (g.hits.length === 0) continue;
    opts.write(`\n${g.label} (${g.hits.length})\n`);
    const byFile = new Map<string, AmbiguousDateHit[]>();
    for (const h of g.hits) {
      const arr = byFile.get(h.file) ?? [];
      arr.push(h);
      byFile.set(h.file, arr);
    }
    for (const [file, hits] of byFile) {
      opts.write(`  ${file}\n`);
      for (const h of hits) {
        const preview = h.context.length > 100 ? h.context.slice(0, 97) + '…' : h.context;
        opts.write(`    ${h.line}:${h.column}  ${h.text}    ${preview}\n`);
      }
    }
  }
  const hitWord = total === 1 ? 'date' : 'dates';
  opts.write(`\n${total} ambiguous slash ${hitWord}. Disambiguate at the GEDCOM source (genealogy/barash-tree.ged), then \`wai sync-gedcom --force\`.\n`);
  return 1;
}

function* walkSingleFile(file: string): Generator<string> {
  try {
    if (statSync(file).isFile()) yield file;
  } catch {
    // Missing source file is not fatal — just no hits to report from it.
  }
}

function* walkMatching(
  dir: string,
  matchEntry: (entry: string) => boolean,
  skipDir: (entry: string) => boolean = () => false,
): Generator<string> {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    if (skipDir(entry)) continue;
    const full = join(dir, entry);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) {
      yield* walkMatching(full, matchEntry, skipDir);
      continue;
    }
    if (matchEntry(entry)) yield full;
  }
}
