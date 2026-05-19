#!/usr/bin/env bash
#
# tools/backfill-talk-i18n.sh — bulk-translate every editorial EN talk
# page into ru/uk/he.
#
# For each pair (slug, locale) where:
#   - pages/en/<slug>.talk.md EXISTS
#   - pages/{locale}/<slug>.talk.md is MISSING
#   - pages/{locale}/<slug>.md EXISTS (anchor for --talk-only)
# runs `wai i18n sync <slug> <locale> --talk-only` (one talk-translator
# model call per pair). Skips pairs already translated, so the script is
# resumable — kill and restart, it'll pick up where it left off.
#
# Order: slug-by-slug, locales (ru, uk, he) inner. So (aidele,ru) →
# (aidele,uk) → (aidele,he) → (asya-goltsman,ru) → … — a subject's
# three localizations land in adjacent runs for tidy incremental commits.
#
# Usage:
#   tools/backfill-talk-i18n.sh                       # full run
#   tools/backfill-talk-i18n.sh --dry-run             # list what would run
#   tools/backfill-talk-i18n.sh --start-from <slug>   # resume from a slug
#   tools/backfill-talk-i18n.sh --locale ru           # one locale only
#   tools/backfill-talk-i18n.sh --limit 5             # cap at N syncs
#
# Logs to tools/backfill-talk-i18n.log with timestamps. Long-running —
# launch under tmux or nohup:
#
#   tmux new -s backfill 'tools/backfill-talk-i18n.sh'
#   # detach: Ctrl-b d ; reattach: tmux attach -t backfill
#
# Or:
#   nohup tools/backfill-talk-i18n.sh > /dev/null 2>&1 &
#   tail -f tools/backfill-talk-i18n.log
#
# Bash 3.2 / BSD-find compatible (works on stock macOS).

set -uo pipefail

DRY_RUN=0
START_FROM=""
LIMIT=0
SINGLE_LOCALE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --start-from) START_FROM="$2"; shift 2 ;;
    --locale) SINGLE_LOCALE="$2"; shift 2 ;;
    --limit) LIMIT="$2"; shift 2 ;;
    -h|--help) sed -n '3,38p' "$0"; exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

WHOAMI_ROOT="${WHOAMI_ROOT:-$HOME/whoami}"
if [ ! -d "$WHOAMI_ROOT/pages/en" ]; then
  echo "error: $WHOAMI_ROOT/pages/en not found — set WHOAMI_ROOT or check your data repo" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$SCRIPT_DIR/backfill-talk-i18n.log"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG_FILE"
}

if [ -n "$SINGLE_LOCALE" ]; then
  LOCALES="$SINGLE_LOCALE"
else
  LOCALES="ru uk he"
fi

# Build the (slug, locale) work list into a tempfile. BSD-find safe: use
# `-name` + portable `basename` instead of `find -printf`.
WORK_TMP="$(mktemp -t backfill-talk-XXXXXX)"
trap 'rm -f "$WORK_TMP"' EXIT

total_candidates=0
todo_count=0
skipped_no_article=0
already_done=0

for talkpath in "$WHOAMI_ROOT"/pages/en/*.talk.md; do
  [ -e "$talkpath" ] || continue  # nullglob-equivalent for empty match
  slug="$(basename "$talkpath" .talk.md)"
  if [ -n "$START_FROM" ] && [ "$slug" \< "$START_FROM" ]; then
    continue
  fi
  for locale in $LOCALES; do
    total_candidates=$((total_candidates + 1))
    target_talk="$WHOAMI_ROOT/pages/$locale/$slug.talk.md"
    article="$WHOAMI_ROOT/pages/$locale/$slug.md"
    if [ -f "$target_talk" ]; then
      already_done=$((already_done + 1))
      continue
    fi
    if [ ! -f "$article" ]; then
      skipped_no_article=$((skipped_no_article + 1))
      log "skip: $slug/$locale — no article translation (run a full wai i18n sync first)"
      continue
    fi
    echo "$slug $locale" >> "$WORK_TMP"
    todo_count=$((todo_count + 1))
  done
done

log "backfill-talk-i18n: $todo_count pairs todo / $already_done already-done / $skipped_no_article skipped-no-article / $total_candidates candidates"

if [ $DRY_RUN -eq 1 ]; then
  while read slug locale; do
    log "DRY: would run wai i18n sync $slug $locale --talk-only"
  done < "$WORK_TMP"
  log "dry-run complete; no model calls made"
  exit 0
fi

done_count=0
fail_count=0
start_ts=$(date +%s)

while read slug locale; do
  if [ $LIMIT -gt 0 ] && [ $done_count -ge $LIMIT ]; then
    log "limit reached ($LIMIT); stopping"
    break
  fi
  done_count=$((done_count + 1))
  log "[$done_count/$todo_count] sync $slug $locale --talk-only"
  if ! WHOAMI_ROOT="$WHOAMI_ROOT" wai i18n sync "$slug" "$locale" --talk-only 2>&1 | tee -a "$LOG_FILE"; then
    fail_count=$((fail_count + 1))
    log "  FAILED: $slug $locale (continuing)"
  fi
done < "$WORK_TMP"

end_ts=$(date +%s)
elapsed=$((end_ts - start_ts))
log "done. $done_count attempted, $fail_count failed, ${elapsed}s wall-clock"
