#!/bin/bash
# changelog-nudge: when about to `git commit` with code files staged but
# CHANGELOG.md NOT staged, inject a reminder. Soft warning, not a block.
# Per AGENTS.md, every code change adds a line under [Unreleased].
#
# Detects "code is being committed" by inspecting the staged set, not by
# parsing the commit message — more robust against HEREDOC bodies and
# multi-line -m strings.

set -e

input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // ""')

# React only to `git commit`. Skip --amend (rewriting an existing commit
# that presumably already had its changelog accounted for) and --allow-empty
# (no diff to describe).
if ! echo "$cmd" | grep -qE '\bgit[[:space:]]+(-[^[:space:]]+[[:space:]]+)*commit\b'; then
  exit 0
fi
if echo "$cmd" | grep -qE '\-\-amend|\-\-allow-empty'; then
  exit 0
fi

# Inspect the code repo (the cwd the harness invoked us from). If we're
# not inside a git repo, bail silently.
staged=$(git diff --cached --name-only 2>/dev/null) || exit 0
[ -z "$staged" ] && exit 0

# "Code-ish" paths whose changes typically warrant a CHANGELOG entry.
# Exclude tests (no user-facing change) and docs (often the changelog itself).
code_staged=$(echo "$staged" | grep -E '^(cli/src/|core/src/|frontend/(app|components|lib|next\.config)|plugins/whoami/src/)' || true)
[ -z "$code_staged" ] && exit 0

if echo "$staged" | grep -q '^CHANGELOG\.md$'; then
  exit 0
fi

# Show up to 8 staged files in the nudge so the reader has context.
preview=$(echo "$staged" | head -8 | sed 's/^/  - /')
jq -n --arg files "$preview" '{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": ("Heads up: code files are staged but CHANGELOG.md is not. Per AGENTS.md (\"every PR adds a line under ## [Unreleased]\"), feat/fix commits should usually include a CHANGELOG entry. Staged:\n" + $files + "\n\nIgnore this if it is a chore/refactor/test commit with no user-facing change. Otherwise add an entry under [Unreleased] before committing.")
  }
}'
exit 0
