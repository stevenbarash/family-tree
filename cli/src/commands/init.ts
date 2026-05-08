import { join } from 'node:path';
import { PRE_COMMIT_HOOK, CI_WORKFLOW } from './init-templates.js';

export interface InitOptions {
  rootDir: string;
  force: boolean;
  hookOnly: boolean;
  ciOnly: boolean;
  writeFile: (path: string, content: string) => void;
  mkdirP: (path: string) => void;
  exists: (path: string) => boolean;
  /** Set a local git config value in `rootDir` (e.g. `core.hooksPath = .githooks`). */
  setGitConfig: (key: string, value: string) => void;
  write: (s: string) => void;
  writeErr: (s: string) => void;
}

interface Target {
  path: string;
  dir: string;
  content: string;
  label: string;
  /** If set, run after the file is written. */
  afterWrite?: () => void;
}

export async function runInit(opts: InitOptions): Promise<number> {
  // Verify it's a git repo
  if (!opts.exists(join(opts.rootDir, '.git'))) {
    opts.writeErr(`init: ${opts.rootDir} is not a git repo (.git missing)\n`);
    return 2;
  }

  const targets: Target[] = [];
  if (!opts.ciOnly) {
    targets.push({
      // Tracked location so contributors can commit + share the hook.
      // `core.hooksPath = .githooks` (set after install) tells git to use it.
      path: join(opts.rootDir, '.githooks', 'pre-commit'),
      dir: join(opts.rootDir, '.githooks'),
      content: PRE_COMMIT_HOOK,
      label: 'pre-commit hook',
      afterWrite: () => {
        opts.setGitConfig('core.hooksPath', '.githooks');
      },
    });
  }
  if (!opts.hookOnly) {
    targets.push({
      path: join(opts.rootDir, '.github', 'workflows', 'check.yml'),
      dir: join(opts.rootDir, '.github', 'workflows'),
      content: CI_WORKFLOW,
      label: 'CI workflow',
    });
  }

  let skipped = 0;
  for (const t of targets) {
    if (opts.exists(t.path) && !opts.force) {
      opts.writeErr(`init: ${t.label} exists at ${t.path} (use --force to overwrite)\n`);
      skipped += 1;
      continue;
    }
    opts.mkdirP(t.dir);
    opts.writeFile(t.path, t.content);
    opts.write(`wrote ${t.label}: ${t.path}\n`);
    t.afterWrite?.();
  }

  if (targets.length === 0) {
    opts.writeErr('init: nothing to do (--hook-only and --ci-only both set?)\n');
    return 2;
  }

  return skipped > 0 ? 1 : 0;
}
