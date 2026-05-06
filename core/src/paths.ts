import { join, resolve } from 'node:path';

/**
 * The set of canonical paths derived from the data-repo root
 * (`$WHOAMI_ROOT`). A single source of truth so callers don't
 * re-implement the layout (`pages/`, `data/`, `genealogy/`, …).
 */
export interface WhoamiPaths {
  root: string;
  pagesDir: string;
  dataDir: string;
  genealogyDir: string;
  derivedDir: string;
  placesCoordsFile: string;
  searchIndexFile: string;
}

/**
 * The default `$WHOAMI_ROOT` resolution: the env var if set, otherwise
 * `~/whoami`. The env read is a function call so this stays a pure
 * helper at module load — call from a consumer's top-level once.
 */
export function defaultWhoamiRoot(): string {
  return process.env.WHOAMI_ROOT ?? resolve(process.env.HOME ?? '.', 'whoami');
}

export function whoamiPaths(root: string): WhoamiPaths {
  const genealogyDir = join(root, 'genealogy');
  const dataDir = join(root, 'data');
  return {
    root,
    pagesDir: join(root, 'pages'),
    dataDir,
    genealogyDir,
    derivedDir: join(genealogyDir, 'derived'),
    placesCoordsFile: join(genealogyDir, 'places-coords.yml'),
    searchIndexFile: join(dataDir, 'search.idx.json'),
  };
}
