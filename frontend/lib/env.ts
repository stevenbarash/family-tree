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

/**
 * Master toggle for the privacy gate (living-relative / restricted-record
 * filtering on page renders, search results, and the page-write API).
 *
 * **Currently disabled** while the wiki is single-user (no auth, Tailscale
 * ACLs are the access layer — same posture as why auth itself is out of
 * scope). The gate's code stays in place so re-enabling it later is one
 * flag flip: set `WHOAMI_PRIVACY_GATE=on` in the environment, or change
 * the default below back to `true`.
 *
 * When `false`, restricted records render as normal pages (no
 * RestrictedNotice) and appear in search regardless of `--include-living`.
 * The underlying `derived.privacy.restricted` flag is still parsed and
 * stored; only the gating effect is suppressed.
 */
export const PRIVACY_GATE_ENABLED = process.env.WHOAMI_PRIVACY_GATE === 'on';
