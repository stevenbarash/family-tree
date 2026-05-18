import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import yaml from 'js-yaml';
import matter from 'gray-matter';
import type { RepoState, LoadedPage } from './types.ts';
import { parseGedcomFile } from '../gedcom/parser.ts';
import { parsePageMeta } from '../pages/schema.ts';
import { normalizeTranslationKeys } from '../pages/frontmatter.ts';
import { migrate } from '../pages/migrations/index.ts';
import { parseCoordsYaml } from '../family/places-coords.ts';
import { normalizeDerivedRecord } from '../gedcom/normalize.ts';
import type { DerivedRecord } from '../gedcom/types.ts';

/**
 * Load the data repo at `rootDir` (default: $WHOAMI_ROOT or ~/whoami) into a
 * RepoState value. Boundary module — reads disk; pure detectors take the
 * returned RepoState and never touch disk themselves.
 */
export async function loadRepoState(rootDir: string): Promise<RepoState> {
  const gedcomPath = join(rootDir, 'genealogy', 'barash-tree.ged');
  const gedcomText = readFileSync(gedcomPath, 'utf-8');
  const gedcomAst = await parseGedcomFile(gedcomPath);

  const pagesDir = join(rootDir, 'pages');
  const pages: LoadedPage[] = [];
  const parseErrors: { path: string; error: string }[] = [];
  // Article page types — frontmatter that claims to be one of these and
  // fails Zod is a real malformed-page error worth flagging via schema-drift.
  // Other types (talk pages with type: meta, translation-talk pages, etc.)
  // are expected to fail this parser and are silently skipped as before.
  const ARTICLE_TYPES = new Set(['person', 'family', 'event', 'tree']);
  // Walk both the legacy top-level pages/*.md path AND the per-locale
  // pages/{en,ru,uk,he}/*.md paths the multilingual migration introduced.
  // Skips _archived and _meta subdirectories (intentional graveyards) and
  // talk files (handled by their own paths).
  const LOCALE_DIRS = ['en', 'ru', 'uk', 'he'];
  const dirsToScan = [pagesDir, ...LOCALE_DIRS.map(loc => join(pagesDir, loc))];
  for (const dir of dirsToScan) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.md')) continue;
      const path = join(dir, name);
      if (!statSync(path).isFile()) continue;
      const raw = readFileSync(path, 'utf-8');
      const parsed = matter(raw);
      const fmRaw = parsed.data ?? {};
      // Normalize snake_case translation keys (translation_of, canonical_sha,
      // translated_at) to camelCase BEFORE migrate/Zod — same chain parsePage
      // uses. Skipping this step makes every disk-stored translation page look
      // like it's missing pipeline fields.
      const fmNormalized = normalizeTranslationKeys(fmRaw as Record<string, unknown>);
      const fmVersion = typeof (fmNormalized as { schemaVersion?: unknown }).schemaVersion === 'number'
        ? (fmNormalized as { schemaVersion: number }).schemaVersion
        : 1;
      let meta;
      try {
        const migrated = migrate(fmNormalized, fmVersion);
        meta = parsePageMeta(migrated);
      } catch (e) {
        // Surface as a parse error if the file CLAIMS to be an article
        // page (so a malformed canonical page or translation file gets
        // flagged); silently skip otherwise (talk pages, research logs).
        const claimedType = typeof (fmRaw as { type?: unknown }).type === 'string'
          ? (fmRaw as { type: string }).type
          : undefined;
        if (claimedType && ARTICLE_TYPES.has(claimedType)) {
          parseErrors.push({
            path,
            error: e instanceof Error ? e.message : String(e),
          });
        }
        continue;
      }
      const slug = name.replace(/\.md$/, '');
      pages.push({ slug, path, meta, body: parsed.content, text: raw });
    }
  }

  const derivedDir = join(rootDir, 'genealogy', 'derived');
  const derived = new Map<string, DerivedRecord>();
  if (existsSync(derivedDir)) {
    for (const name of readdirSync(derivedDir)) {
      if (!name.endsWith('.yml')) continue;
      const raw = readFileSync(join(derivedDir, name), 'utf-8');
      const parsed = yaml.load(raw);
      const norm = normalizeDerivedRecord(parsed);
      if (norm) derived.set(norm.record, norm);
    }
  }

  const coordsPath = join(rootDir, 'genealogy', 'places-coords.yml');
  const placesCoords = existsSync(coordsPath)
    ? parseCoordsYaml(readFileSync(coordsPath, 'utf-8'))
    : [];

  // Look up canonical EN page HEAD SHAs — but only for slugs that have at
  // least one translation page, since stale-canonical-sha is the only
  // consumer. Bounds git cost to ~O(translated slugs), not O(all pages).
  // Silent on git failure (untracked file, no .git dir): just omits that
  // slug from the map, and the detector treats the absence as "skip".
  const canonicalHeadSha = new Map<string, string>();
  const translatedSlugs = new Set<string>();
  for (const p of pages) {
    if (p.meta.lang && p.meta.lang !== 'en' && p.meta.translationOf) {
      translatedSlugs.add(p.meta.translationOf);
    }
  }
  for (const slug of translatedSlugs) {
    try {
      const sha = execSync(
        `git -C "${rootDir}" log -1 --format=%H -- pages/en/${slug}.md`,
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      ).trim();
      if (/^[a-f0-9]{40}$/.test(sha)) canonicalHeadSha.set(slug, sha);
    } catch {
      // untracked / not a git repo / other: skip silently
    }
  }

  return {
    rootDir,
    gedcomPath,
    gedcomText,
    gedcomAst,
    pages,
    derivedDir,
    derived,
    placesCoords,
    parseErrors,
    canonicalHeadSha,
  };
}
