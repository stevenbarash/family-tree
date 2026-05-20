import type { AuthorIdentity } from '@core/pages/index.ts';

/** Loads a user's commit identity from an external source (Descope). */
export type AuthorLoader = (userId: string) => Promise<AuthorIdentity>;

interface CacheEntry {
  identity: AuthorIdentity;
  at: number;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60_000;

/**
 * Resolve a userId to an `AuthorIdentity`, memoised for `TTL_MS`. `loader`
 * does the real lookup; `now` is injectable so the TTL is testable without
 * waiting. Distinct userIds cache independently.
 */
export async function resolveAuthor(
  userId: string,
  loader: AuthorLoader,
  now: () => number = Date.now,
): Promise<AuthorIdentity> {
  const hit = cache.get(userId);
  if (hit && now() - hit.at < TTL_MS) return hit.identity;
  const identity = await loader(userId);
  cache.set(userId, { identity, at: now() });
  return identity;
}

/** Test-only: clears the module-level cache so tests start isolated. */
export function _clearAuthorCache(): void {
  cache.clear();
}
