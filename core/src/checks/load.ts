import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import matter from 'gray-matter';
import type { RepoState, LoadedPage } from './types.ts';
import { parseGedcomFile } from '../gedcom/parser.ts';
import { parsePageMeta } from '../pages/schema.ts';
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
  if (existsSync(pagesDir)) {
    for (const name of readdirSync(pagesDir)) {
      if (!name.endsWith('.md')) continue;
      const path = join(pagesDir, name);
      if (!statSync(path).isFile()) continue;
      const raw = readFileSync(path, 'utf-8');
      const parsed = matter(raw);
      const fmRaw = parsed.data ?? {};
      const fmVersion = typeof fmRaw.schemaVersion === 'number' ? fmRaw.schemaVersion : 1;
      let meta;
      try {
        const migrated = migrate(fmRaw, fmVersion);
        meta = parsePageMeta(migrated);
      } catch {
        // Skip pages whose frontmatter fails migration or schema validation
        // (talk pages, research logs without structured frontmatter, future-version
        // pages from a code rev we don't have, malformed types).
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

  return {
    rootDir,
    gedcomPath,
    gedcomText,
    gedcomAst,
    pages,
    derivedDir,
    derived,
    placesCoords,
  };
}
