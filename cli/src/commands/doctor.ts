import type { ProbeResult } from '../probe.js';

export interface VersionInfo {
  apiVersion: string;
  version: string;
  startedAt: string;
}

export interface DoctorOptions {
  configuredUrl: string;
  candidates: string[];
  probeServers: (urls: string[]) => Promise<ProbeResult[]>;
  fetchVersion: (url: string) => Promise<VersionInfo>;
  cliVersion: string;
  workspaceRoot: string;
  fs: { exists: (p: string) => boolean };
  fix: boolean;
  setServer: (url: string) => void;
  write: (s: string) => void;
  writeErr: (s: string) => void;
}

export async function runDoctor(opts: DoctorOptions): Promise<number> {
  let problems = 0;

  // --- Server section ---
  const probes = await opts.probeServers(opts.candidates);
  const configured = probes.find(p => p.url === opts.configuredUrl.replace(/\/$/, ''));
  const otherAlive = probes.filter(p => p.ok && p.url !== opts.configuredUrl.replace(/\/$/, ''));

  if (configured?.ok) {
    opts.write(`server     ${opts.configuredUrl}  ok\n`);
  } else {
    problems++;
    opts.write(`server     ${opts.configuredUrl}  unreachable\n`);
    if (otherAlive.length > 0) {
      const url = otherAlive[0]!.url;
      opts.write(`           found wai server at ${url}\n`);
      if (opts.fix) {
        opts.setServer(url);
        opts.write(`           --fix: saved server=${url}\n`);
        problems--; // self-healed
      } else {
        opts.write(`           run \`wai doctor --fix\` or \`wai config server ${url}\`\n`);
      }
    } else {
      opts.write(`           no wai server found on ports 3001 or 3000\n`);
      opts.write(`           is the frontend running? (cd frontend && npm run dev)\n`);
    }
  }

  // --- Frontend version (only if reachable) ---
  const reachableUrl = configured?.ok ? opts.configuredUrl : otherAlive[0]?.url;
  let frontendVersion: string | undefined;
  if (reachableUrl) {
    try {
      const v = await opts.fetchVersion(reachableUrl);
      frontendVersion = v.version;
      const skew = v.version !== opts.cliVersion;
      const skewNote = skew ? '  (skew vs cli)' : '';
      opts.write(`frontend   ${v.version}  api=${v.apiVersion}  started=${v.startedAt}${skewNote}\n`);
    } catch {
      opts.write(`frontend   version check failed (server reachable but /api/version errored)\n`);
    }
  }

  // --- CLI version ---
  opts.write(`cli        ${opts.cliVersion}\n`);
  if (frontendVersion && frontendVersion !== opts.cliVersion) {
    opts.write(`           note: cli ${opts.cliVersion} ≠ frontend ${frontendVersion} — versions differ but skew is informational, not blocking\n`);
  }

  // --- Workspace section ---
  if (!opts.fs.exists(opts.workspaceRoot)) {
    problems++;
    opts.write(`workspace  ${opts.workspaceRoot}  missing (set $WHOAMI_ROOT or create it)\n`);
  } else {
    const checks: Array<[string, string]> = [
      ['genealogy/', `${opts.workspaceRoot}/genealogy`],
      ['pages/', `${opts.workspaceRoot}/pages`],
    ];
    const missing = checks.filter(([, p]) => !opts.fs.exists(p));
    if (missing.length === 0) {
      opts.write(`workspace  ${opts.workspaceRoot}  ok\n`);
    } else {
      problems++;
      opts.write(`workspace  ${opts.workspaceRoot}  missing: ${missing.map(([n]) => n).join(', ')}\n`);
    }
  }

  return problems > 0 ? 1 : 0;
}
