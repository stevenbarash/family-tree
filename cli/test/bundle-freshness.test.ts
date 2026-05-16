import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBundleFreshness, type FsLike } from '../src/bundle-freshness.js';

/**
 * Fake FS for driving the freshness check without touching real files.
 * Each entry maps a path to either a file (mtimeMs, isDir=false) or a
 * directory (entries listed, isDir=true). The shape matches what
 * checkBundleFreshness expects: a stat returns `{ mtimeMs, isDirectory }`
 * and readdir returns a list of base names.
 */
type Entry =
  | { kind: 'file'; mtimeMs: number }
  | { kind: 'dir'; entries: string[]; mtimeMs?: number };

function makeFs(layout: Record<string, Entry>): FsLike {
  return {
    stat: (path) => {
      const e = layout[path];
      if (!e) return null;
      const mtimeMs = e.mtimeMs ?? 0;
      const isDir = e.kind === 'dir';
      return { mtimeMs, isDirectory: () => isDir };
    },
    readdir: (path) => {
      const e = layout[path];
      if (!e || e.kind !== 'dir') return null;
      return e.entries;
    },
  };
}

test('checkBundleFreshness: returns stale when any src .ts is newer than bundle', () => {
  // Realistic scenario: developer edited harness/claude-code.ts (newer
  // mtime) but forgot to rebuild. The check should catch this so a wai
  // invocation doesn't silently run the old bundle.
  const fs = makeFs({
    '/cli/dist/wai.cjs': { kind: 'file', mtimeMs: 1000 },
    '/cli/src': { kind: 'dir', entries: ['index.ts', 'harness'] },
    '/cli/src/index.ts': { kind: 'file', mtimeMs: 900 },
    '/cli/src/harness': { kind: 'dir', entries: ['claude-code.ts'] },
    '/cli/src/harness/claude-code.ts': { kind: 'file', mtimeMs: 2000 },
  });
  const result = checkBundleFreshness('/cli/dist/wai.cjs', '/cli/src', fs);
  assert.equal(result.stale, true);
  assert.match(result.message ?? '', /stale/);
  assert.match(result.message ?? '', /npm run build/);
});

test('checkBundleFreshness: not stale when bundle is newer than every src file', () => {
  const fs = makeFs({
    '/cli/dist/wai.cjs': { kind: 'file', mtimeMs: 5000 },
    '/cli/src': { kind: 'dir', entries: ['index.ts'] },
    '/cli/src/index.ts': { kind: 'file', mtimeMs: 4000 },
  });
  const result = checkBundleFreshness('/cli/dist/wai.cjs', '/cli/src', fs);
  assert.equal(result.stale, false);
  assert.equal(result.message, undefined);
});

test('checkBundleFreshness: skips silently when src directory missing', () => {
  // npm-installed / packaged distribution: cli/src/ may not exist next
  // to the bundle. The check must not crash or emit a false positive.
  const fs = makeFs({
    '/cli/dist/wai.cjs': { kind: 'file', mtimeMs: 1000 },
  });
  const result = checkBundleFreshness('/cli/dist/wai.cjs', '/cli/src', fs);
  assert.equal(result.stale, false);
});

test('checkBundleFreshness: skips silently when bundle path is missing', () => {
  // Defensive: if the binary path resolves to something that isn't on
  // disk (rare but possible with weird launcher setups), don't crash.
  const fs = makeFs({
    '/cli/src': { kind: 'dir', entries: ['index.ts'] },
    '/cli/src/index.ts': { kind: 'file', mtimeMs: 1000 },
  });
  const result = checkBundleFreshness('/cli/dist/wai.cjs', '/cli/src', fs);
  assert.equal(result.stale, false);
});

test('checkBundleFreshness: ignores node_modules, dist, and dotfiles when scanning src', () => {
  // We don't want install-time mtimes in node_modules to trigger a false
  // "stale bundle" warning. Same for dist (the bundle itself) and any
  // .ts files in dotfile directories (e.g., .vscode).
  const fs = makeFs({
    '/cli/dist/wai.cjs': { kind: 'file', mtimeMs: 1000 },
    '/cli/src': { kind: 'dir', entries: ['index.ts', 'node_modules', 'dist', '.vscode'] },
    '/cli/src/index.ts': { kind: 'file', mtimeMs: 500 },
    '/cli/src/node_modules': { kind: 'dir', entries: ['evil.ts'] },
    '/cli/src/node_modules/evil.ts': { kind: 'file', mtimeMs: 9999 },
    '/cli/src/dist': { kind: 'dir', entries: ['nope.ts'] },
    '/cli/src/dist/nope.ts': { kind: 'file', mtimeMs: 9999 },
    '/cli/src/.vscode': { kind: 'dir', entries: ['settings.ts'] },
    '/cli/src/.vscode/settings.ts': { kind: 'file', mtimeMs: 9999 },
  });
  const result = checkBundleFreshness('/cli/dist/wai.cjs', '/cli/src', fs);
  // The only counted .ts file is /cli/src/index.ts at 500, older than
  // bundle at 1000 — so not stale despite the trap files in
  // node_modules/dist/.vscode.
  assert.equal(result.stale, false);
});

test('checkBundleFreshness: skips when src directory exists but contains no .ts files', () => {
  // No TypeScript sources to compare against — nothing to do.
  const fs = makeFs({
    '/cli/dist/wai.cjs': { kind: 'file', mtimeMs: 1000 },
    '/cli/src': { kind: 'dir', entries: ['README.md'] },
    '/cli/src/README.md': { kind: 'file', mtimeMs: 9999 },
  });
  const result = checkBundleFreshness('/cli/dist/wai.cjs', '/cli/src', fs);
  assert.equal(result.stale, false);
});

test('checkBundleFreshness: age formatting in the warning message', () => {
  // The "src newer by Xs/Xm/Xh/Xd" tail helps the user see at a glance
  // how out-of-date the bundle is. Verify the unit choice picks the
  // most informative tier (seconds for sub-minute, minutes for sub-hour,
  // etc.) rather than always using seconds.
  const cases: Array<{ ageMs: number; matcher: RegExp }> = [
    { ageMs: 30 * 1000, matcher: /by 30s/ },
    { ageMs: 5 * 60 * 1000, matcher: /by 5m/ },
    { ageMs: 2 * 3600 * 1000, matcher: /by 2h/ },
    { ageMs: 3 * 86400 * 1000, matcher: /by 3d/ },
  ];
  for (const c of cases) {
    const fs = makeFs({
      '/cli/dist/wai.cjs': { kind: 'file', mtimeMs: 1000 },
      '/cli/src': { kind: 'dir', entries: ['x.ts'] },
      '/cli/src/x.ts': { kind: 'file', mtimeMs: 1000 + c.ageMs },
    });
    const result = checkBundleFreshness('/cli/dist/wai.cjs', '/cli/src', fs);
    assert.equal(result.stale, true);
    assert.match(result.message ?? '', c.matcher, `expected ${c.matcher}, got "${result.message}"`);
  }
});
