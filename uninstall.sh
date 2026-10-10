#!/bin/bash
# Disables and removes the extensions that install.sh added, plus the LaunchAgent if there is one.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
EXTENSIONS=(album-ambience.js comfy-tweaks.js folder-images.js library-hider.js library-moods.js)
AGENT_LABEL="${AUTOHEAL_LABEL:-local.spicetify-autoheal}"
AGENT_PLIST="$HOME/Library/LaunchAgents/$AGENT_LABEL.plist"

run_apply=true

for argument in "$@"; do
   case "$argument" in
      --no-apply) run_apply=false ;;
      -h|--help) echo "usage: ./uninstall.sh [--no-apply]"; exit 0 ;;
      *) echo "usage: ./uninstall.sh [--no-apply]" >&2; exit 1 ;;
   esac
done

if ! command -v spicetify >/dev/null 2>&1; then
   echo "spicetify isn't on your PATH, so there's nothing to uninstall from." >&2
   exit 1
fi

enabled_extensions="$(spicetify config extensions)"
EXTENSIONS_DIR="$(dirname "$(spicetify -c)")/Extensions"

for extension in "${EXTENSIONS[@]}"; do
   source_file="$REPO_DIR/extensions/$extension"
   target="$EXTENSIONS_DIR/$extension"

   if grep -qxF "$extension" <<< "$enabled_extensions"; then
      spicetify config extensions "$extension-" >/dev/null
      echo "Disabled $extension"
   fi

   is_our_link=false
   if [[ -L "$target" && "$(readlink "$target")" == "$source_file" ]]; then
      is_our_link=true
   fi

   is_our_copy=false
   if [[ ! -L "$target" && -f "$target" ]] && cmp -s "$source_file" "$target"; then
      is_our_copy=true
   fi

   is_ours=false
   if $is_our_link || $is_our_copy; then
      is_ours=true
   fi

   if $is_ours; then
      rm "$target"
      echo "Removed $target"
   elif [[ -e "$target" ]]; then
      echo "Left $target alone because it isn't the copy from this repo"
   fi
done

if [[ -f "$AGENT_PLIST" ]]; then
   launchctl bootout "gui/$(id -u)/$AGENT_LABEL" 2>/dev/null || true
   rm "$AGENT_PLIST"
   echo "Removed the LaunchAgent $AGENT_LABEL"
fi

if $run_apply; then
   echo "Running spicetify apply, which restarts Spotify"
   spicetify apply
else
   echo "Skipped spicetify apply. Run it yourself to unload the extensions."
fi
