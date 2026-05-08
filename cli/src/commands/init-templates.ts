/**
 * Pre-commit hook script. Calls `wai check` with the format/schema/data
 * categories as blocking (coverage findings are suggestion-only and don't
 * block commits).
 *
 * The hook is graceful: skips with a warning to stderr and exits 0 when
 * `wai` is not on PATH OR when the installed `wai` predates drift-prevention
 * (no `check` subcommand). This avoids blocking commits on fresh clones or
 * stale CLI installs.
 *
 * Bypassable with `git commit --no-verify` per standard git convention.
 */
export const PRE_COMMIT_HOOK = `#!/bin/sh
# Installed by \`wai init\` (drift-prevention plan 6).
# Tracked at .githooks/pre-commit; activated via \`git config core.hooksPath .githooks\`.
# Bypass with \`git commit --no-verify\`.

# Skip silently when \`wai\` is not on PATH or doesn't support \`check\`
# (e.g., fresh clone, or an older CLI version pre-dating drift-prevention).
if ! command -v wai >/dev/null 2>&1; then
  echo "pre-commit: wai not on PATH; skipping drift check" >&2
  echo "(install: cd <whoami-code>/cli && npm install && npm run build, then add dist/ to PATH)" >&2
  exit 0
fi
if ! wai --help 2>&1 | grep -q '^[[:space:]]*check'; then
  echo "pre-commit: \\\`wai check\\\` not supported by this CLI version; skipping" >&2
  echo "(rebuild: cd <whoami-code>/cli && npm run build)" >&2
  exit 0
fi

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
