#!/bin/sh
# shellcheck disable=SC2034
# Restarts Spotify with the DevTools protocol on localhost:9222 so tools/cdp.mjs and tools/shot.mjs can reach it.
# A normal quit and reopen closes the port again.

osascript -e 'quit app "Spotify"'

for attempt in $(seq 1 20); do
   pgrep -x Spotify >/dev/null || break
   sleep 0.5
done

open -a Spotify --args --remote-debugging-port=9222

for attempt in $(seq 1 40); do
   curl -s localhost:9222/json | grep -q xpui && break
   sleep 0.5
done

curl -s localhost:9222/json | grep -q xpui && echo "Spotify debug port ready on 9222" || echo "Spotify did not expose the debug port"
