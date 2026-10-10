#!/bin/bash
# Links (or copies) the extensions into Spicetify's config, enables them and applies.
# Safe to run again after a git pull.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
EXTENSIONS=(album-ambience.js comfy-tweaks.js folder-images.js library-hider.js library-moods.js)
AGENT_LABEL="${AUTOHEAL_LABEL:-local.spicetify-autoheal}"
AGENT_PLIST="$HOME/Library/LaunchAgents/$AGENT_LABEL.plist"

use_copies=false
install_autoheal=false
run_apply=true

usage() {
   echo "usage: ./install.sh [--copy] [--autoheal] [--no-apply]"
   echo "  --copy       copy the extensions instead of symlinking them"
   echo "  --autoheal   also install the LaunchAgent that runs tools/autoheal.sh (macOS)"
   echo "  --no-apply   skip spicetify apply at the end"
}

for argument in "$@"; do
   case "$argument" in
      --copy) use_copies=true ;;
      --autoheal) install_autoheal=true ;;
      --no-apply) run_apply=false ;;
      -h|--help) usage; exit 0 ;;
      *) usage >&2; exit 1 ;;
   esac
done

if ! command -v spicetify >/dev/null 2>&1; then
   echo "spicetify isn't on your PATH. Install it from https://spicetify.app and open a new terminal." >&2
   exit 1
fi

# Reading a config field also writes a default config-xpui.ini if there isn't one yet.
enabled_extensions="$(spicetify config extensions)"
CONFIG_DIR="$(dirname "$(spicetify -c)")"
EXTENSIONS_DIR="$CONFIG_DIR/Extensions"
mkdir -p "$EXTENSIONS_DIR"

for extension in "${EXTENSIONS[@]}"; do
   source_file="$REPO_DIR/extensions/$extension"
   target="$EXTENSIONS_DIR/$extension"

   is_our_link=false
   if [[ -L "$target" && "$(readlink "$target")" == "$source_file" ]]; then
      is_our_link=true
   fi

   is_same_copy=false
   if [[ ! -L "$target" && -f "$target" ]] && cmp -s "$source_file" "$target"; then
      is_same_copy=true
   fi

   target_exists=false
   if [[ -e "$target" || -L "$target" ]]; then
      target_exists=true
   fi

   is_other_file=false
   if $target_exists && ! $is_our_link && ! $is_same_copy; then
      is_other_file=true
   fi

   if $is_other_file; then
      mv "$target" "$target.bak"
      echo "Moved the existing $extension to $extension.bak"
   fi

   if $use_copies; then
      if $is_same_copy; then
         echo "$extension is already copied"
      else
         rm -f "$target"
         cp "$source_file" "$target"
         echo "Copied $extension"
      fi
   else
      if $is_our_link; then
         echo "$extension is already linked"
      else
         rm -f "$target"
         ln -s "$source_file" "$target"
         echo "Linked $extension"
      fi
   fi

   if grep -qxF "$extension" <<< "$enabled_extensions"; then
      echo "$extension is already enabled"
   else
      spicetify config extensions "$extension" >/dev/null
      echo "Enabled $extension"
   fi
done

if $install_autoheal; then
   if [[ "$(uname)" != "Darwin" ]]; then
      echo "The auto-heal LaunchAgent only works on macOS." >&2
      exit 1
   fi

   spotify_resources="$(spicetify config spotify_path)"
   spotify_app="${spotify_resources%/}"
   spotify_app="${spotify_app%/Contents/Resources}"

   if [[ "$spotify_app" != *.app ]]; then
      spotify_app="/Applications/Spotify.app"
   fi

   mkdir -p "$(dirname "$AGENT_PLIST")"
   chmod +x "$REPO_DIR/tools/autoheal.sh"

   sed -e "s|__LABEL__|$AGENT_LABEL|g" \
      -e "s|__SCRIPT__|$REPO_DIR/tools/autoheal.sh|g" \
      -e "s|__LOG__|$REPO_DIR/tools/autoheal.log|g" \
      -e "s|__HOME__|$HOME|g" \
      -e "s|__SPOTIFY_APP__|$spotify_app|g" \
      "$REPO_DIR/tools/autoheal.plist.template" > "$AGENT_PLIST"

   plutil -lint "$AGENT_PLIST" >/dev/null
   launchctl bootout "gui/$(id -u)/$AGENT_LABEL" 2>/dev/null || true
   launchctl bootstrap "gui/$(id -u)" "$AGENT_PLIST"
   echo "Loaded the LaunchAgent $AGENT_LABEL from $AGENT_PLIST"
fi

if $run_apply; then
   echo "Running spicetify apply, which restarts Spotify"
   spicetify apply
else
   echo "Skipped spicetify apply. Run it yourself to load the extensions."
fi
