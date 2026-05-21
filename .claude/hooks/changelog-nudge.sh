#!/bin/bash
# changelog-nudge: enforce the CHANGELOG-with-commit discipline
# (CLAUDE.md "Commit hygiene" rule).
#
# Behavior depends on the commit-message subject:
#
# - `feat:` / `feat(scope):` / `fix:` / `fix(scope):` subject — user-visible
#   commit. CHANGELOG.md MUST be staged. If it isn't, BLOCK the commit
#   (PreToolUse permissionDecision: deny). Add the [Unreleased] entry first.
#
# - Any other prefix (`chore:`, `refactor:`, `docs:`, `test:`, `release:`)
#   — exempt from the hard rule. Fall back to the soft warning so the
#   reader is reminded but the commit lands.
#
# - When the commit message can't be extracted from the command (editor
#   buffer, `-F file`, complex quoting) — fall back to the soft warning,
#   not the block, to avoid false positives.

set -e

input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // ""')

# React only to `git commit`. Skip --amend / --allow-empty.
if ! echo "$cmd" | grep -qE '\bgit[[:space:]]+(-[^[:space:]]+[[:space:]]+)*commit\b'; then
  exit 0
fi
if echo "$cmd" | grep -qE '\-\-amend|\-\-allow-empty'; then
  exit 0
fi

# Inspect the code repo. Bail silently if not in a git repo.
staged=$(git diff --cached --name-only 2>/dev/null) || exit 0
[ -z "$staged" ] && exit 0

# "Code-ish" paths whose changes typically warrant a CHANGELOG entry.
code_staged=$(echo "$staged" | grep -E '^(cli/src/|core/src/|frontend/(app|components|lib|next\.config)|plugins/whoami/(agents|skills)/)' || true)
[ -z "$code_staged" ] && exit 0

# CHANGELOG.md already staged? All good.
if echo "$staged" | grep -q '^CHANGELOG\.md$'; then
  exit 0
fi

# Try to extract the commit-message subject line from the command. Looks
# at the first argument to -m / --message / --message= and takes its
# first non-blank line. Best-effort; if we can't find one, we fall back
# to the soft-warn path so editor-buffer / -F file commits aren't
# blocked.
subject=$(echo "$cmd" | python3 -c '
import sys, shlex
cmd = sys.stdin.read()
try:
    parts = shlex.split(cmd)
except ValueError:
    print("")
    sys.exit(0)
msg = ""
i = 0
while i < len(parts):
    p = parts[i]
    if p in ("-m", "--message") and i + 1 < len(parts):
        msg = parts[i + 1]
        break
    if p.startswith("--message="):
        msg = p[len("--message="):]
        break
    i += 1
for line in msg.splitlines():
    if line.strip():
        print(line)
        break
' 2>/dev/null || true)

# Show up to 8 staged files for context.
preview=$(echo "$staged" | head -8 | sed 's/^/  - /')

# User-visible prefix → HARD BLOCK if CHANGELOG missing.
if echo "$subject" | grep -qE '^(feat|fix)(\([^)]+\))?:'; then
  jq -n --arg files "$preview" --arg subj "$subject" '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": ("CHANGELOG-with-commit discipline (CLAUDE.md \"Commit hygiene\" rule): a feat/fix commit MUST include the CHANGELOG entry in the same commit. Subject:\n  " + $subj + "\n\nStaged code files:\n" + $files + "\n\nFIX: add an entry under `## [Unreleased]` of CHANGELOG.md describing the user-visible change, then `git add CHANGELOG.md` and retry the commit. If this commit truly has no user-facing change, retitle the subject with chore: / refactor: / docs: / test: instead — those prefixes are exempt.")
    }
  }'
  exit 0
fi

# Other prefix (chore/refactor/docs/test/release) or unparseable message
# → soft warn, don't block.
jq -n --arg files "$preview" '{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": ("Heads up: code files are staged but CHANGELOG.md is not. Per AGENTS.md, feat/fix commits MUST include a CHANGELOG entry (this hook enforces it). Staged:\n" + $files + "\n\nThis commit appears to be chore/refactor/docs/test/release — exempt from the hard rule. If it actually is user-visible, switch the subject to feat:/fix: and add the entry first.")
  }
}'
exit 0
