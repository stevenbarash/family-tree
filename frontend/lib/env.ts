import { join } from 'node:path';
import type { AuthorIdentity } from '@core/pages/index.ts';
import { defaultWhoamiRoot, whoamiPaths } from '@core/paths.ts';
import { assertAuthConfig } from '@/lib/auth-config';

export const WHOAMI_ROOT = defaultWhoamiRoot();

const paths = whoamiPaths(WHOAMI_ROOT);
export const PAGES_DIR = process.env.WHOAMI_PAGES_DIR ?? join(WHOAMI_ROOT, 'pages', 'en');
export const DATA_DIR = paths.dataDir;
export const GENEALOGY_DIR = paths.genealogyDir;
export const DERIVED_DIR = paths.derivedDir;
export const PLACES_COORDS_FILE = paths.placesCoordsFile;
export const SEARCH_INDEX_FILE = paths.searchIndexFile;

export const DEFAULT_AUTHOR: AuthorIdentity = {
  name: process.env.WHOAMI_AUTHOR_NAME ?? 'whoami',
  email: process.env.WHOAMI_AUTHOR_EMAIL ?? 'whoami@local',
};

/** GEDCOM record id of the perspective person on /family/tree. Hardcoded today;
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

/**
 * Master toggle for Descope auth. Off by default — the Mac Studio's local
 * frontend (browsed over Tailscale) has no login wall, as today. The Render
 * replica sets `WHOAMI_AUTH=on`. Same pattern as `PRIVACY_GATE_ENABLED`.
 */
export const AUTH_ENABLED = process.env.WHOAMI_AUTH === 'on';

/** Descope project ID. Public — inlined into the client bundle for AuthProvider. */
export const DESCOPE_PROJECT_ID = process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID ?? '';

/** Descope management key — server-only secret. Used by createSdk() to load
 *  user records (name + email) for write attribution. */
export const DESCOPE_MANAGEMENT_KEY = process.env.DESCOPE_MANAGEMENT_KEY ?? '';

assertAuthConfig({
  authEnabled: AUTH_ENABLED,
  projectId: DESCOPE_PROJECT_ID,
  managementKey: DESCOPE_MANAGEMENT_KEY,
});
