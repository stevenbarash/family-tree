import type { AuthorIdentity } from '@core/pages/index.ts';
import { defaultWhoamiRoot, whoamiPaths } from '@core/paths.ts';

export const WHOAMI_ROOT = defaultWhoamiRoot();

const paths = whoamiPaths(WHOAMI_ROOT);
export const PAGES_DIR = paths.pagesDir;
export const DATA_DIR = paths.dataDir;
export const GENEALOGY_DIR = paths.genealogyDir;
export const DERIVED_DIR = paths.derivedDir;
export const PLACES_COORDS_FILE = paths.placesCoordsFile;
export const SEARCH_INDEX_FILE = paths.searchIndexFile;

export const DEFAULT_AUTHOR: AuthorIdentity = {
  name: process.env.WHOAMI_AUTHOR_NAME ?? 'whoami',
  email: process.env.WHOAMI_AUTHOR_EMAIL ?? 'whoami@local',
};

/** GEDCOM record id of the perspective person on /family. Hardcoded today;
 *  later versions will pick up the viewer from session/profile. */
export const SELF_RECORD = process.env.WHOAMI_SELF_RECORD ?? 'I28906360944';
