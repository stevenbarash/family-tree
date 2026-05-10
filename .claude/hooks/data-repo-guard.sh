#!/bin/bash
# data-repo-guard: blocks git WRITE operations against $WHOAMI_ROOT (the
# user's data repo) when invoked from a Claude Code session in this code
# repo. Per AGENTS.md: "the data repo is separate; changes there should
# be committed there." Reads the bash command on stdin (Claude Code hook
# input JSON) and refuses if the command is a git write subcommand AND
# references a path under the data repo.
#
# Catches the common case: `cd <data-repo> && git commit ...` or
# `git -C <data-repo> commit ...` issued from one tool call. Does NOT
# catch the case where a previous `cd` set the persistent shell cwd —
# that's a known gap; the user can spot it in transcript review.

set -e

input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // ""')

# Only inspect git write subcommands. Read-only ops (status, log, diff,
# show, etc.) are fine against any repo. Match `git` followed (within the
# same shell command — no pipe / && / ; / |) by a write keyword. Permissive
# enough to handle `git -C <path> commit` and `git --no-pager push` without
# trying to parse argv properly in bash.
if ! echo "$cmd" | grep -qE '\bgit\b[^&|;]*\b(commit|push|add|rm|reset|checkout|restore|clean|branch|merge|rebase|tag|stash|cherry-pick|revert|am|apply)\b'; then
  exit 0
fi

# Resolve the data-repo path. Match env.ts logic: WHOAMI_ROOT or ~/whoami.
data_root="${WHOAMI_ROOT:-$HOME/whoami}"
# Strip trailing slash for clean matching.
data_root="${data_root%/}"

# Match the data-repo path ONLY when it appears as a git target — i.e.
# preceded by `cd ` or by git's `-C ` flag. Matching it anywhere in the
# command string (e.g. inside a quoted commit message that mentions the
# path) produces noisy false positives.
data_basename=$(basename "$data_root")
data_root_re=$(printf '%s' "$data_root" | sed 's/[][\.|$(){}?+*^]/\\&/g')

if echo "$cmd" | grep -qE "(\bcd[[:space:]]+|-C[[:space:]]+)(${data_root_re}|~/${data_basename})(/|\b)"; then
  jq -n --arg dir "$data_root" '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": ("blocked: git write to " + $dir + " (the data repo). Per AGENTS.md, the data repo is separate from this code repo and changes there should be committed in their own session. If this is intentional, run the command yourself in the user shell.")
    }
  }'
fi
exit 0
