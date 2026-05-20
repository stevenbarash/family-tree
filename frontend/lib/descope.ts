import { createSdk, session } from '@descope/nextjs-sdk/server';
import type { AuthorIdentity } from '@core/pages/index.ts';
import { resolveAuthor } from '@/lib/author-cache';
import {
  AUTH_ENABLED,
  DESCOPE_PROJECT_ID,
  DESCOPE_MANAGEMENT_KEY,
  DEFAULT_AUTHOR,
} from '@/lib/env';

/** Thrown by `requireSession()` when auth is on and there is no valid session. */
export class UnauthenticatedError extends Error {
  constructor() {
    super('no authenticated Descope session');
    this.name = 'UnauthenticatedError';
  }
}

let sdk: ReturnType<typeof createSdk> | null = null;
function descopeSdk() {
  sdk ??= createSdk({
    projectId: DESCOPE_PROJECT_ID,
    managementKey: DESCOPE_MANAGEMENT_KEY,
  });
  return sdk;
}

/**
 * Load a Descope user's name + email by userId. On any failure, fall back to a
 * userId-derived identity — honest (it names the real account) and never
 * the generic `whoami` placeholder.
 */
async function loadFromDescope(userId: string): Promise<AuthorIdentity> {
  try {
    const res = await descopeSdk().management.user.loadByUserId(userId);
    if (res.ok && res.data) {
      const name = res.data.name?.trim();
      const email = res.data.email?.trim();
      if (name && email) return { name, email };
    }
  } catch {
    // fall through to the userId-derived fallback
  }
  return { name: userId, email: `${userId}@descope.local` };
}

/**
 * Gate a route handler and return the `AuthorIdentity` to attribute its
 * writes to.
 *  - auth off → `DEFAULT_AUTHOR` (local / Tailscale — unchanged behaviour)
 *  - auth on  → the signed-in family member, or throw `UnauthenticatedError`
 */
export async function requireSession(): Promise<AuthorIdentity> {
  if (!AUTH_ENABLED) return DEFAULT_AUTHOR;
  const s = await session();
  const userId = s?.token?.sub;
  if (!userId) throw new UnauthenticatedError();
  return resolveAuthor(userId, loadFromDescope);
}
