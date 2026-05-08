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
