/**
 * Search the wiki for every occurrence of a phrase across pages, talk
 * pages, and source transcripts. Used as the first step of any factual
 * correction: before editing a single file, list every place the wrong
 * claim lives so the correction can be applied in one pass.
 *
 * Wraps a recursive `grep`-style scan with whoami-aware defaults:
 *   - Searches `pages/**\/*.md` (live and talk pages) and
 *     `assets/sources/**\/transcript.md` (source transcripts) by default.
 *   - Accepts a primary phrase and optional comma-separated variants
 *     covering the English / Russian / Ukrainian / Yiddish forms of the
 *     same claim, since the same fact often surfaces in multiple scripts
 *     and translations in this archive.
 *   - Output groups hits by file so the user can scan an audit list
 *     before opening any editor.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface GrepClaimsOptions {
  rootDir: string;
  phrases: ReadonlyArray<string>;
  /** Search `assets/sources/**\/transcript.md` in addition to `pages/`. Default true. */
  includeSources: boolean;
  /** Search `*.talk.md` in addition to live pages. Default true. */
  includeTalk: boolean;
  /** Case-insensitive match. Default true. */
  caseInsensitive: boolean;
  json: boolean;
  write: (s: string) => void;
}

export interface GrepClaimHit {
  file: string;
  line: number;
  phrase: string;
  text: string;
}

export function runGrepClaims(opts: GrepClaimsOptions): number {
  if (opts.phrases.length === 0) {
    opts.write('grep-claims: no phrase to search for\n');
    return 2;
  }
  const targets = [
    { path: join(opts.rootDir, 'pages'), label: 'pages' as const },
    ...(opts.includeSources
      ? [{ path: join(opts.rootDir, 'assets', 'sources'), label: 'sources' as const }]
      : []),
  ];
  const hits: GrepClaimHit[] = [];
  for (const target of targets) {
    for (const file of walkMarkdownFiles(target.path, target.label, opts.includeTalk)) {
      const lines = readFileSync(file, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        for (const phrase of opts.phrases) {
          if (matches(line, phrase, opts.caseInsensitive)) {
            hits.push({
              file: relative(opts.rootDir, file),
              line: i + 1,
              phrase,
              text: line.trim(),
            });
          }
        }
      }
    }
  }

  if (opts.json) {
    opts.write(JSON.stringify({ phrases: opts.phrases, hits }, null, 2) + '\n');
    return 0;
  }

  if (hits.length === 0) {
    opts.write(`grep-claims: no hits for ${opts.phrases.length === 1 ? `"${opts.phrases[0]}"` : `${opts.phrases.length} variants`}.\n`);
    return 0;
  }

  // Group by file for the audit-list view.
  const byFile = new Map<string, GrepClaimHit[]>();
  for (const h of hits) {
    const arr = byFile.get(h.file) ?? [];
    arr.push(h);
    byFile.set(h.file, arr);
  }
  for (const [file, fileHits] of byFile) {
    opts.write(`\n${file}\n`);
    for (const h of fileHits) {
      const preview = h.text.length > 120 ? h.text.slice(0, 117) + '…' : h.text;
      opts.write(`  ${h.line}: ${preview}\n`);
    }
  }
  const fileCount = byFile.size;
  const hitWord = hits.length === 1 ? 'hit' : 'hits';
  const fileWord = fileCount === 1 ? 'file' : 'files';
  opts.write(`\n${hits.length} ${hitWord} across ${fileCount} ${fileWord}.\n`);
  return 0;
}

function* walkMarkdownFiles(dir: string, label: 'pages' | 'sources', includeTalk: boolean): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === '_archived' || entry === '_meta' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) {
      yield* walkMarkdownFiles(full, label, includeTalk);
      continue;
    }
    if (!entry.endsWith('.md')) continue;
    if (label === 'pages') {
      if (!includeTalk && entry.endsWith('.talk.md')) continue;
    } else {
      // For sources/, only the transcript files are interesting.
      if (entry !== 'transcript.md') continue;
    }
    yield full;
  }
}

function matches(line: string, phrase: string, caseInsensitive: boolean): boolean {
  if (caseInsensitive) {
    return line.toLowerCase().includes(phrase.toLowerCase());
  }
  return line.includes(phrase);
}
