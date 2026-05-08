# Drift prevention — Plan 6 of 7: `wai init` + pre-commit/CI templates

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `wai init` command that scaffolds the pre-commit hook and CI workflow into a fresh `~/whoami` data repo, plus the templates themselves. After this plan, the data repo can self-enforce drift checks on every commit (locally) and every push (in CI).

**Architecture:** Two template files embedded as TypeScript string constants in the CLI bundle (avoids esbuild data-file plumbing). `wai init` writes them to `<root>/.git/hooks/pre-commit` and `<root>/.github/workflows/check.yml` respectively, refuses to clobber without `--force`. Standalone CLI command (matches `wai check` and `wai promote-corrections`).

**Tech Stack:** TypeScript, Node 22, `tsx --test`, `node:assert/strict`, `node:fs/promises`.

**Spec reference:** `docs/superpowers/specs/2026-05-07-drift-prevention-design.md` move 6.

---

## Scope

**In scope:**
- `cli/src/commands/init.ts` — CLI command, dependency-injected for testability
- `cli/src/commands/init-templates.ts` — embedded string constants for the two templates
- `cli/test/init.test.ts` — tests for the command (idempotence, refusal on existing files, --force, --hook-only, --ci-only)
- `cli/src/index.ts` — register `init` subcommand + help block
- `cli/AGENTS.md` — note the new command

**Out of scope:**
- Auto-fix integration in `wai write` — touches the API; defer until after architecture-audit decoupling.
- Auto-format normalization inside `wai sync-gedcom` — same reason.
- `--since HEAD` flag on `wai check` — pre-commit hook runs full `wai check` (fast enough today: ~86ms for 4992-line GEDCOM + 110 pages per plan 1's measurement). If perf becomes an issue later, add `--since` as a follow-up.
- A first-run `wai init --normalize-now` cleanup pass — the user already ran `wai check --fix` once during plan 1's smoke test; the data repo is canonical.

## File structure

```
cli/src/commands/init.ts            NEW. CLI command (boundary).
cli/src/commands/init-templates.ts  NEW. Embedded template strings.
cli/test/init.test.ts               NEW. Stub-fs tests.
cli/src/index.ts                    MODIFY. Register init subcommand + help.
cli/AGENTS.md                       MODIFY. Add init to Commands table.
```

## Conventions adhered to

- Standalone CLI (no API client) — matches `wai check` and `wai promote-corrections` precedent.
- Dependency injection: `runInit` accepts `readFile`, `writeFile`, `mkdirP`, `exists` so tests don't touch disk.
- Refuses to overwrite existing files without `--force`. Reports what was written and what was skipped.
- Templates embedded as TS string constants (no esbuild config changes).

---

## Task 1: Embedded templates

**Files:**
- Create: `cli/src/commands/init-templates.ts`

- [ ] **Step 1: Write the template module**

Create `cli/src/commands/init-templates.ts`:

```typescript
/**
 * Pre-commit hook script. Calls `wai check` with the format/schema/data
 * categories as blocking (coverage findings are suggestion-only and don't
 * block commits).
 *
 * Bypassable with `git commit --no-verify` per standard git convention.
 */
export const PRE_COMMIT_HOOK = `#!/bin/sh
# Installed by \`wai init\`. Edit freely or remove.
# Bypass with \`git commit --no-verify\`.
exec wai check --fail-on format,schema,data
`;

/**
 * GitHub Actions workflow. Installs the wai CLI from the source repo's
 * cli/ subdir (assumes the user has cloned the dev/whoami code repo
 * alongside their data repo). Adjust the install step if shipping a
 * published @whoami/wai package later.
 */
export const CI_WORKFLOW = `name: Check
on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout data repo
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      # Adjust this section to match how you install \`wai\` in CI.
      # Default assumes a sibling code-repo checkout at ./whoami-code.
      # Replace with \`npm install -g @whoami/wai\` once the package is
      # published, or vendor the cli/dist/wai.cjs into your data repo.
      - name: Checkout wai code repo
        uses: actions/checkout@v4
        with:
          repository: nyetwork/whoami
          path: whoami-code

      - name: Build wai
        working-directory: whoami-code/cli
        run: npm install && npm run build

      - name: Run drift checks
        env:
          WHOAMI_ROOT: \${{ github.workspace }}
        run: node whoami-code/cli/dist/wai.cjs check --fail-on format,schema,data
`;
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-6-wai-init/cli && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-6-wai-init
git add cli/src/commands/init-templates.ts
git commit -m "feat(cli): pre-commit hook + CI workflow templates for wai init"
```

---

## Task 2: `wai init` CLI command + tests

**Files:**
- Create: `cli/src/commands/init.ts`
- Create: `cli/test/init.test.ts`

- [ ] **Step 1: Write failing tests**

Create `cli/test/init.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInit } from '../src/commands/init.js';

interface FakeFs {
  files: Map<string, string>;
  reads: string[];
  writes: Array<{ path: string; content: string }>;
  dirs: Set<string>;
}

function makeFs(initial: Record<string, string> = {}): FakeFs {
  const files = new Map<string, string>(Object.entries(initial));
  const dirs = new Set<string>();
  for (const p of files.keys()) {
    // Mark all parent dirs as existing
    for (let dir = p.split('/').slice(0, -1).join('/'); dir; dir = dir.split('/').slice(0, -1).join('/')) {
      dirs.add(dir);
    }
  }
  return { files, reads: [], writes: [], dirs };
}

function inject(fs: FakeFs) {
  return {
    readFile: (p: string) => {
      fs.reads.push(p);
      const v = fs.files.get(p);
      if (v === undefined) throw new Error(`ENOENT: ${p}`);
      return v;
    },
    writeFile: (p: string, content: string) => {
      fs.writes.push({ path: p, content });
      fs.files.set(p, content);
    },
    mkdirP: (p: string) => { fs.dirs.add(p); },
    exists: (p: string) => fs.files.has(p) || fs.dirs.has(p),
  };
}

test('init: writes both templates to a clean repo', async () => {
  const fs = makeFs({ '/repo/.git/HEAD': 'ref: refs/heads/main' });
  let out = '';
  const code = await runInit({
    rootDir: '/repo',
    force: false,
    hookOnly: false,
    ciOnly: false,
    ...inject(fs),
    write: (s) => { out += s; },
    writeErr: () => {},
  });
  assert.equal(code, 0);
  assert.ok(fs.files.get('/repo/.git/hooks/pre-commit'));
  assert.ok(fs.files.get('/repo/.github/workflows/check.yml'));
  assert.match(out, /pre-commit/);
  assert.match(out, /check\.yml/);
});

test('init: refuses to overwrite an existing hook without --force', async () => {
  const fs = makeFs({
    '/repo/.git/HEAD': 'ref: refs/heads/main',
    '/repo/.git/hooks/pre-commit': '#!/bin/sh\necho preexisting\n',
  });
  let outErr = '';
  const code = await runInit({
    rootDir: '/repo',
    force: false,
    hookOnly: false,
    ciOnly: false,
    ...inject(fs),
    write: () => {},
    writeErr: (s) => { outErr += s; },
  });
  // Hook is skipped; CI workflow still written.
  assert.equal(code, 1);
  assert.equal(fs.files.get('/repo/.git/hooks/pre-commit'), '#!/bin/sh\necho preexisting\n');
  assert.ok(fs.files.get('/repo/.github/workflows/check.yml'));
  assert.match(outErr, /pre-commit.*exists/i);
});

test('init: --force overwrites existing files', async () => {
  const fs = makeFs({
    '/repo/.git/HEAD': 'ref: refs/heads/main',
    '/repo/.git/hooks/pre-commit': 'old',
    '/repo/.github/workflows/check.yml': 'old',
  });
  const code = await runInit({
    rootDir: '/repo',
    force: true,
    hookOnly: false,
    ciOnly: false,
    ...inject(fs),
    write: () => {},
    writeErr: () => {},
  });
  assert.equal(code, 0);
  assert.notEqual(fs.files.get('/repo/.git/hooks/pre-commit'), 'old');
  assert.notEqual(fs.files.get('/repo/.github/workflows/check.yml'), 'old');
});

test('init --hook-only: writes the hook, skips the workflow', async () => {
  const fs = makeFs({ '/repo/.git/HEAD': 'ref: refs/heads/main' });
  const code = await runInit({
    rootDir: '/repo',
    force: false,
    hookOnly: true,
    ciOnly: false,
    ...inject(fs),
    write: () => {},
    writeErr: () => {},
  });
  assert.equal(code, 0);
  assert.ok(fs.files.get('/repo/.git/hooks/pre-commit'));
  assert.equal(fs.files.get('/repo/.github/workflows/check.yml'), undefined);
});

test('init --ci-only: writes the workflow, skips the hook', async () => {
  const fs = makeFs({ '/repo/.git/HEAD': 'ref: refs/heads/main' });
  const code = await runInit({
    rootDir: '/repo',
    force: false,
    hookOnly: false,
    ciOnly: true,
    ...inject(fs),
    write: () => {},
    writeErr: () => {},
  });
  assert.equal(code, 0);
  assert.equal(fs.files.get('/repo/.git/hooks/pre-commit'), undefined);
  assert.ok(fs.files.get('/repo/.github/workflows/check.yml'));
});

test('init: errors if the rootDir is not a git repo', async () => {
  const fs = makeFs({}); // no .git/
  let outErr = '';
  const code = await runInit({
    rootDir: '/repo',
    force: false,
    hookOnly: false,
    ciOnly: false,
    ...inject(fs),
    write: () => {},
    writeErr: (s) => { outErr += s; },
  });
  assert.equal(code, 2);
  assert.match(outErr, /not a git repo|\.git/i);
});

test('init: idempotent — running twice with --force produces the same result', async () => {
  const fs = makeFs({ '/repo/.git/HEAD': 'ref: refs/heads/main' });
  const opts = {
    rootDir: '/repo',
    force: true,
    hookOnly: false,
    ciOnly: false,
    ...inject(fs),
    write: () => {},
    writeErr: () => {},
  };
  await runInit(opts);
  const firstHook = fs.files.get('/repo/.git/hooks/pre-commit');
  const firstCi = fs.files.get('/repo/.github/workflows/check.yml');
  await runInit(opts);
  assert.equal(fs.files.get('/repo/.git/hooks/pre-commit'), firstHook);
  assert.equal(fs.files.get('/repo/.github/workflows/check.yml'), firstCi);
});
```

- [ ] **Step 2: Verify failure**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-6-wai-init/cli && npx tsx --test test/init.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement command**

Create `cli/src/commands/init.ts`:

```typescript
import { join } from 'node:path';
import { PRE_COMMIT_HOOK, CI_WORKFLOW } from './init-templates.js';

export interface InitOptions {
  rootDir: string;
  force: boolean;
  hookOnly: boolean;
  ciOnly: boolean;
  readFile: (path: string) => string;
  writeFile: (path: string, content: string) => void;
  mkdirP: (path: string) => void;
  exists: (path: string) => boolean;
  write: (s: string) => void;
  writeErr: (s: string) => void;
}

interface Target {
  path: string;
  dir: string;
  content: string;
  label: string;
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
      path: join(opts.rootDir, '.git', 'hooks', 'pre-commit'),
      dir: join(opts.rootDir, '.git', 'hooks'),
      content: PRE_COMMIT_HOOK,
      label: 'pre-commit hook',
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
  }

  if (targets.length === 0) {
    opts.writeErr('init: nothing to do (--hook-only and --ci-only both set?)\n');
    return 2;
  }

  return skipped > 0 ? 1 : 0;
}
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-6-wai-init/cli && npx tsx --test test/init.test.ts 2>&1 | tail -8
```

Expected: 7 pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-6-wai-init
git add cli/src/commands/init.ts cli/test/init.test.ts
git commit -m "feat(cli): wai init command with idempotence + --force/--hook-only/--ci-only"
```

---

## Task 3: Wire into `cli/src/index.ts`

**Files:** Modify: `cli/src/index.ts`.

- [ ] **Step 1: Add help block**

Find the `Quality:` help section in the `HELP` constant. After the `promote-corrections` block, add:

```
  init                        Install pre-commit hook + CI workflow into the
                              data repo at $WHOAMI_ROOT.
        [--force]               Overwrite existing files
        [--hook-only]           Just the pre-commit hook
        [--ci-only]             Just the CI workflow
```

- [ ] **Step 2: Add imports + dispatch**

Near the existing `runPromoteCorrections` import, add:

```typescript
import { runInit } from './commands/init.js';
import { mkdirSync } from 'node:fs';
```

(`readFileSync`, `writeFileSync`, and `existsSync` should already be imported from earlier plans — don't duplicate. If `existsSync` is missing, add it.)

In the `switch (args.cmd)` block, add a new case near `promote-corrections`:

```typescript
      case 'init': {
        const root = process.env.WHOAMI_ROOT
          ? resolve(process.env.WHOAMI_ROOT)
          : resolve(process.env.HOME!, 'whoami');
        const code = await runInit({
          rootDir: root,
          force: !!args.flags.force,
          hookOnly: !!args.flags['hook-only'],
          ciOnly: !!args.flags['ci-only'],
          readFile: (p) => readFileSync(p, 'utf-8'),
          writeFile: (p, c) => {
            // Hooks need exec permission; templates embed the shebang.
            writeFileSync(p, c, { mode: 0o755 });
          },
          mkdirP: (p) => { mkdirSync(p, { recursive: true }); },
          exists: (p) => existsSync(p),
          write,
          writeErr: (s) => process.stderr.write(s),
        });
        return code;
      }
```

- [ ] **Step 3: Verify**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-6-wai-init/cli && npm run typecheck && npm run build
```

```bash
node /Users/nyetwork/dev/whoami/.worktrees/plan-6-wai-init/cli/dist/wai.cjs --help | grep -A 5 'init'
```

Expected: shows the init help block.

- [ ] **Step 4: Smoke test against `~/whoami`**

```bash
WHOAMI_ROOT=/Users/nyetwork/whoami node /Users/nyetwork/dev/whoami/.worktrees/plan-6-wai-init/cli/dist/wai.cjs init
```

Expected: writes both files, prints two `wrote …` lines, exit 0.

Verify the files exist:

```bash
ls -l /Users/nyetwork/whoami/.git/hooks/pre-commit /Users/nyetwork/whoami/.github/workflows/check.yml 2>&1 | head
```

Expected: both files present, hook is executable (`-rwxr-xr-x`).

Then run again to confirm refusal-on-clobber:

```bash
WHOAMI_ROOT=/Users/nyetwork/whoami node /Users/nyetwork/dev/whoami/.worktrees/plan-6-wai-init/cli/dist/wai.cjs init
```

Expected: stderr "exists … --force to overwrite" for both, exit 1.

End-to-end verify the hook actually triggers `wai check`:

```bash
cd /Users/nyetwork/whoami && git status > /dev/null  # no-op; verify .git/hooks/pre-commit is in place and executable
cat .git/hooks/pre-commit
```

Then a manual trigger (don't actually commit; just exec the script):

```bash
sh /Users/nyetwork/whoami/.git/hooks/pre-commit 2>&1 | tail
```

Expected: runs `wai check --fail-on format,schema,data`, exits 0 (no findings in those categories on the current canonical state).

- [ ] **Step 5: Commit**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-6-wai-init
git add cli/src/index.ts
git commit -m "feat(cli): register wai init subcommand"
```

---

## Task 4: `cli/AGENTS.md` doc update

**Files:** Modify: `cli/AGENTS.md`.

- [ ] **Step 1: Add `init` to the Commands table**

In `cli/AGENTS.md`, find the Commands table. Add a row at the end (or grouped with other quality commands):

```
| `init`           | Install pre-commit hook + CI workflow into `$WHOAMI_ROOT`. Standalone — does not call the API. |
```

- [ ] **Step 2: Commit**

```bash
cd /Users/nyetwork/dev/whoami/.worktrees/plan-6-wai-init
git add cli/AGENTS.md
git commit -m "docs(cli): document wai init"
```

---

## Self-review checklist

- ✓ Templates embedded as TS string constants (no esbuild config needed).
- ✓ `runInit` is dependency-injected; tests run without disk I/O.
- ✓ Refuses to clobber without `--force`; partial success returns exit 1, full failure returns 2.
- ✓ `--hook-only` and `--ci-only` are mutually exclusive in practice (both set → "nothing to do" exit 2).
- ✓ Hook file is written with `mode: 0o755` so it's executable.
- ✓ CI workflow uses `actions/checkout@v4` + `setup-node@v4` (no deprecated actions).
- ✓ The CI template is best-effort — it assumes a sibling code-repo checkout. Real users will adapt the install step. Comments in the template explain.
- ✓ Tests cover: clean install, partial install (hook-only / ci-only), clobber-refusal, --force overwrite, not-a-git-repo error, idempotence.

## What plan 7 will need

- `wai init` is the entry point users will call once per data repo. Plan 7's editorial-guide skill update can reference `wai init` as the recommended setup.
- The pre-commit hook calls `wai check --fail-on format,schema,data` — plan 7's eval suite can simulate the hook's contract by spawning `wai check` on a staged page.
- If plan 7 wants to ship the hook + workflow as `npx`-installable templates, the `cli/src/commands/init-templates.ts` constants are the source of truth.
