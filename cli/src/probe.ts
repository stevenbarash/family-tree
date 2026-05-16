const DEFAULT_TIMEOUT_MS = 500;
const DEFAULT_CANDIDATES = [
  'http://localhost:3001',
  'http://localhost:3000',
];

export interface ProbeResult {
  url: string;
  ok: boolean;
}

/**
 * Ping each candidate's `/api/healthz` with a short timeout. Never throws —
 * unreachable candidates report `ok: false`. Returns one result per input,
 * in order, so callers can correlate by index.
 */
export async function probeServers(
  candidates: string[],
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ProbeResult[]> {
  return Promise.all(candidates.map(async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${url}/api/healthz`, { signal: controller.signal });
      return { url, ok: res.ok };
    } catch {
      return { url, ok: false };
    } finally {
      clearTimeout(timer);
    }
  }));
}

/**
 * Build the candidate list for a probe: the configured URL first (so it gets
 * tried before defaults), then the well-known dev-server ports, deduped.
 * Trailing slashes are stripped so equivalent URLs collapse.
 */
export function commonServerCandidates(configuredUrl: string): string[] {
  const norm = configuredUrl.replace(/\/+$/, '');
  const out = [norm];
  for (const d of DEFAULT_CANDIDATES) {
    if (!out.includes(d)) out.push(d);
  }
  return out;
}
