export interface AuthConfig {
  authEnabled: boolean;
  projectId: string;
  managementKey: string;
}

/**
 * Fail-loud guard: when auth is enabled, both Descope secrets must be set.
 * A missing project ID is a hard outage (auth cannot function at all); a
 * missing management key silently degrades write attribution to a
 * userId-derived identity. Throw on either so a misconfigured deploy fails
 * at startup with a clear, named error rather than opaquely per-request.
 * Inert when `authEnabled` is false (the local / Tailscale default).
 */
export function assertAuthConfig(config: AuthConfig): void {
  if (!config.authEnabled) return;
  const missing: string[] = [];
  if (!config.projectId) missing.push('NEXT_PUBLIC_DESCOPE_PROJECT_ID');
  if (!config.managementKey) missing.push('DESCOPE_MANAGEMENT_KEY');
  if (missing.length > 0) {
    throw new Error(
      `WHOAMI_AUTH=on but required Descope env var(s) are empty: ${missing.join(', ')}`,
    );
  }
}
