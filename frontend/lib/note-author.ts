import type { AuthorIdentity } from '@core/pages/index.ts';

/**
 * The author name to attribute a research-note write to.
 *
 * With auth ON, the signed-in Descope identity is authoritative — a
 * client-supplied `by` would let one family member write as another, so
 * it is ignored. With auth OFF (local dev / Tailscale, where the CLI is
 * trusted), the client's `by` is honoured — that is how `wai note`
 * records the OS user or an agent's model name — falling back to the
 * session identity (`DEFAULT_AUTHOR` when auth is off).
 *
 * Pure helper, split out of the route handlers so the regime logic is
 * unit-testable without the Descope SDK.
 */
export function noteAuthorName(
  authEnabled: boolean,
  session: AuthorIdentity,
  clientBy: string | undefined,
): string {
  return authEnabled ? session.name : (clientBy ?? session.name);
}
