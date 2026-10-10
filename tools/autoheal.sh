#!/bin/bash
# Re-applies Spicetify after a Spotify update replaces the app files.
# Run by the LaunchAgent from install.sh --autoheal, or by hand. See the README.

set -u

export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin"

SPICETIFY_CONFIG_DIR="${SPICETIFY_CONFIG:-${XDG_CONFIG_HOME:-$HOME/.config}/spicetify}"
SPICETIFY_CONFIG_FILE="$SPICETIFY_CONFIG_DIR/config-xpui.ini"
SPICETIFY="$(command -v spicetify || echo "$HOME/.spicetify/spicetify")"

configured_resources=$(awk -F "=" '$1 ~ /^[ \t]*spotify_path[ \t]*$/ { gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2 }' "$SPICETIFY_CONFIG_FILE" 2>/dev/null)
SPOTIFY_APP="${configured_resources%/}"
SPOTIFY_APP="${SPOTIFY_APP%/Contents/Resources}"

if [[ "$SPOTIFY_APP" != *.app ]]; then
   SPOTIFY_APP="/Applications/Spotify.app"
fi

SPOTIFY_BINARY="$SPOTIFY_APP/Contents/MacOS/Spotify"
SPOTIFY_PLIST="$SPOTIFY_APP/Contents/Info.plist"
APPS_DIR="$SPOTIFY_APP/Contents/Resources/Apps"
SPOTIFY_PREFS="$HOME/Library/Application Support/Spotify/prefs"

TOOLS_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$TOOLS_DIR/autoheal.log"
STATE_FILE="$TOOLS_DIR/autoheal.state"
LOCK_DIR="$TOOLS_DIR/autoheal.lock"
LOCAL_HOOK="$TOOLS_DIR/autoheal.local.sh"

MAX_ATTEMPTS_PER_VERSION=3
LOG_LINES_KEPT=500
STABLE_SAMPLE_SECONDS=30
STABLE_WAIT_LIMIT_SECONDS=900
PREFS_SYNC_LIMIT_SECONDS=90
SPICETIFY_TIMEOUT_SECONDS=600
STALE_EMPTY_LOCK_SECONDS=120

owns_lock=false
spotify_was_running=false

log() {
   printf "%s  %s\n" "$(date "+%Y-%m-%d %H:%M:%S")" "$*" >> "$LOG_FILE"
}

notify() {
   osascript -e "display notification \"$1\" with title \"Spotify auto-heal\"" >/dev/null 2>&1
}

# shellcheck disable=SC2329
trim_log() {
   [[ -f "$LOG_FILE" ]] || return 0

   local line_count
   line_count=$(wc -l < "$LOG_FILE" | tr -d " ")

   if (( line_count > LOG_LINES_KEPT )); then
      tail -n "$LOG_LINES_KEPT" "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
   fi
}

acquire_lock() {
   if mkdir "$LOCK_DIR" 2>/dev/null; then
      echo "$$" > "$LOCK_DIR/pid"
      owns_lock=true
      return 0
   fi

   local holder_pid
   holder_pid=$(cat "$LOCK_DIR/pid" 2>/dev/null)

   local lock_age=$(( $(date +%s) - $(stat -f %m "$LOCK_DIR" 2>/dev/null || date +%s) ))

   local has_holder_pid=false
   [[ -n "$holder_pid" ]] && has_holder_pid=true

   local holder_is_gone=false
   if $has_holder_pid && ! kill -0 "$holder_pid" 2>/dev/null; then
      holder_is_gone=true
   fi

   local empty_lock_is_old=false
   if ! $has_holder_pid && (( lock_age > STALE_EMPTY_LOCK_SECONDS )); then
      empty_lock_is_old=true
   fi

   local lock_is_stale=false
   if $holder_is_gone || $empty_lock_is_old; then
      lock_is_stale=true
   fi

   if ! $lock_is_stale; then
      return 1
   fi

   log "Removing stale lock left by pid ${holder_pid:-unknown}"
   rm -rf "$LOCK_DIR"

   if mkdir "$LOCK_DIR" 2>/dev/null; then
      echo "$$" > "$LOCK_DIR/pid"
      owns_lock=true
      return 0
   fi

   return 1
}

# shellcheck disable=SC2329
on_exit() {
   if $owns_lock; then
      rm -rf "$LOCK_DIR"
   fi

   trim_log
}

strip_build_hash() {
   sed -E "s/\.g[0-9a-f]+$//"
}

installed_version() {
   plutil -extract CFBundleShortVersionString raw -o - "$SPOTIFY_PLIST" 2>/dev/null | strip_build_hash
}

spicetify_backup_version() {
   awk -F "=" '
      /^\[/ { in_backup = ($0 ~ /^\[Backup\]/); next }
      in_backup && $1 ~ /^[ \t]*version[ \t]*$/ { gsub(/[ \t]/, "", $2); print $2 }
   ' "$SPICETIFY_CONFIG_FILE" 2>/dev/null | strip_build_hash
}

prefs_version() {
   sed -n 's/^app\.last-launched-version="\(.*\)"$/\1/p' "$SPOTIFY_PREFS" 2>/dev/null | strip_build_hash
}

spotify_installed() {
   [[ -x "$SPOTIFY_BINARY" && -f "$SPOTIFY_PLIST" && -d "$APPS_DIR" ]]
}

spotify_running() {
   pgrep -x Spotify >/dev/null 2>&1
}

# Same rule Spicetify uses. Only .spa files is stock, only folders is applied, both is mixed.
apps_state() {
   local spa_count dir_count
   spa_count=$(find "$APPS_DIR" -mindepth 1 -maxdepth 1 -type f -name "*.spa" | wc -l | tr -d " ")
   dir_count=$(find "$APPS_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d " ")

   local has_spa=false
   local has_dir=false
   (( spa_count > 0 )) && has_spa=true
   (( dir_count > 0 )) && has_dir=true

   if $has_spa && $has_dir; then
      echo "mixed"
   elif $has_spa; then
      echo "stock"
   elif $has_dir; then
      echo "applied"
   else
      echo "invalid"
   fi
}

spicetify_injected() {
   [[ -f "$APPS_DIR/xpui/index.html" ]] && grep -qF "spicetifyWrapper.js" "$APPS_DIR/xpui/index.html"
}

spicetify_backup_matches() {
   local version="$1"
   local backup_version
   backup_version=$(spicetify_backup_version)

   [[ -n "$backup_version" && "$backup_version" == "$version" ]]
}

spicetify_healthy() {
   local version="$1"
   spicetify_injected && spicetify_backup_matches "$version"
}

describe_health() {
   local version="$1"
   local injected_text="missing"
   local hook_text

   spicetify_injected && injected_text="present"
   hook_text=$(local_describe_health)

   echo "Spicetify injection $injected_text, Spicetify backup $(spicetify_backup_version || true) vs installed $version, Apps $(apps_state)${hook_text:+, $hook_text}"
}

fully_healthy() {
   spicetify_healthy "$1" && local_is_healthy
}

attempts_for() {
   local version="$1"
   local saved_version=""
   local saved_attempts=""

   if [[ -f "$STATE_FILE" ]]; then
      read -r saved_version saved_attempts < "$STATE_FILE"
   fi

   if [[ "$saved_version" == "$version" && "$saved_attempts" =~ ^[0-9]+$ ]]; then
      echo "$saved_attempts"
   else
      echo 0
   fi
}

record_attempt() {
   echo "$1 $2" > "$STATE_FILE"
}

clear_attempts() {
   rm -f "$STATE_FILE"
}

bundle_fingerprint() {
   find "$SPOTIFY_APP" -maxdepth 4 -exec stat -f "%N %m %z" {} + 2>/dev/null | shasum | cut -d " " -f 1
}

wait_for_stable_bundle() {
   local waited=0
   local previous current
   previous=$(bundle_fingerprint)

   while (( waited < STABLE_WAIT_LIMIT_SECONDS )); do
      sleep "$STABLE_SAMPLE_SECONDS"
      waited=$(( waited + STABLE_SAMPLE_SECONDS ))
      current=$(bundle_fingerprint)

      local bundle_unchanged=false
      [[ "$current" == "$previous" ]] && bundle_unchanged=true

      if $bundle_unchanged && spotify_installed; then
         return 0
      fi

      log "Spotify bundle is still changing, waiting"
      previous="$current"
   done

   return 1
}

# Spicetify labels its backup with the version in Spotify's prefs, which lags behind an update until Spotify launches once.
sync_prefs_version() {
   local version="$1"

   if [[ "$(prefs_version)" == "$version" ]]; then
      return 0
   fi

   log "Spotify prefs still say $(prefs_version), launching Spotify once so they record $version"
   open -g -a "$SPOTIFY_APP"

   local waited=0
   while (( waited < PREFS_SYNC_LIMIT_SECONDS )); do
      sleep 5
      waited=$(( waited + 5 ))

      if [[ "$(prefs_version)" == "$version" ]]; then
         return 0
      fi
   done

   osascript -e 'quit app "Spotify"' >/dev/null 2>&1
   sleep 10

   [[ "$(prefs_version)" == "$version" ]]
}

# Returns the command's exit status, or 124 if it ran past limit_seconds.
run_logged() {
   local limit_seconds="$1"
   shift

   log "Running: $*"

   (
      "$@" </dev/null 2>&1 | perl -MPOSIX -ne '
         s/\e\[[0-9;?]*[A-Za-z]//g;
         for my $line (split /\r|\n/) {
            next unless $line =~ /\S/;
            next if $line =~ /Patching files \[\d+\/\d+\]/;
            next if $line =~ /^\s*[-\\|\/] \S/;
            print strftime("%Y-%m-%d %H:%M:%S", localtime), "  | ", $line, "\n";
         }
      ' >> "$LOG_FILE"
      exit "${PIPESTATUS[0]}"
   ) &
   local runner_pid=$!
   local waited=0

   while kill -0 "$runner_pid" 2>/dev/null; do
      if (( waited >= limit_seconds )); then
         log "Timed out after ${limit_seconds}s, stopping: $*"
         pkill -TERM -P "$runner_pid" 2>/dev/null
         sleep 5
         pkill -KILL -P "$runner_pid" 2>/dev/null
         wait "$runner_pid" 2>/dev/null
         return 124
      fi

      sleep 2
      waited=$(( waited + 2 ))
   done

   wait "$runner_pid"
   local exit_status=$?

   log "Exit status $exit_status: $1"
   return "$exit_status"
}

# Always -n, so Spotify can't relaunch in the middle of a repair.
run_spicetify() {
   run_logged "$SPICETIFY_TIMEOUT_SECONDS" "$SPICETIFY" -n "$@"
}

restart_spotify_if_it_was_running() {
   if ! $spotify_was_running; then
      return 0
   fi

   pkill -x Spotify 2>/dev/null
   local waited=0

   while spotify_running && (( waited < 20 )); do
      sleep 1
      waited=$(( waited + 1 ))
   done

   open -a "$SPOTIFY_APP"
   log "Restarted Spotify"
}

apply_spicetify() {
   local state
   state=$(apps_state)

   case "$state" in
      stock|mixed)
         run_spicetify backup apply
         ;;
      applied)
         run_spicetify restore backup apply
         ;;
      *)
         log "Apps folder is empty, Spotify needs a reinstall"
         return 1
         ;;
   esac
}

# Spicetify 2.45.1's version check runs its scroll optimizer on Spotify 1.3.x. Fixed upstream, not released yet.
patch_scroll_optimizer_check() {
   local buggy_check='if(e[1]>=2&&e[2]>=57)return;'
   local fixed_check='if(e[1]==2\&\&e[2]>=57||e[1]>2)return;'
   local wrapper

   for wrapper in "$HOME/.spicetify/jsHelper/spicetifyWrapper.js" "$APPS_DIR/xpui/helper/spicetifyWrapper.js"; do
      if [[ -f "$wrapper" ]] && grep -qF "$buggy_check" "$wrapper"; then
         sed -i '' "s/if(e\[1\]>=2&&e\[2\]>=57)return;/$fixed_check/" "$wrapper"
         log "Patched the scroll optimizer version check in $wrapper"
      fi
   done
}

repair_from_stock_client() {
   local state
   state=$(apps_state)

   if [[ "$state" == "invalid" ]]; then
      log "Apps folder is empty, Spotify needs a reinstall"
      return 1
   fi

   if [[ "$state" == "applied" ]]; then
      run_logged "$SPICETIFY_TIMEOUT_SECONDS" "$SPICETIFY" -n restore || return 1
   fi

   local_patch_stock_client || return 1
   apply_spicetify
}

# Defaults for the optional tools/autoheal.local.sh, which can redefine any of them.
local_is_healthy() {
   return 0
}

local_describe_health() {
   return 0
}

local_needs_stock_client() {
   return 1
}

local_patch_stock_client() {
   return 0
}

local_after_apply() {
   return 0
}

LOCAL_REPAIR_NAME="local patch"

main() {
   if [[ -f "$LOCAL_HOOK" ]]; then
      # shellcheck source=/dev/null
      source "$LOCAL_HOOK"
   fi

   if ! acquire_lock; then
      log "Another run holds the lock, exiting"
      exit 0
   fi

   trap on_exit EXIT

   if ! spotify_installed; then
      log "Spotify not found at $SPOTIFY_APP, nothing to do"
      exit 0
   fi

   local version
   version=$(installed_version)

   patch_scroll_optimizer_check

   if fully_healthy "$version"; then
      log "Healthy: Spotify $version, Spicetify applied with matching backup"
      clear_attempts
      exit 0
   fi

   log "Unhealthy: $(describe_health "$version")"

   local attempts
   attempts=$(attempts_for "$version")

   if (( attempts >= MAX_ATTEMPTS_PER_VERSION )); then
      log "Skipping: already failed $attempts times on Spotify $version"
      exit 0
   fi

   if ! wait_for_stable_bundle; then
      log "Spotify bundle kept changing for ${STABLE_WAIT_LIMIT_SECONDS}s, leaving it for the next run"
      exit 0
   fi

   version=$(installed_version)

   if fully_healthy "$version"; then
      log "Healthy after waiting: Spotify $version"
      clear_attempts
      exit 0
   fi

   attempts=$(attempts_for "$version")

   if (( attempts >= MAX_ATTEMPTS_PER_VERSION )); then
      log "Skipping: already failed $attempts times on Spotify $version"
      exit 0
   fi

   attempts=$(( attempts + 1 ))
   record_attempt "$version" "$attempts"
   log "Repair attempt $attempts of $MAX_ATTEMPTS_PER_VERSION for Spotify $version"

   spotify_running && spotify_was_running=true

   if ! sync_prefs_version "$version"; then
      log "Warning: Spotify prefs still report $(prefs_version), the Spicetify backup may be labelled with the old version"
   fi

   local repaired_what="Spicetify"

   if local_needs_stock_client; then
      repaired_what="$LOCAL_REPAIR_NAME and Spicetify"
      repair_from_stock_client
   else
      apply_spicetify
   fi

   local_after_apply
   restart_spotify_if_it_was_running

   if fully_healthy "$version"; then
      log "Repaired $repaired_what on Spotify $version"
      clear_attempts
      notify "Reapplied $repaired_what to Spotify $version"
      exit 0
   fi

   log "Repair failed: $(describe_health "$version")"

   if (( attempts >= MAX_ATTEMPTS_PER_VERSION )); then
      notify "Repair failed $attempts times on Spotify $version, giving up until the version changes. See tools/autoheal.log"
   else
      notify "Repair attempt $attempts failed on Spotify $version. See tools/autoheal.log"
   fi

   exit 1
}

main "$@"
