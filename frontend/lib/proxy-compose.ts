import type { NextRequest } from 'next/server';

/** A Descope redirect response (unauthenticated) has a 3xx status. */
export function isRedirect(res: Response): boolean {
  return res.status >= 300 && res.status < 400;
}

/**
 * Compose an auth gate with a locale middleware as redirect-or-fall-through:
 *
 *  - `authEnabled` false → skip the gate, run locale routing.
 *  - gate returns a redirect (unauthenticated) → return it as-is.
 *  - gate returns anything else (authenticated / public route) → discard it
 *    and run locale routing fresh.
 *
 * The gate's non-redirect response is intentionally discarded — `session()`
 * re-validates from the `DS` cookie downstream, so no header needs carrying.
 */
export async function composeAuthAndLocale(
  request: NextRequest,
  authGate: (req: NextRequest) => Promise<Response> | Response,
  localeMiddleware: (req: NextRequest) => Response,
  authEnabled: boolean,
): Promise<Response> {
  if (authEnabled) {
    const authResult = await authGate(request);
    if (isRedirect(authResult)) return authResult;
  }
  return localeMiddleware(request);
}
