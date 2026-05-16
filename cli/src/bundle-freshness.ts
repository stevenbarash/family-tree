/**
 * Stale-bundle detector for the wai CLI.
 *
 * The CLI ships as a single bundled file at `cli/dist/wai.cjs`. If a fix
 * lands in `cli/src/**` but the bundle isn't rebuilt, `wai` runs the old
 * code — which is exactly the class of bug that hides regressions in
 * plain sight. This check runs at startup, compares the bundle's mtime
 * to the newest mtime in `cli/src/`, and warns to stderr when src is
 * newer. It is best-effort: when `cli/src/` isn't alongside the bundle
 * (npm-installed deployments, packaged distributions), the check
 * silently skips.
 *
 * The behavior is intentionally a warning, not an exit: a stale bundle
 * still works (it's just behind), and users running `wai` in tight
 * iteration loops shouldn't be blocked while they decide whether to
 * rebuild.
 */

export interface BundleFreshness {
  stale: boolean;
  /**
   * When `stale: true`, a one-line message suitable for stderr.
   * Otherwise undefined.
   */
  message?: string;
}

export interface FsLike {
  stat: (path: string) => { mtimeMs: number; isDirectory: () => boolean } | null;
  readdir: (path: string) => string[] | null;
}

/**
 * Compare the bundle's mtime against the newest TypeScript source file
 * under `srcRoot`. The check is forgiving: any FS error along the way
 * yields `stale: false` rather than crashing wai's startup.
 */
export function checkBundleFreshness(bundlePath: string, srcRoot: string, fs: FsLike): BundleFreshness {
  const bundle = safeStat(fs, bundlePath);
  if (!bundle) return { stale: false };
  const newest = newestTsMtime(srcRoot, fs);
  if (newest === null) return { stale: false };
  if (newest <= bundle.mtimeMs) return { stale: false };
  const ageSec = Math.round((newest - bundle.mtimeMs) / 1000);
  return {
    stale: true,
    message: `wai: bundle is stale (src newer by ${formatAge(ageSec)}); run \`npm run build\` in cli/ to refresh`,
  };
}

function newestTsMtime(dir: string, fs: FsLike): number | null {
  const dirStat = safeStat(fs, dir);
  if (!dirStat || !dirStat.isDirectory()) return null;
  let newest = 0;
  let touched = false;
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    const entries = fs.readdir(cur);
    if (!entries) continue;
    for (const entry of entries) {
      // Skip node_modules — its mtimes are an install-time signal, not
      // a "src changed" signal, and we don't want to recurse into a
      // potentially enormous tree.
      if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
      const path = joinPath(cur, entry);
      const stat = safeStat(fs, path);
      if (!stat) continue;
      if (stat.isDirectory()) {
        stack.push(path);
      } else if (entry.endsWith('.ts')) {
        touched = true;
        if (stat.mtimeMs > newest) newest = stat.mtimeMs;
      }
    }
  }
  return touched ? newest : null;
}

function safeStat(fs: FsLike, path: string): { mtimeMs: number; isDirectory: () => boolean } | null {
  try {
    return fs.stat(path);
  } catch {
    return null;
  }
}

function joinPath(a: string, b: string): string {
  // Avoid pulling in node:path here so the file stays portable as a pure
  // function — tests can drive it with synthetic paths without needing
  // the real filesystem.
  return a.endsWith('/') ? `${a}${b}` : `${a}/${b}`;
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}
