(function arsked() {
   const core = (function createCore() {
      const READY_POLL_MS = 100;

      const pendingStarts = [];
      const bodyListeners = [];
      const headListeners = [];
      const rootListeners = [];
      const routeListeners = [];
      const playerListeners = new Map();
      const exports = {};
      let readyTimer = null;
      let isRouteHooked = false;

      function runSafely(label, callback, ...args) {
         try {
            callback(...args);
         } catch (error) {
            console.error(`[arsked] ${label}`, error);
         }
      }

      function checkReady(label, isReady) {
         try {
            return Boolean(isReady());
         } catch (error) {
            console.error(`[arsked] ${label} readiness`, error);
            return null;
         }
      }

      function armReadyTimer() {
         const hasPending = pendingStarts.length > 0;

         if (readyTimer === null && hasPending) {
            readyTimer = setTimeout(drainPendingStarts, READY_POLL_MS);
         }
      }

      function drainPendingStarts() {
         readyTimer = null;

         for (const pending of pendingStarts.slice()) {
            const readiness = checkReady(pending.label, pending.isReady);

            if (readiness !== false) {
               pendingStarts.splice(pendingStarts.indexOf(pending), 1);
            }

            if (readiness) {
               runSafely(pending.label, pending.start);
            }
         }

         armReadyTimer();
      }

      function whenReady(label, isReady, start) {
         const readiness = checkReady(label, isReady);

         if (readiness) {
            runSafely(label, start);
         }

         if (readiness !== false) {
            return;
         }

         pendingStarts.push({ label, isReady, start });
         armReadyTimer();
      }

      function dispatch(listeners, records) {
         for (const listener of listeners) {
            runSafely("observer", listener, records);
         }
      }

      const bodyObserver = new MutationObserver((records) => dispatch(bodyListeners, records));
      const headObserver = new MutationObserver((records) => dispatch(headListeners, records));
      const rootObserver = new MutationObserver((records) => dispatch(rootListeners, records));

      function observeWhenPresent(listeners, observer, getTarget, options) {
         if (listeners.length > 1) {
            return;
         }

         whenReady("observer", () => Boolean(getTarget()), () => observer.observe(getTarget(), options));
      }

      function onBodyMutations(listener) {
         bodyListeners.push(listener);
         observeWhenPresent(bodyListeners, bodyObserver, () => document.body, { childList: true, subtree: true });
      }

      function onHeadMutations(listener) {
         headListeners.push(listener);
         observeWhenPresent(headListeners, headObserver, () => document.head, { childList: true, subtree: true, characterData: true });
      }

      function onRootAttributes(listener) {
         rootListeners.push(listener);
         observeWhenPresent(rootListeners, rootObserver, () => document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
      }

      function onRoute(listener) {
         routeListeners.push(listener);

         if (isRouteHooked) {
            return;
         }

         isRouteHooked = true;
         whenReady("route", () => Boolean(window.Spicetify?.Platform?.History?.listen), () => {
            Spicetify.Platform.History.listen((location) => {
               for (const routeListener of routeListeners) {
                  runSafely("route", routeListener, location);
               }
            });
         });
      }

      function onPlayer(eventName, listener) {
         let listeners = playerListeners.get(eventName);

         if (listeners) {
            listeners.push(listener);
            return;
         }

         listeners = [listener];
         playerListeners.set(eventName, listeners);
         whenReady("player", () => Boolean(window.Spicetify?.Player?.addEventListener), () => {
            Spicetify.Player.addEventListener(eventName, (event) => {
               for (const playerListener of listeners) {
                  runSafely(eventName, playerListener, event);
               }
            });
         });
      }

      return { whenReady, onBodyMutations, onHeadMutations, onRootAttributes, onRoute, onPlayer, runSafely, exports };
   })();

   function albumAmbience(core) {
      const ACCENT_VARS = [
         "button",
         "button-active",
         "play-button",
         "play-button-active",
         "progress-fg",
         "notification",
         "radio-btn-active",
         "pagelink-active",
      ];
      const SURFACE_VARS = [
         "main",
         "sidebar",
         "player",
         "card",
         "main-elevated",
         "main-transition",
         "highlight",
         "highlight-elevated",
         "tab-active",
         "misc",
         "progress-bg",
         "button-disabled",
      ];
      const SURFACE_TINT_STRENGTH = 0.09;
      const MIN_COVER_SATURATION = 0.16;
      const SAMPLE_SIZE = 32;
      const SECONDARY_MIN_HUE_GAP = 35;
      const SECONDARY_MIN_SCORE_SHARE = 0.15;
      const RIPPLE_DURATION_MS = 400;
      const BEAT_GLOW_MS = 380;
      const BAR_BREATH_MS = 900;
      // Stepped timing keeps these at 15 to 30 fps. Smooth easing recomposites the whole window every frame.
      const SPIN_STEPS = 180;
      const BEAT_GLOW_STEPS = 11;
      const BAR_BREATH_STEPS = 14;
      const BAR_MATCH_SECONDS = 0.05;
      const BACKDROP_OPACITY = 0.42;
      const PLAY_BUTTON_SELECTOR = "aside[data-testid='now-playing-bar'] [data-testid='control-button-playpause']";
      const BACKDROP_SIZE = 72;
      const BACKDROP_BLUR_PX = 5;
      const LYRICS_CONTAINER_SELECTOR = "[style*='--lyrics-color-active']";
      const LYRICS_SCOPE = `:root #main ${LYRICS_CONTAINER_SELECTOR}:not(.Root__right-sidebar-peek *)`;
      const PLAYER_BAR_SELECTOR = "aside[data-testid='now-playing-bar']";
      const PANEL_RADIUS = "16px";
      const PLAYER_BAR_LIFT_PX = 16;
      const PLAYER_BAR_HEIGHT_PX = 120;
      const PLAYER_BAR_GAP_PX = 0;
      const SCRIM_ATTRIBUTE = "data-ambience-scrim";
      const DARK_SCRIM_MARKER = "oklch(0.18 0 0";
      const LYRIC_LINE_SELECTOR = "div[dir='auto']";
      const ACTIVE_LYRIC_TIMELINE = "--scroll-to-viewport-button-anim";
      const STICKY_BAR_SELECTOR = `:is(div[style*="--background-base:"]:not(.main-entityHeader-backgroundColor, .main-entityHeader-metaData, .playlist-playlist-actionBarBackground-background, .playlist-playlist-mixingBackground, .playlist-playlist-playlistContent > div), main > div > div > div[style*="opacity"]:empty)`;
      const LYRICS_HOST_ATTRIBUTE = "data-ambience-lyrics-host";
      const LYRICS_PANEL_ATTRIBUTE = "data-ambience-lyrics-panel";
      const LYRICS_HOST_SELECTOR = ".main-actionBar-ActionBarContainer, .main-view-container__scroll-node";
      const CINEMA_CONTAINER_SELECTOR = "[style*='--cinema-mode-bg-color-from']";
      const STAGE_CLASS = "sm-lyrics-stage";
      const STAGE_ATTRIBUTE = "data-sm-stage";
      const STAGE_MODES_SELECTOR = "[aria-label='Media control options']";
      const STAGE_COVERED_ATTRIBUTE = "data-sm-stage-covered";
      const STAGE_COVERED_SELECTOR = "#Desktop_LeftSidebar_Id, :has(.Root__right-sidebar-peek)";
      const STAGE = `:root.${STAGE_CLASS} #main [${STAGE_ATTRIBUTE}]`;
      const STAGE_LYRICS = LYRICS_SCOPE.replace(":root ", `:root.${STAGE_CLASS} `);
      const STAGE_STATIC_LYRICS = `:root.${STAGE_CLASS} #main ${LYRICS_CONTAINER_SELECTOR}[data-ambience-sync="static"]`;
      const STAGE_SCROLLER = `${STAGE} > div:nth-child(2)`;
      const STAGE_HEADER = `${STAGE} > div:first-child`;
      const STAGE_QUEUE_LINK = `${STAGE_HEADER} > div:first-child > a`;
      const STAGE_GROUPS = `${STAGE_HEADER} > div:last-child`;
      const RIGHT_SIDEBAR_OPEN = "[data-right-sidebar-open-duringenter], [data-right-sidebar-open-postenter], [data-right-sidebar-open-preexit]";
      const STAGE_SYNC_BUTTON = `${STAGE} .over-cinema-scroll button`;
      const STAGE_CAPSULES = `:is(${STAGE} ${STAGE_MODES_SELECTOR}, ${STAGE} ${STAGE_MODES_SELECTOR} ~ div:has(> button + button))`;
      const STAGE_SOLO_BUTTON = `${STAGE} ${STAGE_MODES_SELECTOR} ~ span > div:not(:has(> button + button)) > button`;
      const LIQUID_COLOR_COUNT = 4;
      const LIQUID_MIN_HUE_GAP = 28;
      const LIQUID_MIN_SCORE_SHARE = 0.04;
      const LIQUID_LIGHTNESS = [0.52, 0.5, 0.46, 0.34];
      const LIQUID_HUE_SHIFTS = [0, 38, -42, 150];
      const LIQUID_LAYERS = ["layer a", "shade", "bloom", "grain", "glow"];
      const LIQUID_GLOW_SIZE = 720;
      const LIQUID_GLOW_EASE = 0.1;
      const LIQUID_BREATH_SCALE = 0.025;
      const EASE_PRESS = "linear(0, 0.003 1.1%, 0.027 3.4%, 0.091 6.7%, 0.445 20.2%, 0.55 24.7%, 0.619 28.1%, 0.732 34.8%, 0.827 42.7%, 0.904 52.8%, 0.951 64%, 0.981 78.7%, 1)";
      const EASE_HOVER = "linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1)";
      const EASE_RELEASE = "linear(0, 0.023 3.2%, 0.101 7.1%, 0.198 10.7%, 0.533 21.7%, 0.712 28.8%, 0.837 35.5%, 0.923 42.2%, 0.984 50.5%, 1.015 60.7%, 1.02 72.2%, 1)";
      const EASE_TOGGLE = "linear(0, 0.023 3.4%, 0.099 7.6%, 0.192 11.4%, 0.499 22.8%, 0.67 30.4%, 0.786 37.1%, 0.875 44.3%, 0.946 53.6%, 0.987 64.6%, 1.004 78.1%, 1)";
      const EASE_VIEW = "linear(0, 0.02 2.9%, 0.085 6.5%, 0.45 20.5%, 0.615 28%, 0.735 35.1%, 0.824 42.6%, 0.902 52.7%, 0.952 64.4%, 0.981 79%, 1)";
      const EASE_CROSSFADE = "linear(0, 0.02 2.9%, 0.082 6.3%, 0.158 9.5%, 0.453 20.6%, 0.616 28%, 0.735 35.1%, 0.824 42.5%, 0.9 52.3%, 0.951 64.2%, 0.981 79%, 1)";
      const SLIDE_STEPS = 208;
      const COVER_CACHE_LIMIT = 8;
      const VIEW_COVER_SELECTOR = ".main-entityHeader-container img, [data-testid='entity-header'] img, .main-entityHeader-imageContainer img";
      const VIEW_WEIGHT_SIDEBAR_CLOSED = 0.82;
      const VIEW_WEIGHT_SIDEBAR_OPEN = 0.58;
      const VIEW_SCAN_DELAYS_MS = [80, 320, 900];
      const PALETTE_TWEEN_MS = 420;
      // Each step writes --spice-* on <html> and restyles every node (about 160 ms on Home), so 8 steps only ever showed about 3.
      const PALETTE_TWEEN_STEPS = 3;
      const BLOB_TWEEN_MS = 900;
      const SKIN_TONE_HUE_RANGE = [12, 48];
      const SKIN_TONE_MAX_SATURATION = 0.55;
      const SKIN_TONE_PENALTY = 0.55;
      const VIEW_TINT_LIGHTNESS = 0.3;
      const RIGHT_PANEL_SELECTOR = "aside[aria-label='Now playing view']";
      const VIEW_CONTRAST_LIGHTNESS = 0.58;
      const LIQUID_OPACITY_BASE = 0.5;
      const LIQUID_OPACITY_SPAN = 0.45;
      const BEAT_BLOOM_OPACITY = 0.42;
      const BEAT_BLOOM_SCALE = 0.022;
      const SWEEP_MIN_STRENGTH = 0.55;
      const SWEEP_PEAK_OPACITY = 0.22;
      const LOUDNESS_WEIGHT = 0.65;
      const SECTION_LOUDNESS_FLOOR_DB = -30;
      const BEAT_CACHE_LIMIT = 3;
      const SCAN_MIN_GAP_MS = 200;
      const LIST_NOISE_SELECTOR = "[role='grid'], [role='row'], [role='listbox'], [data-testid='track-list']";
      // Tagged at scan time because :has() here re-checked shelf ancestors on every DOM change in the main view.
      const CARD_IN_GRID = ":scope > [role=\"row\"] > [role=\"gridcell\"] > * > [data-encore-id=\"card\"], :scope > [role=\"row\"] > [role=\"gridcell\"] > * > * > [data-encore-id=\"card\"]";
      const CARD_GRID_ATTRIBUTE = "data-ambience-card-grid";
      const SHELF_PAD_ATTRIBUTE = "data-ambience-shelf-pad";
      const SHELF_CLIP_ATTRIBUTE = "data-ambience-shelf-clip";
      const IDLE_CARD_BUTTON = ":root #main .main-view-container [data-encore-id=\"card\"]:not(:hover, :focus-within) [class*=\"legacy-button-primary\"]";
      const SLIDE_HOST_SELECTORS = [
         ":root #main .main-view-container [class*=\"legacy-button-primary\"]",
         ":root #main .main-view-container .playlist-playlist-searchBoxContainer [class*=\"button--primary\"]",
         ":root #main #Desktop_LeftSidebar_Id button[aria-label=\"Create\"]",
         ":root #main #Desktop_LeftSidebar_Id [class*=\"legacy-chip__inner\"]",
         ":root #main #Desktop_LeftSidebar_Id [role=\"row\"][aria-selected=\"true\"]",
      ];
      const SLIDE_BEFORE_SELECTORS = SLIDE_HOST_SELECTORS.map((selector) => selector + "::before").join(",\n      ");
      const SLIDE_PAUSED_SELECTORS = ["hidden", "paused"]
         .flatMap((state) => SLIDE_HOST_SELECTORS.map((selector) => selector.replace(":root ", `:root.ambience-${state} `) + "::before"))
         .join(",\n      ");

      function whileResting(selector) {
         return selector.replaceAll(":root.", ":root.sm-ambient-rest.");
      }

      function withKeyboardFocus(selector) {
         return selector.replaceAll(":root.", ":root:not(.no-focus-outline).");
      }

      const liquid = buildLiquid();
      let schemeColors = null;
      let activeLyricClass = null;
      let hasRippled = false;
      let rippleAnimation = null;
      let discCenter = null;
      let beatTrack = null;
      let beatTimer = null;
      let beatTrackId = null;
      let trackSections = [];
      let activeSection = -1;
      let currentLiquid = null;
      let currentBlob = null;
      let liquidTween = 0;
      let lastBlended = null;
      let beatAbort = null;
      let appliedColorsFor = null;
      let trackCoverColors = null;
      let viewCoverColors = null;
      let viewCoverUrl = "";
      let viewToken = 0;
      let composedKey = null;
      let currentPalette = null;
      let paletteTween = 0;
      let appliedBackdropFor = null;
      const coverCache = new Map();
      const beatCache = new Map();
      const checkedScrimCandidates = new WeakSet();
      const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

      const ripple = document.createElement("div");
      ripple.id = "ambience-ripple";
      let requestToken = 0;
      let visibleLayer = "a";

      const style = document.createElement("style");
      style.id = "album-ambience";
      style.textContent = `
         :root #main [data-ambience-top] {
            isolation: isolate;
         }

         :root #main [data-ambience-top]::before,
         :root #main [data-ambience-top]::after {
            content: "";
            position: absolute;
            inset: 0;
            z-index: -2;
            pointer-events: none;
            background-position: center;
            background-size: cover;
            background-repeat: no-repeat;
            opacity: 0;
            transition: opacity 380ms ${EASE_CROSSFADE};
            will-change: opacity;
         }

         :root #main [data-ambience-top]::before {
            background-image: var(--ambience-cover-a, none);
         }

         :root #main [data-ambience-top]::after {
            background-image: var(--ambience-cover-b, none);
         }

         :root[data-ambience-layer="a"] #main [data-ambience-top]::before,
         :root[data-ambience-layer="b"] #main [data-ambience-top]::after {
            opacity: ${BACKDROP_OPACITY};
         }

         :root #main [data-ambience-top] {
            background-color: rgb(var(--spice-rgb-main)) !important;
         }

         :root #main #global-nav-bar,
         :root #main [data-ambience-top] > :has(> ${PLAYER_BAR_SELECTOR}) {
            background-color: transparent !important;
         }

         :root #main [data-ambience-top] > :has(> ${PLAYER_BAR_SELECTOR}) {
            min-height: ${PLAYER_BAR_HEIGHT_PX}px;
         }

         :root #main #Desktop_LeftSidebar_Id,
         :root #main #main-view,
         :root #main .Root__right-sidebar-peek {
            border-radius: ${PANEL_RADIUS} !important;
            overflow: hidden;
            background-color: rgba(var(--spice-rgb-sidebar), 0.5) !important;
            background-image: linear-gradient(180deg, rgba(255, 255, 255, 0.045) 0%, rgba(255, 255, 255, 0) 120px) !important;
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.1),
               inset 0 0 0 1px rgba(255, 255, 255, 0.045),
               0 2px 6px rgba(0, 0, 0, 0.22),
               0 18px 40px -12px rgba(0, 0, 0, 0.55) !important;
            transition: background-color 380ms ${EASE_CROSSFADE};
         }

         :root #main #Desktop_LeftSidebar_Id > nav > div,
         :root #main #Desktop_LeftSidebar_Id .YourLibraryX,
         :root #main .Root__right-sidebar-peek .Root__right-sidebar-faux > div {
            background-color: transparent !important;
         }

         :root #main #main-view {
            background-color: rgba(var(--spice-rgb-main), 0.26) !important;
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.08),
               inset 0 0 0 1px rgba(255, 255, 255, 0.035),
               0 24px 60px -18px rgba(0, 0, 0, 0.6) !important;
         }

         :root #main .Root__right-sidebar-peek .Root__right-sidebar-overlayWrapper {
            border-radius: ${PANEL_RADIUS} !important;
         }

         :root #main #global-nav-bar input[aria-label] {
            border-radius: 999px !important;
            background-color: rgba(255, 255, 255, 0.07) !important;
            background-image: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0)) !important;
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.14),
               inset 0 0 0 1px rgba(255, 255, 255, 0.06),
               0 6px 18px -6px rgba(0, 0, 0, 0.5) !important;
            transition: background-color 220ms ${EASE_HOVER}, box-shadow 220ms ${EASE_HOVER}, transform 220ms ${EASE_HOVER};
         }

         :root #main #global-nav-bar input[aria-label]:hover,
         :root #main #global-nav-bar input[aria-label]:focus {
            transform: scale(1.01);
            background-color: rgba(255, 255, 255, 0.11) !important;
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.2),
               inset 0 0 0 1px rgba(var(--spice-rgb-button), 0.45),
               0 0 0 4px rgba(var(--spice-rgb-button), 0.12),
               0 8px 24px -6px rgba(0, 0, 0, 0.55) !important;
         }

         :root #main #global-nav-bar button[aria-label="Home"] {
            border-radius: 999px !important;
            background-color: rgba(255, 255, 255, 0.07) !important;
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.14),
               inset 0 0 0 1px rgba(255, 255, 255, 0.06),
               0 6px 18px -6px rgba(0, 0, 0, 0.5) !important;
            transition: transform 220ms ${EASE_HOVER}, background-color 220ms ${EASE_HOVER};
         }

         :root #main #global-nav-bar button[aria-label="Home"]:hover {
            transform: scale(1.06);
            background-color: rgba(255, 255, 255, 0.12) !important;
         }

         :root #main .Root__right-sidebar-peek {
            --background-base: transparent;
         }

         :root #main #main-view,
         :root #main #main-view .contentSpacing,
         :root #main #main-view section {
            --carousel-start-chevron-gradient: transparent;
            --carousel-end-chevron-gradient: transparent;
         }

         :root #main .Root__right-sidebar-peek video {
            -webkit-mask-image: linear-gradient(transparent 0%, #000 18%, #000 56%, rgba(0, 0, 0, 0.35) 82%, transparent 100%);
            mask-image: linear-gradient(transparent 0%, #000 18%, #000 56%, rgba(0, 0, 0, 0.35) 82%, transparent 100%);
         }

         :root #main [${SCRIM_ATTRIBUTE}] {
            background: none !important;
         }

         :root #main [${SCRIM_ATTRIBUTE}="primary"] {
            background: linear-gradient(rgba(var(--spice-rgb-sidebar), 0.5) 0%, transparent 24%, transparent 58%, rgba(var(--spice-rgb-sidebar), 0.45) 82%, rgba(var(--spice-rgb-sidebar), 0.6) 100%) !important;
            -webkit-mask-image: linear-gradient(#000 72%, transparent 100%);
            mask-image: linear-gradient(#000 72%, transparent 100%);
         }

         :root #main ${PLAYER_BAR_SELECTOR} {
            position: relative;
            box-sizing: border-box;
            height: calc(100% - ${PLAYER_BAR_LIFT_PX}px) !important;
            border-radius: 22px !important;
            background-color: rgb(var(--spice-rgb-sidebar)) !important;
            background-image:
               radial-gradient(60% 140% at 50% 0%, rgba(var(--spice-rgb-button), 0.14) 0%, transparent 70%),
               linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0) 100%) !important;
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.16),
               inset 0 0 0 1px rgba(255, 255, 255, 0.05),
               0 4px 10px rgba(0, 0, 0, 0.25),
               0 26px 50px -16px rgba(0, 0, 0, 0.7),
               0 -10px 40px -24px rgba(var(--spice-rgb-button), 0.5) !important;
            --cover-ambience-background: transparent;
         }

         :root #main ${PLAYER_BAR_SELECTOR}::before {
            content: "";
            position: absolute;
            top: 0;
            left: 18%;
            right: 18%;
            height: 1px;
            pointer-events: none;
            background: linear-gradient(90deg, transparent, rgba(var(--spice-rgb-button), 0.8), rgba(var(--ambience-rgb-accent-2, 255, 255, 255), 0.8), transparent);
            opacity: 0.7;
         }

         :root #main .main-view-container ${STICKY_BAR_SELECTOR} {
            background-color: rgba(var(--spice-rgb-main), 0.82) !important;
            box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.05);
         }

         :root #main #Desktop_LeftSidebar_Id .main-yourLibraryX-entryPoints,
         :root #main #Desktop_LeftSidebar_Id .main-yourLibraryX-libraryContainer,
         :root #main .Root__right-sidebar-peek .NowPlayingView,
         :root #main .Root__right-sidebar-peek .NowPlayingView::before {
            background-color: transparent !important;
         }

         :root #main .Root__right-sidebar-peek {
            --background-elevated-base: rgba(var(--spice-rgb-main-elevated), 0.55);
         }

         :root #main .Root__right-sidebar-peek .main-nowPlayingView-section:not([style*="background"]) {
            background-color: rgba(var(--spice-rgb-main-elevated), 0.55) !important;
         }

         :root #main .main-nowPlayingView-contextItemInfo::before,
         :root #main .search-searchCategory-contentArea::before,
         :root #main .search-searchCategory-contentArea::after {
            display: none !important;
         }

         :root #main .main-view-container ${STICKY_BAR_SELECTOR}::after {
            background-color: transparent !important;
         }

         :root #main .main-view-container ${STICKY_BAR_SELECTOR} {
            -webkit-mask-image: linear-gradient(to bottom, #000 65%, transparent 100%);
            mask-image: linear-gradient(to bottom, #000 65%, transparent 100%);
         }

         :root #main .main-view-container main > div > div:first-child[style*="background-color"] {
            background-image: none !important;
            opacity: 0.55;
            -webkit-mask-image: linear-gradient(to bottom, #000 0%, transparent 100%);
            mask-image: linear-gradient(to bottom, #000 0%, transparent 100%);
         }

         :root[data-ambience-view] #main .main-view-container main > div > div:first-child[style*="background-color"] {
            background-color: var(--ambience-view-tint) !important;
         }

         :root[data-ambience-view] #main #main-view [style*="--background-base:"] {
            --background-base: var(--ambience-view-tint) !important;
            --background-base-min-contrast: var(--ambience-view-contrast) !important;
            --background-base-20: rgba(var(--ambience-rgb-view-tint), 0.2) !important;
         }

         :root #main .main-view-container .main-entityHeader-backgroundColor {
            -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 140px, #000 55%, transparent 100%);
            mask-image: linear-gradient(to bottom, transparent 0, #000 140px, #000 55%, transparent 100%);
         }

         :root #main .main-view-container .playlist-playlist-actionBarBackground-background {
            background: none !important;
         }

         :root #main .main-view-container .main-entityHeader-headerText > div:last-child {
            position: relative;
            isolation: isolate;
            display: inline-flex !important;
            align-items: center;
            width: fit-content !important;
            max-width: 100%;
            padding: 7px 18px 7px 14px !important;
            border-radius: 999px;
            overflow: hidden;
            color: rgba(255, 255, 255, 0.82) !important;
            background:
               linear-gradient(115deg,
                  color-mix(in srgb, var(--liq-1) 34%, transparent),
                  color-mix(in srgb, var(--liq-2) 26%, transparent),
                  color-mix(in srgb, var(--liq-3) 34%, transparent),
                  color-mix(in srgb, var(--liq-4) 26%, transparent),
                  color-mix(in srgb, var(--liq-1) 34%, transparent)) 38% 50% / 300% 100% !important;
            -webkit-backdrop-filter: blur(22px) saturate(1.8) brightness(1.08);
            backdrop-filter: blur(22px) saturate(1.8) brightness(1.08);
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.28),
               inset 0 -1px 0 rgba(255, 255, 255, 0.06),
               0 10px 30px -12px color-mix(in srgb, var(--liq-2) 70%, transparent),
               0 2px 8px rgba(0, 0, 0, 0.25) !important;
            transition: transform 220ms ${EASE_HOVER}, box-shadow 220ms ${EASE_HOVER};
         }

         :root #main .main-view-container .main-entityHeader-headerText > div:last-child::before {
            content: "";
            position: absolute;
            inset: 0;
            z-index: -1;
            border-radius: inherit;
            padding: 1px;
            background: linear-gradient(120deg, rgba(255, 255, 255, 0.55), color-mix(in srgb, var(--liq-3) 60%, transparent) 40%, rgba(255, 255, 255, 0.08) 60%, color-mix(in srgb, var(--liq-1) 60%, transparent));
            -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
            -webkit-mask-composite: xor;
            mask-composite: exclude;
            pointer-events: none;
         }

         :root #main .main-view-container .main-entityHeader-headerText > div:last-child::after {
            content: "";
            position: absolute;
            inset: 0 50% 45% 0;
            z-index: -1;
            border-radius: 999px 999px 40% 999px;
            background: radial-gradient(80% 100% at 30% 0%, rgba(255, 255, 255, 0.22), transparent 70%);
            pointer-events: none;
         }

         :root #main .main-view-container .main-entityHeader-headerText > div:last-child:hover {
            transform: translateY(-1px) scale(1.015);
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.36),
               inset 0 -1px 0 rgba(255, 255, 255, 0.08),
               0 16px 40px -12px color-mix(in srgb, var(--liq-3) 80%, transparent),
               0 2px 10px rgba(0, 0, 0, 0.3) !important;
         }

         :root #main .main-view-container .main-entityHeader-headerText > div:last-child > span:first-child,
         :root #main .main-view-container .main-entityHeader-headerText > div:last-child > span:first-child a {
            background: linear-gradient(90deg, #fff, color-mix(in srgb, var(--liq-2) 45%, #fff), color-mix(in srgb, var(--liq-4) 45%, #fff), #fff) 40% 50% / 300% 100%;
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent !important;
         }

         :root #main .main-view-container .main-entityHeader-headerText > div:last-childText {
            color: rgba(255, 255, 255, 0.78) !important;
            text-shadow: 0 1px 6px rgba(0, 0, 0, 0.35);
         }

         @keyframes ambience-chip-slide {
            from { transform: translateX(0); }
            to { transform: translateX(-66.6667%); }
         }

         :root #main .main-view-container [class*="legacy-button-primary"],
         :root #main .main-view-container .playlist-playlist-searchBoxContainer [class*="button--primary"],
         :root #main #Desktop_LeftSidebar_Id button[aria-label="Create"],
         :root #main #Desktop_LeftSidebar_Id [class*="legacy-chip__inner"],
         :root #main #Desktop_LeftSidebar_Id [role="row"][aria-selected="true"] {
            position: relative;
            isolation: isolate;
            overflow: hidden;
            color: rgba(255, 255, 255, 0.92) !important;
            background: none !important;
            -webkit-backdrop-filter: blur(18px) saturate(1.7);
            backdrop-filter: blur(18px) saturate(1.7);
            border: none !important;
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.24),
               inset 0 0 0 1px rgba(255, 255, 255, 0.08),
               inset 0 -1px 0 rgba(255, 255, 255, 0.04),
               0 8px 24px -14px color-mix(in srgb, var(--liq-2) 80%, transparent) !important;
            transition:
               transform 220ms ${EASE_HOVER},
               box-shadow 220ms ${EASE_HOVER},
               filter 220ms ${EASE_HOVER} !important;
         }

         :root #main #Desktop_LeftSidebar_Id [role="row"][aria-selected="true"] {
            border-radius: 14px;
         }

         :root #main #Desktop_LeftSidebar_Id [role="row"][aria-selected="true"] [class*="legacy-box"] {
            background: transparent !important;
         }

         ${SLIDE_BEFORE_SELECTORS} {
            content: "";
            position: absolute;
            top: 0;
            bottom: 0;
            left: 0;
            width: 300%;
            z-index: -1;
            pointer-events: none;
            background:
               linear-gradient(115deg,
                  color-mix(in srgb, var(--liq-1) 22%, rgba(255, 255, 255, 0.05)),
                  color-mix(in srgb, var(--liq-2) 14%, rgba(255, 255, 255, 0.04)),
                  color-mix(in srgb, var(--liq-3) 22%, rgba(255, 255, 255, 0.05)),
                  color-mix(in srgb, var(--liq-4) 14%, rgba(255, 255, 255, 0.04)),
                  color-mix(in srgb, var(--liq-1) 22%, rgba(255, 255, 255, 0.05)));
            animation: ambience-chip-slide 26s steps(${SLIDE_STEPS}) infinite alternate;
         }

         :root #main #Desktop_LeftSidebar_Id [role="row"][aria-selected="true"]::before {
            animation-duration: 32s;
         }

         ${SLIDE_PAUSED_SELECTORS},
         :root #main .main-view-container [class*="legacy-button-primary"]:not(:hover)::before {
            animation-play-state: paused;
         }

         ${IDLE_CARD_BUTTON} {
            -webkit-backdrop-filter: none;
            backdrop-filter: none;
         }

         ${IDLE_CARD_BUTTON}::before {
            animation: none;
         }

         :root #main .main-view-container [class*="legacy-button-primary"]::after,
         :root #main .main-view-container .playlist-playlist-searchBoxContainer [class*="button--primary"]::after,
         :root #main #Desktop_LeftSidebar_Id button[aria-label="Create"]::after,
         :root #main #Desktop_LeftSidebar_Id [class*="legacy-chip__inner"]::after,
         :root #main #Desktop_LeftSidebar_Id [role="row"][aria-selected="true"]::after {
            content: "";
            position: absolute;
            inset: 0;
            z-index: -1;
            border-radius: inherit;
            background: radial-gradient(70% 90% at 25% 0%, rgba(255, 255, 255, 0.18), transparent 65%);
            pointer-events: none;
         }

         :root #main .main-view-container [class*="legacy-button-primary"]:hover,
         :root #main .main-view-container .playlist-playlist-searchBoxContainer [class*="button--primary"]:hover,
         :root #main #Desktop_LeftSidebar_Id button[aria-label="Create"]:hover,
         :root #main #Desktop_LeftSidebar_Id [class*="legacy-chip__inner"]:hover {
            transform: translateY(-1px) scale(1.03);
            filter: brightness(1.15) saturate(1.2);
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.34),
               inset 0 0 0 1px rgba(255, 255, 255, 0.14),
               0 12px 30px -12px color-mix(in srgb, var(--liq-3) 90%, transparent) !important;
         }

         :root #main .main-view-container [class*="legacy-button-primary"]:active,
         :root #main .main-view-container .playlist-playlist-searchBoxContainer [class*="button--primary"]:active,
         :root #main #Desktop_LeftSidebar_Id button[aria-label="Create"]:active,
         :root #main #Desktop_LeftSidebar_Id [class*="legacy-chip__inner"]:active {
            transform: scale(0.96);
            transition-duration: 90ms !important;
            transition-timing-function: ${EASE_PRESS} !important;
         }

         :root #main #Desktop_LeftSidebar_Id [role="row"]:not([aria-selected="true"]) {
            transition: background-color 220ms ${EASE_HOVER}, transform 220ms ${EASE_HOVER};
         }

         :root #main #Desktop_LeftSidebar_Id [role="row"]:not([aria-selected="true"]):hover {
            border-radius: 14px;
            background: rgba(255, 255, 255, 0.05) !important;
            transform: translateX(2px);
         }

         :root #main .player-controls [data-testid="control-button-playpause"] > span {
            background-color: var(--spice-play-button) !important;
            color: var(--spice-main) !important;
         }

         :root #main .playback-progressbar .x-progressBar-fillColor {
            background-color: var(--spice-progress-fg) !important;
            background-image: linear-gradient(90deg, var(--spice-progress-fg), var(--ambience-accent-2, var(--spice-progress-fg))) !important;
         }

         :root #main .playback-progressbar .progress-bar__slider {
            display: flex !important;
            background-color: #ffffff !important;
            box-shadow:
               0 0 0 3px rgba(var(--ambience-rgb-accent-2, 255, 255, 255), 0.3),
               0 0 12px 2px rgba(var(--ambience-rgb-accent-2, 255, 255, 255), 0.85);
         }

         :root #main ${PLAY_BUTTON_SELECTOR} {
            position: relative;
            isolation: isolate;
         }

         :root #main ${PLAY_BUTTON_SELECTOR}::before {
            content: "";
            position: absolute;
            inset: -8px;
            z-index: -1;
            border-radius: 50%;
            pointer-events: none;
            background: radial-gradient(circle, rgba(var(--spice-rgb-button), 0.8) 0%, rgba(var(--spice-rgb-button), 0.35) 45%, transparent 70%);
            opacity: 0;
         }

         #ambience-ripple {
            position: fixed;
            inset: 0;
            z-index: 9999;
            pointer-events: none;
            opacity: 0;
            transform-origin: var(--ripple-x, 70px) var(--ripple-y, 90%);
            background: radial-gradient(circle at var(--ripple-x, 70px) var(--ripple-y, 90%), rgba(var(--spice-rgb-button), 0.5) 0%, rgba(var(--spice-rgb-button), 0.16) 25%, transparent 55%);
         }

         :root #main .main-nowPlayingWidget-coverArt {
            position: relative;
            border-radius: 50%;
            box-shadow: 0 5px 12px rgba(0, 0, 0, 0.5);
         }

         :root #main .main-nowPlayingWidget-coverArt::after {
            content: "";
            position: absolute;
            inset: 0;
            z-index: 2;
            border-radius: 50%;
            pointer-events: none;
            background: conic-gradient(from 35deg, transparent 0%, rgba(255, 255, 255, 0.16) 8%, transparent 18%, transparent 50%, rgba(255, 255, 255, 0.11) 58%, transparent 68%);
         }

         :root #main .main-nowPlayingWidget-coverArt .cover-art {
            border-radius: 50% !important;
            overflow: hidden;
            box-shadow: none !important;
            animation: ambience-spin 9s steps(${SPIN_STEPS}) infinite;
            will-change: transform;
         }

         :root #main .main-nowPlayingWidget-coverArt .cover-art-image {
            border-radius: 50% !important;
         }

         :root.ambience-hidden #main .main-nowPlayingWidget-coverArt .cover-art,
         :root.ambience-paused #main .main-nowPlayingWidget-coverArt .cover-art {
            animation-play-state: paused;
         }

         :root #main .main-nowPlayingWidget-coverArt .cover-art::after {
            content: "";
            position: absolute;
            inset: 0;
            z-index: 1;
            border-radius: 50%;
            pointer-events: none;
            background:
               radial-gradient(circle, var(--spice-player) 0 5%, rgba(255, 255, 255, 0.4) 5.5% 7%, transparent 7.5%),
               radial-gradient(circle, transparent 0 27%, rgba(0, 0, 0, 0.45) 27.5% 29%, transparent 29.5%),
               repeating-radial-gradient(circle, transparent 0 1.5px, rgba(0, 0, 0, 0.16) 1.5px 2.5px);
         }

         ${LYRICS_SCOPE} {
            --lyrics-color-active: #ffffff !important;
            --lyrics-color-inactive: var(--spice-text) !important;
            --lyrics-color-passed: var(--spice-text) !important;
            --lyrics-color-background: transparent !important;
         }

         :root #main [style*="--cinema-mode-bg-color-from"] {
            --cinema-mode-bg-color-from: transparent !important;
            --cinema-mode-bg-color-to: transparent !important;
            --background-base: transparent !important;
            isolation: isolate;
         }

         :root #main [${LYRICS_HOST_ATTRIBUTE}] {
            background-color: rgb(var(--spice-rgb-main)) !important;
            background-image:
               linear-gradient(rgba(0, 0, 0, 0.38), rgba(0, 0, 0, 0.38)),
               var(--ambience-cover-current, none) !important;
            background-position: center;
            background-size: cover;
            background-repeat: no-repeat;
         }

         :root #main [${LYRICS_PANEL_ATTRIBUTE}],
         :root #main [${LYRICS_HOST_ATTRIBUTE}] {
            outline: none !important;
         }

         :root #main [${LYRICS_PANEL_ATTRIBUTE}] {
            border-radius: 8px !important;
            overflow: hidden !important;
         }

         :root #main [${LYRICS_PANEL_ATTRIBUTE}] > *::before {
            background-image: linear-gradient(rgba(0, 0, 0, 0.32) 0%, rgba(0, 0, 0, 0.12) 50%, transparent 100%) !important;
         }

         ${LYRICS_SCOPE} [data-ambience-lyric] {
            position: relative;
            isolation: isolate;
            width: fit-content;
            max-width: 100%;
            transform-origin: left center;
            transition:
               opacity 240ms ${EASE_TOGGLE},
               transform 240ms ${EASE_TOGGLE};
         }

         ${LYRICS_SCOPE} [data-ambience-lyric]::before {
            content: "";
            position: absolute;
            inset: -0.1em -0.38em;
            z-index: -1;
            border-radius: 0.55em;
            pointer-events: none;
            opacity: 0;
            transform: scale(0.94);
            transform-origin: left center;
            transition:
               opacity 240ms ${EASE_TOGGLE},
               transform 240ms ${EASE_TOGGLE};
            background:
               radial-gradient(120% 140% at 8% 0%, rgba(255, 255, 255, 0.34) 0%, transparent 38%),
               linear-gradient(135deg, rgba(255, 255, 255, 0.17) 0%, rgba(255, 255, 255, 0.05) 48%, rgba(var(--ambience-rgb-accent-2, 255, 255, 255), 0.14) 100%);
            -webkit-backdrop-filter: blur(22px) saturate(190%) brightness(1.12);
            backdrop-filter: blur(22px) saturate(190%) brightness(1.12);
            border: 1px solid rgba(255, 255, 255, 0.2);
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.55),
               inset 0 -1px 0 rgba(255, 255, 255, 0.1),
               inset 0 0 28px rgba(255, 255, 255, 0.06),
               0 22px 56px rgba(0, 0, 0, 0.3),
               0 0 70px rgba(var(--ambience-rgb-accent-2, 255, 255, 255), 0.28);
         }

         ${LYRICS_SCOPE} [data-ambience-lyric="past"] {
            opacity: 0.3 !important;
         }

         ${LYRICS_SCOPE} [data-ambience-lyric="active"] {
            opacity: 1 !important;
            transform: scale(1.04);
            text-shadow:
               0 0 26px rgba(var(--ambience-rgb-accent-2, 255, 255, 255), 0.75),
               0 0 3px rgba(255, 255, 255, 0.5),
               0 2px 18px rgba(0, 0, 0, 0.25);
         }

         ${LYRICS_SCOPE} [data-ambience-lyric="active"]::before {
            opacity: 1;
            transform: scale(1);
         }

         ${LYRICS_SCOPE} [data-ambience-lyric="next-1"] {
            opacity: 0.74 !important;
         }

         ${LYRICS_SCOPE} [data-ambience-lyric="next-2"] {
            opacity: 0.52 !important;
         }

         ${LYRICS_SCOPE} [data-ambience-lyric="future"] {
            opacity: 0.36 !important;
         }

         ${LYRICS_SCOPE} [data-ambience-lyric]:hover {
            opacity: 0.92 !important;
         }

         ${STAGE} {
            margin: 0 !important;
            border-radius: 16px !important;
            outline: none !important;
            transition: none !important;
         }

         ${STAGE_SCROLLER} {
            border-radius: 16px;
            outline: none !important;
            background-color: transparent !important;
         }

         :root.${STAGE_CLASS} #main #Desktop_LeftSidebar_Id[${STAGE_COVERED_ATTRIBUTE}],
         :root.${STAGE_CLASS}:not(${RIGHT_SIDEBAR_OPEN}) #main [${STAGE_COVERED_ATTRIBUTE}] {
            visibility: hidden;
         }

         ${STAGE}[${STAGE_ATTRIBUTE}="lyrics"] > div:nth-child(2) {
            -webkit-mask-image: linear-gradient(to bottom, transparent 0, transparent 40px, #000 136px, #000 calc(100% - 200px), transparent calc(100% - 48px));
            mask-image: linear-gradient(to bottom, transparent 0, transparent 40px, #000 136px, #000 calc(100% - 200px), transparent calc(100% - 48px));
         }

         ${STAGE}[${STAGE_ATTRIBUTE}="media"] > div:nth-child(2) {
            -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 40px), transparent);
            mask-image: linear-gradient(to bottom, #000 calc(100% - 40px), transparent);
         }

         ${STAGE_HEADER} {
            align-items: center;
            padding: 14px 16px;
         }

         ${STAGE_HEADER}::before {
            display: none;
         }

         ${STAGE_HEADER} > div:first-child {
            display: flex;
            align-items: center;
            height: 44px;
         }

         ${STAGE_GROUPS} {
            align-items: center;
            gap: 12px;
         }

         ${STAGE_GROUPS} > div:not(:has(button)) {
            display: none;
         }

         ${STAGE_CAPSULES},
         ${STAGE_SOLO_BUTTON},
         ${STAGE_QUEUE_LINK},
         ${STAGE_SYNC_BUTTON} {
            position: relative;
            border-radius: 22px !important;
            background-color: rgba(255, 255, 255, 0.08);
            background-image: linear-gradient(to bottom, color-mix(in oklab, var(--liq-1) 18%, transparent), color-mix(in oklab, var(--liq-1) 6%, transparent));
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.16),
               inset 0 0 0 1px rgba(255, 255, 255, 0.06),
               0 8px 24px -12px rgba(0, 0, 0, 0.45);
            transition: background-color 300ms ${EASE_VIEW}, box-shadow 300ms ${EASE_VIEW};
         }

         ${STAGE_CAPSULES} {
            gap: 4px;
            padding: 4px;
         }

         ${STAGE_CAPSULES} > button {
            position: relative;
            isolation: isolate;
            min-width: 36px;
            height: 36px;
            border-radius: 18px !important;
            color: #ffffff;
            background-color: transparent !important;
         }

         ${STAGE_CAPSULES} > button,
         ${STAGE_SOLO_BUTTON} {
            transition: transform 250ms ${EASE_RELEASE};
         }

         ${STAGE_CAPSULES} > button:active:not(:disabled),
         ${STAGE_SOLO_BUTTON}:active:not([aria-disabled="true"]) {
            transform: scale(0.92);
            transition-duration: 90ms;
            transition-timing-function: ${EASE_PRESS};
         }

         ${STAGE_SOLO_BUTTON} {
            height: 44px;
            padding: 0 20px;
            gap: 8px;
            color: #ffffff;
         }

         ${STAGE_SOLO_BUTTON}[aria-disabled="true"] {
            opacity: 0.45;
         }

         ${STAGE_CAPSULES} > button > span {
            background-color: transparent !important;
            opacity: 0.72;
            transition: opacity 220ms ${EASE_HOVER};
         }

         ${STAGE_CAPSULES} > button:is(:hover, [aria-checked="true"]) > span {
            opacity: 1;
         }

         ${STAGE_CAPSULES} > button::before {
            content: "";
            position: absolute;
            inset: 0;
            z-index: -1;
            border-radius: 18px;
            background-color: rgba(255, 255, 255, 0.2);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24);
            opacity: 0;
            transform: scale(0.86);
            pointer-events: none;
            transition:
               opacity 240ms ${EASE_TOGGLE},
               transform 240ms ${EASE_TOGGLE};
         }

         ${STAGE_CAPSULES} > button:hover::before {
            opacity: 0.5;
            transform: scale(1);
         }

         ${STAGE_CAPSULES} > button[aria-checked="true"]::before {
            opacity: 1;
            transform: scale(1);
         }

         ${STAGE_CAPSULES} > button::after {
            display: none !important;
         }

         ${STAGE_CAPSULES} > button:disabled {
            opacity: 0.3;
         }

         ${STAGE_CAPSULES} > button:disabled::before {
            display: none;
         }

         ${withKeyboardFocus(STAGE_CAPSULES)} > button:focus-visible,
         ${withKeyboardFocus(STAGE_QUEUE_LINK)}:focus-visible,
         ${withKeyboardFocus(STAGE_SYNC_BUTTON)}:focus-visible {
            outline: 2px solid rgba(255, 255, 255, 0.8);
            outline-offset: -2px;
         }

         ${STAGE_QUEUE_LINK} {
            display: flex;
            align-items: center;
            height: 44px;
            margin: 0;
            padding: 0 20px;
            color: #ffffff;
            text-decoration: none;
         }

         ${STAGE_SYNC_BUTTON} {
            height: 44px;
            padding: 0 20px;
            color: #ffffff;
         }

         ${STAGE_SYNC_BUTTON} > span {
            gap: 8px;
            min-block-size: 0;
            padding: 0 !important;
            background-color: transparent !important;
            color: #ffffff !important;
         }

         ${STAGE_QUEUE_LINK}::after,
         ${STAGE_SOLO_BUTTON}::after,
         ${STAGE_SYNC_BUTTON}::after {
            content: "";
            position: absolute;
            inset: 0;
            border-radius: inherit;
            background-color: rgba(255, 255, 255, 0.1);
            opacity: 0;
            pointer-events: none;
            transition: opacity 220ms ${EASE_HOVER};
         }

         ${STAGE_QUEUE_LINK}:hover::after,
         ${STAGE_SOLO_BUTTON}:not([aria-disabled="true"]):hover::after,
         ${STAGE_SYNC_BUTTON}:hover::after {
            opacity: 1;
         }

         ${STAGE_QUEUE_LINK}:hover {
            text-decoration: none;
         }

         :root.${STAGE_CLASS}.ambience-lyrics-open #ambience-liquid .glow[data-live] {
            opacity: 0.5;
         }

         ${whileResting(STAGE_CAPSULES)},
         ${whileResting(STAGE_SOLO_BUTTON)},
         ${whileResting(STAGE_QUEUE_LINK)},
         ${whileResting(STAGE_SYNC_BUTTON)} {
            background-color: rgba(255, 255, 255, 0.05);
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.07),
               inset 0 0 0 1px rgba(255, 255, 255, 0.03);
         }

         ${STAGE_LYRICS} {
            --lyrics-color-active: #ffffff !important;
            --lyrics-color-inactive: #ffffff !important;
            --lyrics-color-passed: #ffffff !important;
         }

         ${STAGE_LYRICS} > div:last-child {
            opacity: 0.5;
         }

         ${STAGE_LYRICS} > div:last-child * {
            font-size: 13px !important;
         }

         ${STAGE_LYRICS} [data-ambience-lyric] {
            transform: scale(0.97);
            transition:
               opacity 240ms ${EASE_TOGGLE},
               transform 240ms ${EASE_TOGGLE};
         }

         ${STAGE_LYRICS} [data-ambience-lyric]::before {
            inset: -8px -20px;
            border: 0;
            border-radius: 16px;
            background: rgba(255, 255, 255, 0.07);
            -webkit-backdrop-filter: none;
            backdrop-filter: none;
            box-shadow: none;
            transform: none;
            transition: opacity 220ms ${EASE_HOVER};
         }

         ${STAGE_LYRICS} [data-ambience-lyric="past"] {
            opacity: 0.24 !important;
         }

         ${STAGE_LYRICS} [data-ambience-lyric="future"] {
            opacity: 0.3 !important;
         }

         ${STAGE_LYRICS} [data-ambience-lyric="next-2"] {
            opacity: 0.42 !important;
         }

         ${STAGE_LYRICS} [data-ambience-lyric="next-1"] {
            opacity: 0.56 !important;
         }

         ${STAGE_LYRICS} [data-ambience-lyric="active"] {
            opacity: 1 !important;
            transform: scale(1);
            text-shadow:
               0 0 28px rgba(var(--ambience-rgb-accent-2, 255, 255, 255), 0.4),
               0 2px 12px rgba(0, 0, 0, 0.25);
         }

         :root.ambience-paused${STAGE_LYRICS.replace(":root", "")} [data-ambience-lyric="active"] {
            opacity: 0.86 !important;
            text-shadow: 0 2px 12px rgba(0, 0, 0, 0.25);
         }

         ${STAGE_LYRICS} [data-ambience-lyric="active"]::before {
            opacity: 0;
         }

         ${STAGE_LYRICS} [data-ambience-lyric]:not([data-ambience-lyric="active"]):hover {
            opacity: 0.8 !important;
         }

         ${STAGE_LYRICS} [data-ambience-lyric]:hover,
         ${STAGE_LYRICS} [data-ambience-lyric]:hover * {
            text-decoration: none !important;
         }

         ${STAGE_LYRICS} [data-ambience-lyric]:hover::before {
            opacity: 1;
         }

         ${STAGE_LYRICS} [data-ambience-lyric]:active {
            transform: scale(0.955);
            transition-duration: 90ms;
            transition-timing-function: ${EASE_PRESS};
         }

         ${STAGE_LYRICS} [data-ambience-lyric="active"]:active {
            transform: scale(0.985);
         }

         ${STAGE_STATIC_LYRICS} [data-ambience-lyric] {
            opacity: 0.92 !important;
            transform: none;
            text-shadow: none;
         }

         ${STAGE_STATIC_LYRICS} [data-ambience-lyric]::before {
            display: none;
         }

         @media (prefers-reduced-transparency: reduce) {
            ${STAGE_CAPSULES},
            ${STAGE_SOLO_BUTTON},
            ${STAGE_QUEUE_LINK},
            ${STAGE_SYNC_BUTTON} {
               background-color: rgba(24, 24, 28, 0.94);
               background-image: none;
            }

            ${STAGE_CAPSULES} > button::before {
               background-color: rgba(255, 255, 255, 0.24);
            }
         }

         @media (prefers-reduced-motion: reduce) {
            ${STAGE_LYRICS} [data-ambience-lyric],
            ${STAGE_LYRICS} [data-ambience-lyric]:active {
               transform: none;
            }

            ${STAGE_CAPSULES} > button::before,
            ${STAGE_CAPSULES} > button:active:not(:disabled),
            ${STAGE_SOLO_BUTTON}:active:not([aria-disabled="true"]) {
               transform: none;
            }

            ${STAGE_LYRICS} [data-ambience-lyric],
            ${STAGE_LYRICS} [data-ambience-lyric]::before,
            ${STAGE_CAPSULES} > button::before,
            ${STAGE_CAPSULES} > button > span {
               transition-duration: 120ms !important;
            }
         }

         @property --liq-1 {
            syntax: "<color>";
            inherits: true;
            initial-value: #5b4bd8;
         }

         @property --liq-2 {
            syntax: "<color>";
            inherits: true;
            initial-value: #d84b9c;
         }

         @property --liq-3 {
            syntax: "<color>";
            inherits: true;
            initial-value: #3b9be0;
         }

         @property --liq-4 {
            syntax: "<color>";
            inherits: true;
            initial-value: #2a2f78;
         }

         [data-ambience-top] {
            position: relative;
            isolation: isolate;
         }

         #ambience-liquid {
            position: absolute;
            inset: 0;
            z-index: -1;
            overflow: hidden;
            pointer-events: none;
            opacity: calc(${LIQUID_OPACITY_BASE} + ${LIQUID_OPACITY_SPAN} * var(--ambience-energy, 0.45));
            transition: opacity 380ms ${EASE_CROSSFADE};
         }

         :root.ambience-lyrics-open #ambience-liquid {
            opacity: 1;
         }

         #ambience-liquid > * {
            position: absolute;
            pointer-events: none;
         }

         #ambience-liquid .layer {
            inset: -25%;
         }

         :root:not(.sm-color-flow) #ambience-liquid .layer {
            transition:
               --liq-1 380ms ${EASE_CROSSFADE},
               --liq-2 380ms ${EASE_CROSSFADE},
               --liq-3 380ms ${EASE_CROSSFADE},
               --liq-4 380ms ${EASE_CROSSFADE};
         }

         :root.ambience-lyrics-open #ambience-liquid .layer {
            will-change: transform;
         }

         #ambience-liquid .layer.a {
            opacity: 0.82;
            background:
               radial-gradient(34% 40% at 28% 32%, var(--liq-1) 0%, transparent 72%),
               radial-gradient(36% 38% at 74% 28%, var(--liq-2) 0%, transparent 72%),
               radial-gradient(38% 42% at 68% 74%, var(--liq-3) 0%, transparent 72%),
               radial-gradient(34% 36% at 24% 76%, var(--liq-4) 0%, transparent 72%),
               radial-gradient(55% 16% at 50% 30%, color-mix(in srgb, var(--liq-2) 55%, transparent) 0%, transparent 70%),
               radial-gradient(16% 48% at 80% 55%, color-mix(in srgb, var(--liq-1) 55%, transparent) 0%, transparent 70%);
            animation: ambience-swirl-a 140s steps(2100) infinite;
         }

         #ambience-liquid .shade {
            inset: 0;
            background:
               radial-gradient(ellipse at 50% 46%, rgba(0, 0, 0, 0.02) 0%, rgba(0, 0, 0, 0.34) 100%),
               linear-gradient(rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.06));
         }

         :root #main #main-view::after {
            content: "";
            position: absolute;
            inset: 0;
            z-index: 5;
            pointer-events: none;
            opacity: 0;
            transform: translateX(-70%);
            background: linear-gradient(104deg,
               transparent 40%,
               color-mix(in srgb, var(--liq-2) 45%, rgba(255, 255, 255, 0.7)) 50%,
               transparent 60%);
         }

         #ambience-liquid .bloom {
            inset: -10%;
            opacity: 0;
            transform: scale(1);
            background:
               radial-gradient(48% 52% at 30% 36%, color-mix(in srgb, var(--liq-2) 85%, #fff) 0%, transparent 70%),
               radial-gradient(44% 48% at 72% 64%, color-mix(in srgb, var(--liq-1) 85%, #fff) 0%, transparent 70%);
         }

         #ambience-liquid .grain {
            inset: 0;
            opacity: 0.1;
            mix-blend-mode: overlay;
            background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
         }

         #ambience-liquid .glow {
            top: 0;
            left: 0;
            width: 720px;
            height: 720px;
            opacity: 0;
            mix-blend-mode: soft-light;
            background: radial-gradient(circle, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.14) 38%, transparent 66%);
            transition: opacity 300ms ${EASE_VIEW};
         }

         #ambience-liquid .glow[data-live] {
            opacity: 1;
         }

         :root:not(.ambience-lyrics-open) #ambience-liquid .layer,
         :root.ambience-hidden #ambience-liquid .layer,
         :root.ambience-paused #ambience-liquid .layer {
            animation-play-state: paused;
         }

         :root.ambience-lyrics-open #main #main-view {
            background-color: rgba(var(--spice-rgb-main), 0.08) !important;
         }

         :root.ambience-lyrics-open #main [${LYRICS_HOST_ATTRIBUTE}] {
            background: none !important;
            background-color: transparent !important;
         }

         :root.ambience-lyrics-open #main ${PLAYER_BAR_SELECTOR} {
            background-color: rgba(var(--spice-rgb-sidebar), 0.22) !important;
            -webkit-backdrop-filter: blur(28px) saturate(180%);
            backdrop-filter: blur(28px) saturate(180%);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14);
         }

         @keyframes ambience-swirl-a {
            0% {
               transform: rotate(0deg) scale(1);
            }

            50% {
               transform: rotate(180deg) scale(1.12);
            }

            100% {
               transform: rotate(360deg) scale(1);
            }
         }


         :root #main [data-testid$="-page"] [data-testid="entity-header"] div[style*="--background-base:"] {
            background-color: transparent !important;
            -webkit-mask-image: none !important;
            mask-image: none !important;
         }

         :root #main [data-testid$="-page"] > div[style*="--background-base:"] {
            background-color: transparent !important;
            -webkit-mask-image: linear-gradient(to bottom, #000 0%, transparent 100%) !important;
            mask-image: linear-gradient(to bottom, #000 0%, transparent 100%) !important;
         }

         :root #main #main-view .main-topBar-background {
            background-color: rgba(var(--spice-rgb-main), 0.42) !important;
            background-image: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0)) !important;
            -webkit-backdrop-filter: blur(26px) saturate(170%);
            backdrop-filter: blur(26px) saturate(170%);
            box-shadow:
               inset 0 -1px 0 rgba(255, 255, 255, 0.07),
               0 12px 28px -14px rgba(0, 0, 0, 0.55);
         }

         :root #main .main-trackList-trackListRow {
            border-radius: 12px !important;
            transition: background-color 220ms ${EASE_HOVER}, box-shadow 220ms ${EASE_HOVER};
         }

         :root #main .main-trackList-trackListRow:hover {
            background-color: rgba(255, 255, 255, 0.06) !important;
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.08),
               inset 0 0 0 1px rgba(255, 255, 255, 0.04);
         }

         :root #main .main-trackList-trackListRow[aria-selected="true"] {
            background-color: rgba(var(--spice-rgb-button), 0.16) !important;
            box-shadow: inset 0 0 0 1px rgba(var(--spice-rgb-button), 0.3);
         }

         :root #main .main-trackList-rowSectionEnd {
            padding-left: 14px;
         }

         :root #main #main-view [data-encore-id="card"],
         :root #main #main-view .main-card-card {
            border-radius: 14px !important;
            transition:
               background-color 220ms ${EASE_HOVER},
               box-shadow 220ms ${EASE_HOVER},
               transform 220ms ${EASE_HOVER};
         }

         :root #main #main-view [data-encore-id="card"]:hover,
         :root #main #main-view .main-card-card:hover {
            transform: translateY(-2px) scale(1.012);
            background-color: rgba(255, 255, 255, 0.07) !important;
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.1),
               0 18px 36px -16px rgba(0, 0, 0, 0.65),
               0 0 30px -10px rgba(var(--spice-rgb-button), 0.35);
         }

         :root #main #main-view [${CARD_GRID_ATTRIBUTE}] > [role="row"] {
            overflow: visible !important;
         }

         :root #main #main-view [${SHELF_PAD_ATTRIBUTE}] {
            padding-block: 40px !important;
            margin-block: -40px !important;
         }

         :root #main #main-view [${SHELF_CLIP_ATTRIBUTE}] {
            overflow-x: clip !important;
            overflow-y: visible !important;
         }

         :root #main #main-view [data-encore-id="card"] img {
            border-radius: 10px !important;
         }

         :root:is(.sm-flat-glass, html) #main #Desktop_PanelContainer_Id [data-testid="lyrics-npv-section"] {
            border-radius: 18px !important;
            background-color: transparent !important;
            background-image:
               linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0) 40%),
               linear-gradient(180deg,
                  color-mix(in srgb, var(--liq-2, #8a6cff) 26%, rgba(var(--spice-rgb-main), 0.34)) 0%,
                  color-mix(in srgb, var(--liq-1, #8a6cff) 18%, rgba(var(--spice-rgb-main), 0.22)) 55%,
                  rgba(var(--spice-rgb-main), 0) 100%) !important;
            -webkit-backdrop-filter: none !important;
            backdrop-filter: none !important;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14) !important;
         }

         :root:is(.sm-flat-glass, html) #main #Desktop_PanelContainer_Id [data-testid="lyrics-npv-section"]:hover {
            transform: none;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
         }

         :root #main #main-view [data-testid="action-bar-row"] .e-10860-legacy-button-primary > span,
         :root #main #main-view [data-testid="action-bar-row"] .e-10860-legacy-button-primary {
            border-radius: 999px !important;
         }

         :root #main #main-view [data-testid="action-bar-row"] .e-10860-legacy-button-primary {
            transition: transform 220ms ${EASE_HOVER}, box-shadow 220ms ${EASE_HOVER};
            box-shadow: 0 10px 28px -8px rgba(var(--spice-rgb-button), 0.65);
         }

         :root #main #main-view [data-testid="action-bar-row"] .e-10860-legacy-button-primary:hover {
            transform: scale(1.06);
         }

         :root #main #main-view [data-testid="action-bar-row"] .e-10860-legacy-button-primary:active,
         :root #main #global-nav-bar button:active,
         :root #main ${PLAYER_BAR_SELECTOR} button:active {
            transform: scale(0.94);
            transition-duration: 90ms;
            transition-timing-function: ${EASE_PRESS};
         }

         :root #main ${PLAYER_BAR_SELECTOR} button {
            transition: transform 220ms ${EASE_HOVER}, color 220ms ${EASE_HOVER};
         }

         #context-menu [role="menu"],
         .main-contextMenu-menu {
            border-radius: 14px !important;
            background-color: rgba(var(--spice-rgb-main-elevated), 0.72) !important;
            -webkit-backdrop-filter: blur(28px) saturate(180%);
            backdrop-filter: blur(28px) saturate(180%);
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.14),
               inset 0 0 0 1px rgba(255, 255, 255, 0.06),
               0 24px 60px -18px rgba(0, 0, 0, 0.7) !important;
         }

         #context-menu [role="menuitem"] {
            border-radius: 8px !important;
         }

         .main-view-container__scroll-node ::-webkit-scrollbar-thumb,
         #Desktop_LeftSidebar_Id ::-webkit-scrollbar-thumb {
            border-radius: 999px;
         }

         :root #main [data-ambience-top] > #Desktop_LeftSidebar_Id,
         :root #main [data-ambience-top] > #main-view,
         :root #main [data-ambience-top] > #main-view + div {
            margin-bottom: ${PLAYER_BAR_GAP_PX}px;
         }

         :root #main ${PLAY_BUTTON_SELECTOR} > span {
            border-radius: 50% !important;
            background:
               radial-gradient(120% 120% at 30% 18%, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0) 46%),
               conic-gradient(from 210deg, var(--spice-button), var(--ambience-accent-2, var(--spice-button)), var(--spice-button-active), var(--spice-button)) !important;
            color: var(--spice-main) !important;
            transform: scale(1.14);
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.65),
               inset 0 -4px 10px rgba(0, 0, 0, 0.22),
               0 0 0 1px rgba(255, 255, 255, 0.18),
               0 8px 22px -6px rgba(var(--spice-rgb-button), 0.75),
               0 0 34px -6px rgba(var(--ambience-rgb-accent-2, 255, 255, 255), 0.45) !important;
            transition:
               transform 220ms ${EASE_HOVER},
               box-shadow 220ms ${EASE_HOVER};
         }

         :root #main ${PLAY_BUTTON_SELECTOR}:hover > span {
            transform: scale(1.22);
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.75),
               inset 0 -4px 10px rgba(0, 0, 0, 0.22),
               0 0 0 1px rgba(255, 255, 255, 0.24),
               0 10px 28px -6px rgba(var(--spice-rgb-button), 0.9),
               0 0 46px -4px rgba(var(--ambience-rgb-accent-2, 255, 255, 255), 0.6) !important;
         }

         :root #main ${PLAY_BUTTON_SELECTOR}:active > span {
            transform: scale(1.04);
            transition-duration: 90ms;
            transition-timing-function: ${EASE_PRESS};
         }

         :root #main ${PLAY_BUTTON_SELECTOR} > span::after {
            content: "";
            position: absolute;
            inset: -5px;
            border-radius: 50%;
            pointer-events: none;
            border: 1.5px solid rgba(255, 255, 255, 0.16);
            -webkit-mask-image: conic-gradient(from 300deg, #000 0deg, transparent 140deg, #000 220deg, transparent 320deg);
            mask-image: conic-gradient(from 300deg, #000 0deg, transparent 140deg, #000 220deg, transparent 320deg);
         }

         :root.ambience-paused #main ${PLAY_BUTTON_SELECTOR} > span {
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.65),
               inset 0 -4px 10px rgba(0, 0, 0, 0.22),
               0 0 0 1px rgba(255, 255, 255, 0.18),
               0 6px 16px -6px rgba(var(--spice-rgb-button), 0.5) !important;
         }

         :root #main #Desktop_LeftSidebar_Id button[aria-label="Create"] {
            border-radius: 999px !important;
            background-color: rgba(255, 255, 255, 0.07) !important;
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.12),
               inset 0 0 0 1px rgba(255, 255, 255, 0.05);
            transition: transform 220ms ${EASE_HOVER}, background-color 220ms ${EASE_HOVER};
         }

         :root #main #Desktop_LeftSidebar_Id button[aria-label="Create"]:hover {
            transform: scale(1.06);
            background-color: rgba(255, 255, 255, 0.12) !important;
         }

         @keyframes ambience-spin {
            to {
               transform: rotate(360deg);
            }
         }

         @media (prefers-reduced-motion: reduce) {
            :root #main .main-nowPlayingWidget-coverArt .cover-art,
            #ambience-liquid .layer,
            ${SLIDE_BEFORE_SELECTORS} {
               animation: none;
            }

            :root #main #global-nav-bar input[aria-label]:hover,
            :root #main #global-nav-bar input[aria-label]:focus,
            :root #main #global-nav-bar button[aria-label="Home"]:hover,
            :root #main .main-view-container .main-entityHeader-headerText > div:last-child:hover,
            :root #main .main-view-container [class*="legacy-button-primary"]:hover,
            :root #main .main-view-container .playlist-playlist-searchBoxContainer [class*="button--primary"]:hover,
            :root #main #Desktop_LeftSidebar_Id button[aria-label="Create"]:hover,
            :root #main #Desktop_LeftSidebar_Id [class*="legacy-chip__inner"]:hover,
            :root #main #Desktop_LeftSidebar_Id [role="row"]:not([aria-selected="true"]):hover,
            :root #main #main-view [data-encore-id="card"]:hover,
            :root #main #main-view .main-card-card:hover,
            :root #main #main-view [data-testid="action-bar-row"] .e-10860-legacy-button-primary:hover,
            ${LYRICS_SCOPE} [data-ambience-lyric="active"] {
               transform: none;
            }

            :root #main ${PLAY_BUTTON_SELECTOR}:hover > span {
               transform: scale(1.14);
            }

            :root #main #Desktop_LeftSidebar_Id,
            :root #main #main-view,
            :root #main .Root__right-sidebar-peek,
            :root #main [data-ambience-top]::before,
            :root #main [data-ambience-top]::after,
            #ambience-liquid,
            #ambience-liquid .layer,
            #ambience-liquid .glow,
            ${LYRICS_SCOPE} [data-ambience-lyric],
            ${LYRICS_SCOPE} [data-ambience-lyric]::before {
               transition-duration: 120ms !important;
            }
         }
      `;

      function hexToRgb(hex) {
         const value = parseInt(hex.trim().replace("#", ""), 16);
         return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
      }

      function rgbToHex(rgb) {
         return "#" + rgb.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("");
      }

      function rgbToHsl([red, green, blue]) {
         const r = red / 255;
         const g = green / 255;
         const b = blue / 255;
         const max = Math.max(r, g, b);
         const min = Math.min(r, g, b);
         const lightness = (max + min) / 2;
         const delta = max - min;

         if (delta === 0) {
            return [0, 0, lightness];
         }

         const saturation = delta / (1 - Math.abs(2 * lightness - 1));
         let hue;

         if (max === r) {
            hue = ((g - b) / delta) % 6;
         } else if (max === g) {
            hue = (b - r) / delta + 2;
         } else {
            hue = (r - g) / delta + 4;
         }

         return [(hue * 60 + 360) % 360, saturation, lightness];
      }

      function hslToRgb([hue, saturation, lightness]) {
         const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
         const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
         const offset = lightness - chroma / 2;
         const sector = Math.floor(hue / 60) % 6;
         const sectors = [
            [chroma, second, 0],
            [second, chroma, 0],
            [0, chroma, second],
            [0, second, chroma],
            [second, 0, chroma],
            [chroma, 0, second],
         ];

         return sectors[sector].map((channel) => (channel + offset) * 255);
      }

      function clamp(value, low, high) {
         return Math.min(high, Math.max(low, value));
      }

      function mix(from, to, amount) {
         return from.map((channel, index) => channel + (to[index] - channel) * amount);
      }

      function readSchemeColors() {
         const declared = {};

         [...document.styleSheets].forEach((sheet) => {
            let rules = [];

            try {
               rules = [...sheet.cssRules];
            } catch (error) {
               return;
            }

            rules.forEach((rule) => {
               const isRootRule = rule.selectorText === ":root";

               if (!isRootRule) {
                  return;
               }

               [...ACCENT_VARS, ...SURFACE_VARS].forEach((name) => {
                  const value = rule.style.getPropertyValue("--spice-" + name).trim();
                  const isHexColor = /^#[0-9a-f]{6}$/i.test(value);

                  if (isHexColor) {
                     declared[name] = hexToRgb(value);
                  }
               });
            });
         });

         return declared;
      }

      function refreshSchemeColors() {
         const latest = readSchemeColors();
         const isComplete = [...ACCENT_VARS, ...SURFACE_VARS].every((name) => latest[name]);

         if (isComplete) {
            schemeColors = latest;
         }
      }

      function loadImage(url) {
         return new Promise((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = "anonymous";
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = url;
         });
      }

      function dominantVibrantColor(image) {
         const canvas = document.createElement("canvas");
         canvas.width = SAMPLE_SIZE;
         canvas.height = SAMPLE_SIZE;
         const context = canvas.getContext("2d", { willReadFrequently: true });
         context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
         const pixels = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
         const buckets = new Map();

         for (let offset = 0; offset < pixels.length; offset += 4) {
            const rgb = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
            const [hue, saturation, lightness] = rgbToHsl(rgb);
            const isNearBlackOrWhite = lightness < 0.12 || lightness > 0.92;

            if (isNearBlackOrWhite) {
               continue;
            }

            const key = Math.round(hue / 15) + ":" + Math.round(saturation * 4);
            const bucket = buckets.get(key) || { count: 0, sum: [0, 0, 0], saturation: 0 };
            bucket.count += 1;
            bucket.saturation += saturation;
            bucket.sum = bucket.sum.map((channel, index) => channel + rgb[index]);
            buckets.set(key, bucket);
         }

         const ranked = [...buckets.values()]
            .map((bucket) => {
               const averageSaturation = bucket.saturation / bucket.count;
               const color = bucket.sum.map((channel) => channel / bucket.count);
               const hue = rgbToHsl(color)[0];
               const isWarmHue = hue >= SKIN_TONE_HUE_RANGE[0] && hue <= SKIN_TONE_HUE_RANGE[1];
               const isMuted = averageSaturation < SKIN_TONE_MAX_SATURATION;
               const looksLikeSkin = isWarmHue && isMuted;
               const weight = looksLikeSkin ? SKIN_TONE_PENALTY : 1;
               return { color, score: Math.sqrt(bucket.count) * averageSaturation * averageSaturation * weight };
            })
            .sort((first, second) => second.score - first.score);

         const best = ranked[0];
         const isTooGray = !best || rgbToHsl(best.color)[1] < MIN_COVER_SATURATION;

         if (isTooGray) {
            return { primary: null, secondary: null, palette: [] };
         }

         const palette = [];

         ranked.forEach((candidate) => {
            const hue = rgbToHsl(candidate.color)[0];
            const isProminent = candidate.score >= best.score * LIQUID_MIN_SCORE_SHARE;
            const isDistinct = palette.every((picked) => {
               const hueGap = Math.abs(rgbToHsl(picked)[0] - hue);
               return Math.min(hueGap, 360 - hueGap) >= LIQUID_MIN_HUE_GAP;
            });
            const hasRoom = palette.length < LIQUID_COLOR_COUNT;

            if (hasRoom && isProminent && isDistinct) {
               palette.push(candidate.color);
            }
         });

         const bestHue = rgbToHsl(best.color)[0];
         const secondary = ranked.find((candidate) => {
            const hueGap = Math.abs(rgbToHsl(candidate.color)[0] - bestHue);
            const wrappedGap = Math.min(hueGap, 360 - hueGap);
            const isDistinct = wrappedGap >= SECONDARY_MIN_HUE_GAP;
            const isProminent = candidate.score >= best.score * SECONDARY_MIN_SCORE_SHARE;
            return isDistinct && isProminent;
         });

         return { primary: best.color, secondary: secondary ? secondary.color : null, palette };
      }

      function liquidColorsFrom(coverColors) {
         const picked = coverColors.palette || [];
         const anchor = picked[0] || schemeColors["button"];
         const [anchorHue, anchorSaturation] = rgbToHsl(anchor);

         return LIQUID_LIGHTNESS.map((lightness, index) => {
            const source = picked[index];
            const shiftedHue = (anchorHue + LIQUID_HUE_SHIFTS[index] + 360) % 360;
            const [hue, saturation] = source ? rgbToHsl(source) : [shiftedHue, anchorSaturation];
            return hslToRgb([hue, clamp(saturation, 0.55, 0.95), lightness]);
         });
      }

      function writeLiquidColors(colors) {
         const rootStyle = document.documentElement.style;

         colors.forEach((rgb, index) => {
            rootStyle.setProperty("--liq-" + (index + 1), rgbToHex(rgb));
         });

         currentLiquid = colors;
      }

      function writeBlobColors(colors) {
         colors.forEach((rgb, index) => {
            liquid.style.setProperty("--liq-" + (index + 1), rgbToHex(rgb));
         });
      }

      function clearBlobColors() {
         cancelAnimationFrame(liquidTween);

         [1, 2, 3, 4].forEach((index) => liquid.style.removeProperty("--liq-" + index));
         currentBlob = null;
      }

      function tweenBlobColors(target) {
         cancelAnimationFrame(liquidTween);

         const from = currentBlob || currentLiquid;
         const canTween = Boolean(from) && !prefersReducedMotion() && !document.hidden;

         if (!canTween) {
            writeBlobColors(target);
            currentBlob = target;
            return;
         }

         const startedAt = performance.now();

         const step = (now) => {
            const progress = clamp((now - startedAt) / BLOB_TWEEN_MS, 0, 1);
            const eased = 1 - Math.pow(1 - progress, 3);

            writeBlobColors(target.map((rgb, index) => mix(from[index] || rgb, rgb, eased)));

            const isDone = progress >= 1;

            if (isDone) {
               currentBlob = target;
               return;
            }

            liquidTween = requestAnimationFrame(step);
         };

         liquidTween = requestAnimationFrame(step);
      }

      function rotatedCoverColors(coverColors, turns) {
         const palette = coverColors.palette || [];
         const canRotate = palette.length > 1 && turns > 0;

         if (!canRotate) {
            return coverColors;
         }

         const shift = turns % palette.length;
         return { ...coverColors, palette: [...palette.slice(shift), ...palette.slice(0, shift)] };
      }

      function applySection(index) {
         const section = trackSections[index];

         if (!section) {
            return;
         }

         activeSection = index;
         document.documentElement.style.setProperty("--ambience-energy", section.energy.toFixed(3));

         const canRotate = Boolean(lastBlended) && Boolean(liquid);

         if (canRotate) {
            tweenBlobColors(liquidColorsFrom(rotatedCoverColors(lastBlended, index)));
         }
      }

      function beatLoudnessFrom(analysis) {
         const beats = analysis.beats || [];
         const segments = analysis.segments || [];
         const peaks = new Array(beats.length).fill(-60);
         let segmentIndex = 0;

         beats.forEach((beat, beatIndex) => {
            const beatEnd = beat.start + beat.duration;

            while (segmentIndex < segments.length && segments[segmentIndex].start < beatEnd) {
               const segment = segments[segmentIndex];
               const insideBeat = segment.start + segment.duration > beat.start;

               if (insideBeat) {
                  peaks[beatIndex] = Math.max(peaks[beatIndex], segment.loudness_max ?? -60);
               }

               if (segment.start + segment.duration <= beatEnd) {
                  segmentIndex += 1;
               } else {
                  break;
               }
            }
         });

         const measured = peaks.filter((peak) => peak > -60);
         const hasMeasured = measured.length > 0;
         const quiet = hasMeasured ? Math.min(...measured) : -30;
         const loud = hasMeasured ? Math.max(...measured) : 0;
         const span = Math.max(loud - quiet, 6);

         return peaks.map((peak) => clamp((peak - quiet) / span, 0, 1));
      }

      function sectionsFrom(analysis) {
         const sections = (analysis.sections || []).map((section) => ({ start: section.start, loudness: section.loudness }));
         const loudest = Math.max(...sections.map((section) => section.loudness), SECTION_LOUDNESS_FLOOR_DB + 1);

         return sections.map((section) => {
            const span = loudest - SECTION_LOUDNESS_FLOOR_DB;
            const energy = clamp((section.loudness - SECTION_LOUDNESS_FLOOR_DB) / span, 0, 1);
            return { start: section.start, energy };
         });
      }

      function secondaryAccentFrom(coverColors, palette) {
         if (!coverColors.primary) {
            return palette["button-active"];
         }

         const [primaryHue, primarySaturation] = rgbToHsl(coverColors.primary);
         const fallbackHue = (primaryHue + 40) % 360;
         const [hue, saturation] = coverColors.secondary ? rgbToHsl(coverColors.secondary) : [fallbackHue, primarySaturation];
         return hslToRgb([hue, clamp(saturation, 0.5, 0.9), 0.72]);
      }

      function paletteFrom(coverColor) {
         if (!coverColor) {
            return schemeColors;
         }

         const [hue, saturation] = rgbToHsl(coverColor);
         const accentSaturation = clamp(saturation, 0.5, 0.9);
         const accent = hslToRgb([hue, accentSaturation, 0.68]);
         const accentActive = hslToRgb([hue, accentSaturation, 0.78]);
         const tint = hslToRgb([hue, clamp(saturation, 0.4, 0.7), 0.4]);
         const palette = {};

         ACCENT_VARS.forEach((name) => {
            const isActiveShade = name.endsWith("-active");
            palette[name] = isActiveShade ? accentActive : accent;
         });

         SURFACE_VARS.forEach((name) => {
            palette[name] = mix(schemeColors[name], tint, SURFACE_TINT_STRENGTH);
         });

         palette["button-disabled"] = mix(schemeColors["button-disabled"], accent, 0.35);
         return palette;
      }

      function writeColors(colors) {
         const rootStyle = document.documentElement.style;

         Object.entries(colors).forEach(([name, rgb]) => {
            const isAmbienceVar = name.startsWith("accent-") || name.startsWith("view-");
            const prefix = isAmbienceVar ? "--ambience-" : "--spice-";
            rootStyle.setProperty(prefix + name, rgbToHex(rgb));
            rootStyle.setProperty(prefix + "rgb-" + name, rgb.map(Math.round).join(","));
         });
      }

      function tweenColors(target) {
         cancelAnimationFrame(paletteTween);

         const from = currentPalette;
         const canTween = Boolean(from) && !prefersReducedMotion() && !document.hidden;

         if (!canTween) {
            writeColors(target);
            currentPalette = target;
            return;
         }

         const startedAt = performance.now();
         let writtenStep = -1;

         const step = (now) => {
            const progress = clamp((now - startedAt) / PALETTE_TWEEN_MS, 0, 1);
            const quantized = Math.ceil(progress * PALETTE_TWEEN_STEPS);
            const isNewStep = quantized !== writtenStep;

            if (isNewStep) {
               writtenStep = quantized;
               const eased = 1 - Math.pow(1 - quantized / PALETTE_TWEEN_STEPS, 3);
               const frame = {};

               Object.entries(target).forEach(([name, rgb]) => {
                  frame[name] = mix(from[name] || rgb, rgb, eased);
               });

               writeColors(frame);
            }

            const isDone = progress >= 1;

            if (isDone) {
               currentPalette = target;
               return;
            }

            paletteTween = requestAnimationFrame(step);
         };

         paletteTween = requestAnimationFrame(step);
      }

      function viewTintFrom(coverColor) {
         if (!coverColor) {
            return schemeColors["main"];
         }

         const [hue, saturation] = rgbToHsl(coverColor);
         return hslToRgb([hue, clamp(saturation, 0.35, 0.7), VIEW_TINT_LIGHTNESS]);
      }

      function viewContrastFrom(coverColor) {
         if (!coverColor) {
            return schemeColors["main-elevated"];
         }

         const [hue, saturation] = rgbToHsl(coverColor);
         return hslToRgb([hue, clamp(saturation, 0.3, 0.6), VIEW_CONTRAST_LIGHTNESS]);
      }

      function viewWeight() {
         const hasViewCover = Boolean(viewCoverColors && viewCoverColors.primary);

         if (!hasViewCover) {
            return 0;
         }

         const panel = document.querySelector(RIGHT_PANEL_SELECTOR);
         const isPanelOpen = Boolean(panel) && panel.getBoundingClientRect().width > 0;
         return isPanelOpen ? VIEW_WEIGHT_SIDEBAR_OPEN : VIEW_WEIGHT_SIDEBAR_CLOSED;
      }

      function distinctPalette(candidates) {
         const picked = [];

         candidates.forEach((color) => {
            const hue = rgbToHsl(color)[0];
            const isDistinct = picked.every((other) => {
               const hueGap = Math.abs(rgbToHsl(other)[0] - hue);
               return Math.min(hueGap, 360 - hueGap) >= LIQUID_MIN_HUE_GAP;
            });
            const hasRoom = picked.length < LIQUID_COLOR_COUNT;

            if (hasRoom && isDistinct) {
               picked.push(color);
            }
         });

         return picked;
      }

      function blendCoverColors(track, view, weight) {
         const hasTrack = Boolean(track && track.primary);
         const hasView = weight > 0 && Boolean(view && view.primary);

         if (!hasView) {
            return track || { primary: null, secondary: null, palette: [] };
         }

         if (!hasTrack) {
            return view;
         }

         const viewLeads = weight >= 0.5;
         const leader = viewLeads ? view : track;
         const follower = viewLeads ? track : view;
         const palette = distinctPalette([leader.palette[0], follower.palette[0], ...leader.palette.slice(1), ...follower.palette.slice(1)].filter(Boolean));

         return { primary: leader.primary, secondary: follower.primary, palette };
      }

      function composeColors() {
         const weight = viewWeight();
         const key = [appliedColorsFor, viewCoverUrl, weight].join("|");
         const isUnchanged = key === composedKey;

         if (isUnchanged) {
            return;
         }

         composedKey = key;

         const blended = blendCoverColors(trackCoverColors, viewCoverColors, weight);
         const palette = paletteFrom(blended.primary);
         const target = { ...palette, "accent-2": secondaryAccentFrom(blended, palette), "view-tint": viewTintFrom(blended.primary), "view-contrast": viewContrastFrom(blended.primary) };

         document.documentElement.toggleAttribute("data-ambience-view", weight > 0);
         lastBlended = blended;
         activeSection = -1;
         tweenColors(target);
         writeLiquidColors(liquidColorsFrom(blended));

         if (liquid) {
            clearBlobColors();
         }
      }

      function findViewCoverUrl() {
         const images = [...document.querySelectorAll(VIEW_COVER_SELECTOR)];
         const cover = images.find((image) => image.currentSrc && image.getClientRects().length > 0);
         const source = cover ? cover.currentSrc : "";
         const isSpotifyUri = source.startsWith("spotify:image:");
         return isSpotifyUri ? imageUrl(source) : source;
      }

      async function updateForView() {
         const url = findViewCoverUrl();
         const isSameCover = url === viewCoverUrl;

         if (isSameCover) {
            return;
         }

         viewCoverUrl = url;
         const token = ++viewToken;

         if (!url) {
            viewCoverColors = null;
            composeColors();
            return;
         }

         try {
            const entry = await coverEntryFor(url);
            const isStale = token !== viewToken;

            if (isStale) {
               return;
            }

            viewCoverColors = entry.coverColors;
         } catch (error) {
            const isStale = token !== viewToken;

            if (isStale) {
               return;
            }

            viewCoverColors = null;
         }

         composeColors();
      }

      function scheduleViewScan() {
         VIEW_SCAN_DELAYS_MS.forEach((delay) => setTimeout(updateForView, delay));
      }

      function watchRightSidebar() {
         const mainView = document.querySelector("#main-view");
         const panelHost = mainView ? mainView.parentElement : null;

         if (!panelHost) {
            setTimeout(watchRightSidebar, 1000);
            return;
         }

         let pendingCompose = 0;

         const observer = new MutationObserver(() => {
            clearTimeout(pendingCompose);
            pendingCompose = setTimeout(composeColors, 120);
         });

         observer.observe(panelHost, { childList: true });
      }

      function blurredBackdrop(image) {
         const canvas = document.createElement("canvas");
         canvas.width = BACKDROP_SIZE;
         canvas.height = BACKDROP_SIZE;
         const context = canvas.getContext("2d");
         const bleed = BACKDROP_BLUR_PX * 3;
         context.filter = `blur(${BACKDROP_BLUR_PX}px) saturate(160%)`;
         context.drawImage(image, -bleed, -bleed, BACKDROP_SIZE + bleed * 2, BACKDROP_SIZE + bleed * 2);
         return canvas.toDataURL("image/jpeg", 0.9);
      }

      function showBackdrop(url) {
         const nextLayer = visibleLayer === "a" ? "b" : "a";
         document.documentElement.style.setProperty("--ambience-cover-" + nextLayer, `url("${url}")`);
         document.documentElement.style.setProperty("--ambience-cover-current", `url("${url}")`);
         document.documentElement.dataset.ambienceLayer = nextLayer;
         visibleLayer = nextLayer;
      }

      function imageUrl(spotifyImageUri) {
         return spotifyImageUri ? spotifyImageUri.replace("spotify:image:", "https://i.scdn.co/image/") : null;
      }

      function rememberCover(url, entry) {
         coverCache.set(url, entry);

         const isOverLimit = coverCache.size > COVER_CACHE_LIMIT;

         if (isOverLimit) {
            coverCache.delete(coverCache.keys().next().value);
         }
      }

      async function coverEntryFor(url) {
         const cached = coverCache.get(url);

         if (cached) {
            return cached;
         }

         const sampleImage = await loadImage(url);
         const entry = { coverColors: dominantVibrantColor(sampleImage), backdropUrl: blurredBackdrop(sampleImage) };
         rememberCover(url, entry);

         return entry;
      }

      function applySchemeFallback() {
         trackCoverColors = null;
         appliedColorsFor = "";
         composedKey = null;
         composeColors();
      }

      async function updateForCurrentTrack(fromScheme = false) {
         const item = Spicetify.Player.data?.item;
         const sampleUrl = imageUrl(item?.metadata?.image_url);
         const token = ++requestToken;
         const colorKey = sampleUrl || "";
         const colorsUnchanged = !fromScheme && appliedColorsFor === colorKey;

         if (!fromScheme) {
            loadBeatsFor(item?.uri);
         }

         if (!sampleUrl) {
            if (!colorsUnchanged) {
               applySchemeFallback();
            }

            return;
         }

         try {
            const entry = await coverEntryFor(sampleUrl);
            const isStale = token !== requestToken;

            if (isStale) {
               return;
            }

            const rippleOrigin = fromScheme ? null : rippleOriginForTrackChange();

            if (!colorsUnchanged) {
               trackCoverColors = entry.coverColors;
               appliedColorsFor = colorKey;

               if (fromScheme) {
                  composedKey = null;
               }

               composeColors();
            }

            if (appliedBackdropFor !== sampleUrl) {
               showBackdrop(entry.backdropUrl);
               appliedBackdropFor = sampleUrl;
            }

            if (rippleOrigin) {
               rippleFromDisc(rippleOrigin);
            }
         } catch (error) {
            const isStale = token !== requestToken;

            if (!isStale) {
               applySchemeFallback();
            }
         }
      }

      function buildLiquid() {
         const element = document.createElement("div");
         element.id = "ambience-liquid";

         LIQUID_LAYERS.forEach((classNames) => {
            const layer = document.createElement("div");
            layer.className = classNames;
            element.appendChild(layer);
         });

         return element;
      }

      function mountLiquid() {
         const topContainer = document.querySelector("#main-view")?.parentElement;

         if (!topContainer) {
            return false;
         }

         topContainer.setAttribute("data-ambience-top", "");

         const isMounted = liquid.parentElement === topContainer && topContainer.firstChild === liquid;

         if (!isMounted) {
            topContainer.prepend(liquid);
         }

         return true;
      }

      function followPointerWithGlow() {
         const glow = liquid.querySelector(".glow");
         const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
         const current = { x: target.x, y: target.y };
         let frame = null;

         function settle() {
            frame = null;
            current.x += (target.x - current.x) * LIQUID_GLOW_EASE;
            current.y += (target.y - current.y) * LIQUID_GLOW_EASE;
            glow.style.transform = `translate3d(${current.x - LIQUID_GLOW_SIZE / 2}px, ${current.y - LIQUID_GLOW_SIZE / 2}px, 0)`;

            const isSettled = Math.abs(target.x - current.x) < 0.5 && Math.abs(target.y - current.y) < 0.5;

            if (!isSettled) {
               frame = requestAnimationFrame(settle);
            }
         }

         document.addEventListener("pointermove", (event) => {
            const isLyricsOpen = document.documentElement.classList.contains("ambience-lyrics-open");

            if (!isLyricsOpen || prefersReducedMotion()) {
               return;
            }

            target.x = event.clientX;
            target.y = event.clientY;
            glow.dataset.live = "";

            if (!frame) {
               frame = requestAnimationFrame(settle);
            }
         }, { passive: true });
      }

      function prefersReducedMotion() {
         return reducedMotionQuery.matches;
      }

      function rippleOriginForTrackChange() {
         const isFirstTrack = !hasRippled;
         hasRippled = true;

         const shouldSkip = isFirstTrack || document.hidden || prefersReducedMotion();

         if (shouldSkip) {
            return null;
         }

         if (!discCenter) {
            const disc = document.querySelector(".main-nowPlayingWidget-coverArt");
            const bounds = disc?.getBoundingClientRect();
            const hasBounds = Boolean(bounds) && bounds.width > 0;

            if (!hasBounds) {
               return { x: 70, y: window.innerHeight - 60 };
            }

            discCenter = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
         }

         return discCenter;
      }

      function rippleFromDisc(origin) {
         ripple.style.setProperty("--ripple-x", origin.x + "px");
         ripple.style.setProperty("--ripple-y", origin.y + "px");
         ripple.style.willChange = "transform, opacity";
         rippleAnimation?.cancel();

         const animation = ripple.animate([
            { opacity: 0, transform: "scale(0.25)" },
            { opacity: 1, transform: "scale(0.6)", offset: 0.25 },
            { opacity: 0, transform: "scale(1.5)" },
         ], { duration: RIPPLE_DURATION_MS, easing: EASE_CROSSFADE });

         const releaseLayer = () => {
            const isLatest = rippleAnimation === animation;

            if (isLatest) {
               rippleAnimation = null;
               ripple.style.willChange = "";
            }
         };

         rippleAnimation = animation;
         animation.finished.then(releaseLayer, releaseLayer);
      }

      function rememberBeats(trackId, beats) {
         beatCache.set(trackId, beats);

         const isOverLimit = beatCache.size > BEAT_CACHE_LIMIT;

         if (isOverLimit) {
            beatCache.delete(beatCache.keys().next().value);
         }
      }

      async function loadBeatsFor(trackUri) {
         clearTimeout(beatTimer);

         const trackId = trackUri?.startsWith("spotify:track:") ? trackUri.split(":")[2] : null;
         const isAlreadyLoaded = trackId && trackId === beatTrackId;

         if (isAlreadyLoaded) {
            scheduleNextBeat();
            return;
         }

         beatAbort?.abort();
         beatTrack = null;
         trackSections = [];
         activeSection = -1;
         beatTrackId = trackId;
         document.documentElement.style.removeProperty("--ambience-energy");

         if (!trackId) {
            return;
         }

         const cached = beatCache.get(trackId);

         if (cached) {
            beatTrack = cached.beats;
            trackSections = cached.sections;
            scheduleNextBeat();
            return;
         }

         const controller = new AbortController();
         beatAbort = controller;

         try {
            const token = Spicetify.Platform.AuthorizationAPI.getState().token.accessToken;
            const response = await fetch(`https://spclient.wg.spotify.com/audio-attributes/v1/audio-analysis/${trackId}?format=json`, {
               headers: { Authorization: "Bearer " + token },
               signal: controller.signal,
            });
            const analysis = await response.json();
            const isStale = controller.signal.aborted || Spicetify.Player.data?.item?.uri !== trackUri;

            if (isStale || !analysis.beats?.length) {
               return;
            }

            const barStarts = (analysis.bars || []).map((bar) => bar.start);
            const sections = sectionsFrom(analysis);
            const loudnessByBeat = beatLoudnessFrom(analysis);
            let barIndex = 0;
            let sectionIndex = 0;

            const beats = analysis.beats.map((beat, beatIndex) => {
               while (barIndex < barStarts.length && barStarts[barIndex] < beat.start - BAR_MATCH_SECONDS) {
                  barIndex += 1;
               }

               while (sectionIndex + 1 < sections.length && sections[sectionIndex + 1].start <= beat.start) {
                  sectionIndex += 1;
               }

               const startsBar = barIndex < barStarts.length && Math.abs(barStarts[barIndex] - beat.start) <= BAR_MATCH_SECONDS;
               return { start: beat.start, confidence: beat.confidence, startsBar, section: sectionIndex, loudness: loudnessByBeat[beatIndex] };
            });

            rememberBeats(trackId, { beats, sections });
            beatTrack = beats;
            trackSections = sections;
            scheduleNextBeat();
         } catch (error) {
            const wasAborted = controller.signal.aborted;

            if (!wasAborted) {
               beatTrack = null;
               beatTrackId = null;
            }
         }
      }

      function nextBeatAfter(seconds) {
         let low = 0;
         let high = beatTrack.length;

         while (low < high) {
            const middle = (low + high) >> 1;

            if (beatTrack[middle].start <= seconds) {
               low = middle + 1;
            } else {
               high = middle;
            }
         }

         return beatTrack[low] || null;
      }

      function beatStrength(beat) {
         const confidence = clamp(beat.confidence, 0, 1);
         const loudness = clamp(beat.loudness ?? confidence, 0, 1);
         const dynamics = LOUDNESS_WEIGHT * loudness + (1 - LOUDNESS_WEIGHT) * confidence;
         return 0.25 + 0.75 * dynamics;
      }

      function bloomLiquid(strength) {
         const bloomLayer = liquid.querySelector(".bloom");

         bloomLayer?.animate([
            { opacity: 0, transform: "scale(1)" },
            { opacity: BEAT_BLOOM_OPACITY * strength, transform: `scale(${1 + BEAT_BLOOM_SCALE * strength})`, offset: 0.2 },
            { opacity: 0, transform: "scale(1)" },
         ], { duration: BAR_BREATH_MS, easing: `steps(${BAR_BREATH_STEPS})` });
      }

      function sweepMainView(strength) {
         const mainView = document.querySelector("#main-view");
         const isStrong = strength >= SWEEP_MIN_STRENGTH;

         if (!mainView || !isStrong) {
            return;
         }

         mainView.animate([
            { opacity: 0, transform: "translateX(-70%)" },
            { opacity: SWEEP_PEAK_OPACITY * strength, offset: 0.3 },
            { opacity: 0, transform: "translateX(70%)" },
         ], { duration: BAR_BREATH_MS, easing: `steps(${BAR_BREATH_STEPS})`, pseudoElement: "::after" });
      }

      function pulseBeat(beat) {
         const strength = beatStrength(beat);
         const entersSection = beat.section !== activeSection;

         if (entersSection) {
            applySection(beat.section);
         }

         const visualizerMode = document.documentElement.dataset.ambienceVisualizer || "on";
         const bloomAllowed = visualizerMode === "on" || visualizerMode === "nosweep";
         const sweepAllowed = visualizerMode === "on" || visualizerMode === "nobloom";

         if (beat.startsBar && bloomAllowed) {
            bloomLiquid(strength);
         }

         if (beat.startsBar && sweepAllowed) {
            sweepMainView(strength);
         }
         const playButton = document.querySelector(PLAY_BUTTON_SELECTOR);

         playButton?.animate([
            { opacity: strength, transform: "scale(0.9)" },
            { opacity: strength * 0.62, transform: "scale(1.13)", offset: 0.25 },
            { opacity: strength * 0.31, transform: "scale(1.31)", offset: 0.5 },
            { opacity: 0, transform: "scale(1.5)" },
         ], { duration: BEAT_GLOW_MS, easing: `steps(${BEAT_GLOW_STEPS})`, pseudoElement: "::before" });

         if (!beat.startsBar) {
            return;
         }

         const isLyricsOpen = document.documentElement.classList.contains("ambience-lyrics-open");

         if (isLyricsOpen) {
            liquid.animate([
               { transform: "scale(1)" },
               { transform: `scale(${1 + LIQUID_BREATH_SCALE * strength})`, offset: 0.2 },
               { transform: "scale(1)" },
            ], { duration: BAR_BREATH_MS, easing: `steps(${BAR_BREATH_STEPS})` });
         }

         const backdropLayer = visibleLayer === "a" ? "::before" : "::after";
         const topContainer = document.querySelector("[data-ambience-top]");

         topContainer?.animate([
            { opacity: BACKDROP_OPACITY },
            { opacity: BACKDROP_OPACITY + 0.12 * strength, offset: 0.2 },
            { opacity: BACKDROP_OPACITY },
         ], { duration: BAR_BREATH_MS, easing: `steps(${BAR_BREATH_STEPS})`, pseudoElement: backdropLayer });
      }

      function scheduleNextBeat() {
         clearTimeout(beatTimer);

         const canPulse = beatTrack && Spicetify.Player.isPlaying() && !document.hidden && !prefersReducedMotion();

         if (!canPulse) {
            return;
         }

         const position = Spicetify.Player.getProgress() / 1000;
         const beat = nextBeatAfter(position + 0.005);

         if (!beat) {
            return;
         }

         beatTimer = setTimeout(() => {
            pulseBeat(beat);
            scheduleNextBeat();
         }, (beat.start - position) * 1000);
      }

      function watchSchemeChanges() {
         let pendingUpdate = null;

         core.onHeadMutations((mutations) => {
            const touchesMarketplaceCss = mutations.some((mutation) => {
               const node = mutation.target.nodeType === Node.TEXT_NODE ? mutation.target.parentElement : mutation.target;
               const isMarketplaceTarget = node?.classList?.contains("marketplaceCSS");

               if (isMarketplaceTarget) {
                  return true;
               }

               return Array.prototype.some.call(mutation.addedNodes, (added) => added.classList?.contains("marketplaceCSS"));
            });

            if (!touchesMarketplaceCss) {
               return;
            }

            clearTimeout(pendingUpdate);
            pendingUpdate = setTimeout(() => {
               refreshSchemeColors();
               updateForCurrentTrack(true);
            }, 200);
         });
      }

      function learnActiveLyricClass(lines) {
         const activeLine = lines.find((line) => getComputedStyle(line).viewTimelineName === ACTIVE_LYRIC_TIMELINE);

         if (!activeLine) {
            return;
         }

         const sharedClasses = new Set(lines.find((line) => line !== activeLine)?.classList || []);
         activeLyricClass = [...activeLine.classList].find((name) => !sharedClasses.has(name)) || null;
      }

      function tagLyrics(container) {
         const lines = [...container.querySelectorAll(LYRIC_LINE_SELECTOR)];
         const isSyncUnknown = lines.length > 0 && !container.hasAttribute("data-ambience-sync");

         if (isSyncUnknown) {
            const isSeekable = getComputedStyle(lines[0]).cursor === "pointer";
            container.setAttribute("data-ambience-sync", isSeekable ? "timed" : "static");
         }

         if (!activeLyricClass) {
            learnActiveLyricClass(lines);
         }

         if (!activeLyricClass) {
            lines.forEach((line) => {
               line.dataset.ambienceLyric ||= "future";
            });
            return;
         }

         const activeIndex = lines.findIndex((line) => line.classList.contains(activeLyricClass));
         const nothingTaggedYet = !lines.some((line) => line.dataset.ambienceLyric);

         if (activeIndex === -1) {
            if (nothingTaggedYet) {
               lines.forEach((line, index) => {
                  const isOpeningLine = index < 2;
                  line.dataset.ambienceLyric = isOpeningLine ? "next-" + (index + 1) : "future";
               });
            }

            return;
         }

         lines.forEach((line, index) => {
            const distance = index - activeIndex;
            let state = "future";

            if (distance < 0) {
               state = "past";
            } else if (distance === 0) {
               state = "active";
            } else if (distance <= 2) {
               state = "next-" + distance;
            }

            if (line.dataset.ambienceLyric !== state) {
               line.dataset.ambienceLyric = state;
            }
         });
      }

      function tagCardShelves() {
         const grids = document.querySelectorAll(`#main-view [role="grid"]:not([${CARD_GRID_ATTRIBUTE}])`);

         grids.forEach((grid) => {
            const hasCards = Boolean(grid.querySelector(CARD_IN_GRID));

            if (!hasCards) {
               return;
            }

            grid.setAttribute(CARD_GRID_ATTRIBUTE, "");

            const wrapper = grid.parentElement;
            const shelf = wrapper?.parentElement;
            const outerShelf = shelf?.parentElement;
            const isPadShelf = wrapper?.tagName === "DIV" && shelf?.tagName === "DIV";
            const isClipShelf = isPadShelf && outerShelf?.tagName === "DIV";

            if (isPadShelf) {
               shelf.setAttribute(SHELF_PAD_ATTRIBUTE, "");
            }

            if (isClipShelf) {
               outerShelf.setAttribute(SHELF_CLIP_ATTRIBUTE, "");
            }
         });
      }

      function softenSidebarScrims() {
         const sidebar = document.querySelector(".Root__right-sidebar-peek");

         if (!sidebar) {
            return;
         }

         const emptyLayers = [...sidebar.querySelectorAll(`div:empty:not([${SCRIM_ATTRIBUTE}])`)].filter((element) => !checkedScrimCandidates.has(element));
         emptyLayers.forEach((element) => checkedScrimCandidates.add(element));

         const untagged = emptyLayers.filter((element) => getComputedStyle(element).backgroundImage.includes(DARK_SCRIM_MARKER));

         untagged.forEach((scrim) => {
            const groupHasPrimary = scrim.parentElement.querySelector(`:scope > [${SCRIM_ATTRIBUTE}="primary"]`);
            scrim.setAttribute(SCRIM_ATTRIBUTE, groupHasPrimary ? "muted" : "primary");
         });
      }

      function watchLyrics() {
         const watchedContainers = new WeakSet();
         const markedHosts = new Set();
         const markedPanels = new Set();
         let markedStage = null;
         let coveredPanelsByStage = [];
         let scanScheduled = false;
         let lastScanAt = 0;

         const lineObserver = new MutationObserver((mutations) => {
            const containers = new Set(mutations.map((mutation) => mutation.target.closest?.(LYRICS_CONTAINER_SELECTOR)).filter(Boolean));
            containers.forEach(tagLyrics);
         });

         function markLyricsHosts(allContainers) {
            const backdropContainers = allContainers.filter((container) => !container.closest(".Root__right-sidebar-peek"));
            const currentHosts = new Set(backdropContainers.map((container) => container.closest(LYRICS_HOST_SELECTOR)).filter(Boolean));

            const currentPanels = new Set([...currentHosts].map((host) => host.closest("[data-ambience-top] > *")).filter((panel) => panel && panel.id !== "main-view"));

            markedHosts.forEach((host) => {
               if (!currentHosts.has(host)) {
                  host.removeAttribute(LYRICS_HOST_ATTRIBUTE);
                  markedHosts.delete(host);
               }
            });

            markedPanels.forEach((panel) => {
               if (!currentPanels.has(panel)) {
                  panel.removeAttribute(LYRICS_PANEL_ATTRIBUTE);
                  markedPanels.delete(panel);
               }
            });

            currentHosts.forEach((host) => {
               host.setAttribute(LYRICS_HOST_ATTRIBUTE, "");
               markedHosts.add(host);
            });

            currentPanels.forEach((panel) => {
               panel.setAttribute(LYRICS_PANEL_ATTRIBUTE, "");
               markedPanels.add(panel);
            });

            const stage = findStage(allContainers);
            markStage(stage);

            const hasHosts = currentHosts.size > 0 || Boolean(stage);
            const isLyricsOpen = hasHosts && mountLiquid();
            document.documentElement.classList.toggle("ambience-lyrics-open", isLyricsOpen);
         }

         function findStage(allContainers) {
            const isStageOn = document.documentElement.classList.contains(STAGE_CLASS);

            if (!isStageOn) {
               return null;
            }

            const cinema = allContainers.find((container) => container.matches(CINEMA_CONTAINER_SELECTOR));
            const panel = cinema?.closest("[data-ambience-top] > *");
            const isExpandedView = Boolean(panel?.querySelector(STAGE_MODES_SELECTOR));
            return isExpandedView ? panel : null;
         }

         function markStage(stage) {
            if (markedStage && markedStage !== stage) {
               markedStage.removeAttribute(STAGE_ATTRIBUTE);
            }

            markedStage = stage;

            const coveredPanels = stage ? [...stage.parentElement.children].filter((panel) => panel.matches(STAGE_COVERED_SELECTOR)) : [];

            coveredPanelsByStage.forEach((panel) => {
               if (!coveredPanels.includes(panel)) {
                  panel.removeAttribute(STAGE_COVERED_ATTRIBUTE);
               }
            });

            coveredPanelsByStage = coveredPanels;
            coveredPanels.forEach((panel) => panel.setAttribute(STAGE_COVERED_ATTRIBUTE, ""));

            if (!stage) {
               return;
            }

            const mode = stage.querySelector(LYRICS_CONTAINER_SELECTOR) ? "lyrics" : "media";

            if (stage.getAttribute(STAGE_ATTRIBUTE) !== mode) {
               stage.setAttribute(STAGE_ATTRIBUTE, mode);
            }
         }

         function watchStageSwitch() {
            let wasStageOn = document.documentElement.classList.contains(STAGE_CLASS);

            core.onRootAttributes((records) => {
               const classChanged = records.some((record) => record.attributeName === "class");

               if (!classChanged) {
                  return;
               }

               const isStageOn = document.documentElement.classList.contains(STAGE_CLASS);

               if (isStageOn === wasStageOn) {
                  return;
               }

               wasStageOn = isStageOn;
               scanForContainers();
            });
         }

         function scanForContainers() {
            scanScheduled = false;
            lastScanAt = performance.now();

            softenSidebarScrims();
            tagCardShelves();

            const allContainers = [...document.querySelectorAll(`${LYRICS_CONTAINER_SELECTOR}, ${CINEMA_CONTAINER_SELECTOR}`)];
            markLyricsHosts(allContainers);

            allContainers.filter((container) => container.matches(LYRICS_CONTAINER_SELECTOR)).forEach((container) => {
               const isNewContainer = !watchedContainers.has(container);

               if (isNewContainer) {
                  watchedContainers.add(container);
                  lineObserver.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
                  tagLyrics(container);
               }
            });
         }

         function isListNoise(mutation) {
            const target = mutation.target;
            const isElement = target.nodeType === Node.ELEMENT_NODE;
            return isElement && Boolean(target.closest(LIST_NOISE_SELECTOR));
         }

         core.onBodyMutations((mutations) => {
            if (scanScheduled) {
               return;
            }

            const isElementNode = (node) => node.nodeType === Node.ELEMENT_NODE;
            const changedElements = mutations.some((mutation) => {
               const touchesElement = Array.prototype.some.call(mutation.addedNodes, isElementNode)
                  || Array.prototype.some.call(mutation.removedNodes, isElementNode);
               return touchesElement && !isListNoise(mutation);
            });

            if (!changedElements) {
               return;
            }

            scanScheduled = true;

            const waitMs = Math.max(0, SCAN_MIN_GAP_MS - (performance.now() - lastScanAt));
            setTimeout(() => requestAnimationFrame(() => setTimeout(scanForContainers, 0)), waitMs);
         });

         document.documentElement.classList.add(STAGE_CLASS);
         watchStageSwitch();
         scanForContainers();
      }

      function syncHiddenState() {
         document.documentElement.classList.toggle("ambience-hidden", document.hidden);
      }

      function syncPausedState() {
         const isPaused = !Spicetify.Player.isPlaying();
         document.documentElement.classList.toggle("ambience-paused", isPaused);
      }

      function start() {
         document.head.appendChild(style);
         mountLiquid();
         watchSchemeChanges();
         watchLyrics();
         followPointerWithGlow();

         core.onPlayer("songchange", () => updateForCurrentTrack());
         core.onRoute(scheduleViewScan);
         watchRightSidebar();
         core.onPlayer("onplaypause", () => {
            syncPausedState();
            scheduleNextBeat();
         });

         document.addEventListener("visibilitychange", () => {
            syncHiddenState();
            scheduleNextBeat();
         });
         document.body.appendChild(ripple);
         window.addEventListener("resize", () => (discCenter = null), { passive: true });

         syncPausedState();
         syncHiddenState();
         updateForCurrentTrack();
         scheduleViewScan();
      }

      function isPlayerReady() {
         const playerReady = window.Spicetify?.Player?.addEventListener && Spicetify.Player.data && document.head;

         if (!playerReady) {
            return false;
         }

         refreshSchemeColors();
         return Boolean(schemeColors);
      }

      core.whenReady("albumAmbience", isPlayerReady, start);
   }

   function comfyTweaks(core) {
      const style = document.createElement("style");
      style.id = "comfy-tweaks";
      style.textContent = `
         :root .global-nav .Root__top-container {
            grid-template-rows: auto max(48px, var(--comfy-topbar-height, 64px) / var(--zoom, 1) - 16px) minmax(0, 1fr) auto !important;
         }

         :root #main .Root {
            height: calc(100% + 16px) !important;
         }

         :root #main [data-testid="now-playing-bar"],
         :root #main aside[aria-label="Now playing bar"] {
            transform: none !important;
         }

         :root #main .main-view-container .main-entityHeader-container .main-entityHeader-backgroundColor {
            background: linear-gradient(to bottom,
               rgba(var(--spice-rgb-main), 0.5) 0%,
               rgba(var(--spice-rgb-main), 0.28) 60%,
               rgba(var(--spice-rgb-main), 0) 100%) !important;
         }

         :root #main .main-view-container .main-entityHeader-metaData,
         :root #main .main-view-container .playlist-playlist-actionBarBackground-background {
            --text-subdued: var(--spice-subtext) !important;
            background: none !important;
            box-shadow: none !important;
            -webkit-mask-image: none !important;
            mask-image: none !important;
         }

         :root #main .main-view-container .main-entityHeader-metaData {
            row-gap: 4px;
            color: var(--spice-subtext) !important;
         }

         :root #main .main-view-container .main-entityHeader-metaData > span + .main-entityHeader-metaDataText::before {
            content: none !important;
         }

         :root #main .main-view-container .main-entityHeader-creatorWrapper button {
            display: none !important;
         }

         :root #main [data-testid="now-playing-bar"] .main-addButton-button.control-button-heart {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 32px !important;
            height: 32px !important;
            padding: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
            border: none !important;
         }

         :root #main [data-testid="now-playing-bar"] .main-addButton-button.control-button-heart[aria-checked="false"] :not([fill="none"]) {
            fill: currentColor !important;
         }
         :root #main #global-nav-bar {
            --topbar-control: 36px;
            --topbar-surface: rgba(var(--spice-rgb-text), 0.06);
            --topbar-surface-hover: rgba(var(--spice-rgb-text), 0.11);
            --topbar-hairline: rgba(var(--spice-rgb-text), 0.08);
            background: transparent !important;
            padding: 0 14px !important;
            align-items: center !important;
         }

         :root #main #global-nav-bar button {
            transition: background-color 220ms linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1), color 220ms linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1), transform 250ms linear(0, 0.023 3.2%, 0.101 7.1%, 0.198 10.7%, 0.533 21.7%, 0.712 28.8%, 0.837 35.5%, 0.923 42.2%, 0.984 50.5%, 1.015 60.7%, 1.02 72.2%, 1), opacity 220ms linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1) !important;
         }

         :root #main #global-nav-bar button:active {
            transform: scale(0.94);
            transition-duration: 90ms !important;
            transition-timing-function: linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1), linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1), linear(0, 0.003 1.1%, 0.027 3.4%, 0.091 6.7%, 0.445 20.2%, 0.55 24.7%, 0.619 28.1%, 0.732 34.8%, 0.827 42.7%, 0.904 52.8%, 0.951 64%, 0.981 78.7%, 1), linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1) !important;
         }

         :root #main .main-globalNav-historyButtonsWrapper {
            align-items: center !important;
            gap: 10px;
         }

         :root #main .main-globalNav-historyButtons {
            height: var(--topbar-control) !important;
            margin-left: 30px !important;
            padding: 0 3px !important;
            gap: 2px;
            align-items: center !important;
            border-radius: 999px !important;
            background: var(--topbar-surface) !important;
            box-shadow: inset 0 0 0 1px var(--topbar-hairline) !important;
         }

         :root #main .main-globalNav-historyButtons button {
            width: 30px !important;
            height: 30px !important;
            padding: 0 !important;
            border-radius: 999px !important;
            justify-content: center !important;
         }

         :root #main .main-globalNav-historyButtons button:hover:not([disabled]) {
            background: var(--topbar-surface-hover) !important;
         }

         :root #main #global-nav-bar button[aria-label="Marketplace"],
         :root #main #global-nav-bar button[aria-label="Home"],
         :root #main .main-globalNav-contentRight button[aria-label] {
            width: var(--topbar-control) !important;
            height: var(--topbar-control) !important;
            min-width: var(--topbar-control) !important;
            padding: 0 !important;
            border-radius: 999px !important;
            background: transparent !important;
            color: var(--spice-subtext) !important;
            justify-content: center !important;
            align-items: center !important;
         }

         :root #main #global-nav-bar button[aria-label="Marketplace"]:hover,
         :root #main #global-nav-bar button[aria-label="Home"]:hover,
         :root #main .main-globalNav-contentRight button[aria-label]:hover {
            background: var(--topbar-surface-hover) !important;
            color: var(--spice-text) !important;
         }

         :root #main #global-nav-bar button[aria-label="Marketplace"] svg,
         :root #main #global-nav-bar button[aria-label="Home"] svg,
         :root #main .main-globalNav-contentRight button[aria-label] svg {
            width: 20px !important;
            height: 20px !important;
         }

         :root #main .main-globalNav-searchContainer {
            align-items: center !important;
            gap: 8px;
         }

         :root #main #global-nav-bar button[aria-label="Home"] {
            width: 40px !important;
            height: 40px !important;
            background: var(--topbar-surface) !important;
            box-shadow: inset 0 0 0 1px var(--topbar-hairline) !important;
         }

         :root #main .main-globalNav-contentRight,
         :root #main .main-globalNav-contentRight .main-actionButtons {
            align-items: center !important;
            gap: 4px;
            padding: 0 !important;
         }

         :root #main .main-globalNav-contentRight button[aria-label="Studio"] img,
         :root #main .main-globalNav-contentRight button[aria-label="Studio"] svg {
            filter: grayscale(1) brightness(1.4);
            opacity: 0.7;
            transition: filter 220ms linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1), opacity 220ms linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1);
         }

         :root #main .main-globalNav-contentRight button[aria-label="Studio"]:hover img,
         :root #main .main-globalNav-contentRight button[aria-label="Studio"]:hover svg {
            filter: none;
            opacity: 1;
         }

         :root #main .main-globalNav-contentRight > .main-actionButtons > button:last-child {
            margin-left: 6px;
            background: transparent !important;
         }

         :root #main .main-globalNav-contentRight > .main-actionButtons > button:last-child figure,
         :root #main .main-globalNav-contentRight > .main-actionButtons > button:last-child > span,
         :root #main .main-globalNav-contentRight > .main-actionButtons > button:last-child img {
            width: 30px !important;
            height: 30px !important;
            border-radius: 999px !important;
            box-shadow: 0 0 0 2px var(--topbar-hairline);
         }

         :root #main .main-globalNav-historyButtons button svg {
            width: 20px !important;
            height: 20px !important;
         }

         :root #main .main-globalNav-searchInputWrapper {
            height: 40px !important;
         }

         :root #main #global-nav-bar button[aria-label="Marketplace"] {
            background: var(--topbar-surface) !important;
            box-shadow: inset 0 0 0 1px var(--topbar-hairline) !important;
         }

         :root #main .custom-navlinks-scrollable_container {
            display: flex;
            align-items: center;
         }

         :root #main [data-testid="now-playing-bar"] {
            --player-ease: cubic-bezier(0.22, 1, 0.36, 1);
            --player-hairline: rgba(var(--spice-rgb-text), 0.07);
            --player-subdued: rgba(var(--spice-rgb-subtext), 0.85);
            --player-control: 32px;
            --player-cover: 56px;
            --player-gutter: 16px;
         }

         :root #main [data-testid="now-playing-bar"] {
            border-radius: 14px !important;
            background: linear-gradient(to bottom,
               rgba(var(--spice-rgb-main), 0.62),
               rgba(var(--spice-rgb-main), 0.78)) !important;
            backdrop-filter: blur(28px) saturate(1.4) !important;
            box-shadow: inset 0 1px 0 var(--player-hairline), 0 -6px 24px rgba(0, 0, 0, 0.18) !important;
            overflow: hidden !important;
         }

         :root #main [data-testid="now-playing-bar"] > div:first-child {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) minmax(360px, 720px) minmax(0, 1fr) !important;
            align-items: center !important;
            column-gap: 24px !important;
            flex: 0 0 72px !important;
            height: 72px !important;
            margin-block: auto !important;
            padding: 0 var(--player-gutter) !important;
         }

         :root #main [data-testid="now-playing-bar"] > div:first-child > div {
            width: auto !important;
            min-width: 0 !important;
            padding: 0 !important;
         }

         :root #main [data-testid="now-playing-bar"] [data-testid="now-playing-widget-v2"] {
            height: var(--player-cover) !important;
            gap: 12px !important;
            align-items: center !important;
         }

         :root #main [data-testid="now-playing-bar"] [data-testid="now-playing-widget-v2"] > div {
            flex-shrink: 0;
            margin: 0 !important;
         }

         :root #main [data-testid="now-playing-bar"] [data-testid="now-playing-widget-v2"] > div:nth-child(2) {
            display: flex !important;
            flex-direction: column !important;
            justify-content: center !important;
            flex-shrink: 1;
            gap: 2px !important;
            min-width: 0 !important;
         }

         :root #main [data-testid="now-playing-bar"] [data-testid="cover-art-container"],
         :root #main [data-testid="now-playing-bar"] [data-testid="cover-art-button"] {
            width: var(--player-cover) !important;
            height: var(--player-cover) !important;
            border-radius: 8px !important;
            overflow: hidden !important;
         }

         :root #main [data-testid="now-playing-bar"] [data-testid="now-playing-widget-v2"] > div:nth-child(2) > div:first-child,
         :root #main [data-testid="now-playing-bar"] [data-testid="now-playing-widget-v2"] > div:nth-child(2) > div:first-child * {
            font-size: 14px !important;
            font-weight: 600 !important;
            line-height: 18px !important;
            letter-spacing: -0.005em !important;
         }

         :root #main [data-testid="now-playing-bar"] [data-testid="now-playing-widget-v2"] > div:nth-child(2) > div:nth-child(2),
         :root #main [data-testid="now-playing-bar"] [data-testid="now-playing-widget-v2"] > div:nth-child(2) > div:nth-child(2) * {
            font-size: 12px !important;
            line-height: 16px !important;
            color: var(--player-subdued) !important;
         }

         :root #main [data-testid="now-playing-bar"] [data-testid="now-playing-widget-v2"] > div:nth-child(2) > div:nth-child(3),
         :root #main [data-testid="now-playing-bar"] [data-testid="now-playing-widget-v2"] > div:nth-child(2) > div:nth-child(3) * {
            font-size: 10.5px !important;
            line-height: 14px !important;
            letter-spacing: 0.06em !important;
            text-transform: uppercase !important;
            color: rgba(var(--spice-rgb-subtext), 0.6) !important;
         }

         :root #main [data-testid="now-playing-bar"] .dj-info-now-playing {
            display: none !important;
         }

         :root #main .Root__top-container:has(> .Root__nav-bar:not([class="Root__nav-bar"])) > .Root__main-view {
            visibility: hidden !important;
         }

         :root #main .Root__right-sidebar:has(aside) > * {
            --glass-ease: cubic-bezier(0.22, 1, 0.36, 1);
            --glass-fill: rgba(var(--spice-rgb-text), 0.055);
            --glass-fill-hover: rgba(var(--spice-rgb-text), 0.09);
            --glass-edge: rgba(var(--spice-rgb-text), 0.1);
            --glass-shine: rgba(255, 255, 255, 0.08);
            background-color: rgba(var(--spice-rgb-main), 0.42) !important;
            backdrop-filter: blur(40px) saturate(1.8) brightness(1.08) !important;
            box-shadow: inset 0 0 0 1px var(--glass-edge), inset 0 1px 0 var(--glass-shine) !important;
            border-radius: 14px !important;
         }

         :root #main .Root__right-sidebar:has(aside) .Root__right-sidebar-peek {
            isolation: isolate;
            overflow: hidden !important;
         }

         :root #main .Root__right-sidebar:has(aside) .Root__right-sidebar-peek::before {
            content: "";
            position: absolute;
            inset: -40px;
            z-index: -1;
            pointer-events: none;
            background-image: var(--ambience-cover-b, none);
            background-size: cover;
            background-position: center;
            filter: blur(56px) saturate(1.4) brightness(0.75);
            opacity: 0.5;
         }

         :root[data-ambience-layer="a"] #main .Root__right-sidebar:has(aside) .Root__right-sidebar-peek::before {
            background-image: var(--ambience-cover-a, none);
         }

         :root #main .Root__right-sidebar aside {
            background: linear-gradient(160deg,
               rgba(255, 255, 255, 0.07) 0%,
               rgba(255, 255, 255, 0.02) 35%,
               rgba(var(--spice-rgb-main), 0.12) 100%) !important;
         }

         :root #main .Root__right-sidebar aside::before {
            background-color: transparent !important;
         }

         :root #main .Root__right-sidebar aside [aria-label="Current device"] {
            background: linear-gradient(145deg,
               rgba(var(--spice-rgb-text), 0.1) 0%,
               rgba(var(--spice-rgb-text), 0.04) 100%) !important;
            backdrop-filter: blur(20px) saturate(1.4) !important;
            border-radius: 16px !important;
            box-shadow: inset 0 0 0 1px var(--glass-edge), inset 0 1px 0 var(--glass-shine), 0 8px 24px rgba(0, 0, 0, 0.18) !important;
            overflow: hidden !important;
         }

         :root #main .Root__right-sidebar aside [data-testid="device-picker-row-sidepanel"] [data-testid="device-icon"] {
            color: var(--spice-button) !important;
            filter: drop-shadow(0 0 8px rgba(var(--spice-rgb-button), 0.45)) !important;
         }

         :root #main .Root__right-sidebar aside [aria-label="Current device"] button {
            border: none !important;
            border-radius: 999px !important;
            background: var(--glass-fill-hover) !important;
            box-shadow: inset 0 0 0 1px var(--glass-edge), inset 0 1px 0 var(--glass-shine) !important;
            transition: background-color 220ms linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1), transform 250ms linear(0, 0.023 3.2%, 0.101 7.1%, 0.198 10.7%, 0.533 21.7%, 0.712 28.8%, 0.837 35.5%, 0.923 42.2%, 0.984 50.5%, 1.015 60.7%, 1.02 72.2%, 1) !important;
         }

         :root #main .Root__right-sidebar aside [aria-label="Current device"] button:hover {
            background: rgba(var(--spice-rgb-text), 0.14) !important;
            transform: translateY(-1px);
         }

         :root #main .Root__right-sidebar aside [data-testid="system-audio-outputs-list"] > div > div,
         :root #main .Root__right-sidebar aside [data-testid="list-row-external-link"] {
            margin: 2px 0 !important;
            border-radius: 12px !important;
            transition: background-color 220ms linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1), box-shadow 220ms linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1) !important;
         }

         :root #main .Root__right-sidebar aside [data-testid="system-audio-outputs-list"] > div > div:hover,
         :root #main .Root__right-sidebar aside [data-testid="list-row-external-link"]:hover {
            background: var(--glass-fill) !important;
            box-shadow: inset 0 0 0 1px var(--glass-edge) !important;
         }

         :root #main .Root__right-sidebar aside a:has([data-testid="list-row-external-link"]):first-child {
            display: block;
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid var(--glass-edge);
         }

         :root #main .Root__right-sidebar aside [data-testid="list-row-external-link"] p {
            color: rgba(var(--spice-rgb-text), 0.72) !important;
         }

         :root #main .Root__right-sidebar aside[aria-label="Queue"] .e-10860-tab-panel > div > div:has(.e-10860-legacy-button-primary) {
            background: linear-gradient(145deg,
               rgba(var(--spice-rgb-text), 0.1) 0%,
               rgba(var(--spice-rgb-text), 0.04) 100%) !important;
            backdrop-filter: blur(20px) saturate(1.4) !important;
            border-radius: 16px !important;
            box-shadow: inset 0 0 0 1px var(--glass-edge), inset 0 1px 0 var(--glass-shine), 0 8px 24px rgba(0, 0, 0, 0.18) !important;
         }

         :root #main .Root__right-sidebar aside[aria-label="Queue"] .e-10860-legacy-button-primary > span {
            border-radius: 999px !important;
            box-shadow: 0 4px 16px rgba(var(--spice-rgb-button), 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.35) !important;
         }

         :root #main .Root__right-sidebar aside[aria-label="Queue"] ul li > .e-10860-legacy-box {
            border-radius: 12px !important;
            transition: background-color 220ms linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1), box-shadow 220ms linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1) !important;
         }

         :root #main .Root__right-sidebar aside[aria-label="Queue"] ul li > .e-10860-legacy-box:hover {
            background: var(--glass-fill) !important;
            box-shadow: inset 0 0 0 1px var(--glass-edge) !important;
         }

         :root #main .Root__right-sidebar aside[aria-label="Queue"] ul li img {
            border-radius: 8px !important;
         }

         :root #main .Root__right-sidebar aside[aria-label="Queue"] .e-10860-overflow-button button {
            background: var(--glass-fill-hover) !important;
            backdrop-filter: blur(16px) !important;
            box-shadow: inset 0 0 0 1px var(--glass-edge) !important;
         }

         :root #main [data-testid="now-playing-bar"] button:not([data-testid="control-button-playpause"]):not([data-testid="cover-art-button"]) {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex-shrink: 0 !important;
            width: var(--player-control) !important;
            min-width: var(--player-control) !important;
            height: var(--player-control) !important;
            padding: 0 !important;
         }

         :root #main [data-testid="now-playing-bar"] [data-testid="player-controls"] {
            justify-content: center !important;
            gap: 4px !important;
         }

         :root #main [data-testid="now-playing-bar"] [data-testid="general-controls"] {
            align-items: center !important;
            gap: 12px !important;
            height: 36px !important;
            margin: 0 !important;
         }

         :root #main [data-testid="now-playing-bar"] [data-testid="general-controls"] > div {
            align-items: center !important;
            gap: 12px !important;
         }

         :root #main [data-testid="now-playing-bar"] button {
            transition: color 220ms linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1), background-color 220ms linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1), transform 250ms linear(0, 0.023 3.2%, 0.101 7.1%, 0.198 10.7%, 0.533 21.7%, 0.712 28.8%, 0.837 35.5%, 0.923 42.2%, 0.984 50.5%, 1.015 60.7%, 1.02 72.2%, 1), opacity 220ms linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1) !important;
         }

         :root #main [data-testid="now-playing-bar"] button:active {
            transform: scale(0.92) !important;
            transition-duration: 90ms !important;
            transition-timing-function: linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1), linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1), linear(0, 0.003 1.1%, 0.027 3.4%, 0.091 6.7%, 0.445 20.2%, 0.55 24.7%, 0.619 28.1%, 0.732 34.8%, 0.827 42.7%, 0.904 52.8%, 0.951 64%, 0.981 78.7%, 1), linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1) !important;
         }

         :root #main [data-testid="now-playing-bar"] [data-testid="control-button-playpause"] {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex-shrink: 0 !important;
            width: 36px !important;
            height: 36px !important;
            padding: 0 !important;
            border-radius: 50% !important;
         }

         :root #main [data-testid="now-playing-bar"] [data-testid="control-button-playpause"] > span {
            width: 100% !important;
            height: 100% !important;
            min-width: 0 !important;
            min-height: 0 !important;
            border-radius: 50% !important;
         }

         :root #main [data-testid="now-playing-bar"] [data-testid="player-controls"] > div:last-child {
            height: 16px !important;
            gap: 8px !important;
         }

         :root #main [data-testid="now-playing-bar"] [data-testid="playback-position"],
         :root #main [data-testid="now-playing-bar"] [data-testid="playback-duration"] {
            flex: 0 0 40px !important;
            min-width: 40px !important;
            width: 40px !important;
            font-size: 11px !important;
            line-height: 16px !important;
            font-variant-numeric: tabular-nums !important;
            color: rgba(var(--spice-rgb-subtext), 0.7) !important;
         }

         :root #main [data-testid="now-playing-bar"] [data-testid="playback-position"] {
            text-align: right !important;
         }

         :root #main [data-testid="now-playing-bar"] [data-testid="playback-duration"] {
            text-align: left !important;
         }

         :root #main [data-testid="now-playing-bar"] [data-testid="playback-progressbar"] {
            --progress-bar-height: 4px !important;
            --progress-bar-radius: 999px !important;
         }

         :root #main [data-testid="now-playing-bar"] [data-testid="progress-bar-background"] {
            transition: height 220ms linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1) !important;
         }

         :root #main [data-testid="now-playing-bar"] > div:first-child > div:nth-child(3) > div {
            justify-content: flex-end !important;
            align-items: center !important;
            gap: 4px !important;
         }

         :root #main [data-testid="now-playing-bar"] [data-testid="volume-bar"] {
            flex: 0 1 136px !important;
            gap: 6px !important;
            margin: 0 8px 0 0 !important;
         }

         :root #main [data-testid="now-playing-bar"] [data-testid="volume-bar"] > div {
            flex: 1 1 auto !important;
            min-width: 0 !important;
         }
         }

         @media (prefers-reduced-motion: reduce) {
            :root #main #global-nav-bar button,
            :root #main [data-testid="now-playing-bar"] button,
            :root #main .Root__right-sidebar aside [aria-label="Current device"] button {
               transition-duration: 120ms !important;
               transition-timing-function: linear !important;
            }

            :root #main #global-nav-bar button:active,
            :root #main [data-testid="now-playing-bar"] button:active,
            :root #main .Root__right-sidebar aside [aria-label="Current device"] button:hover {
               transform: none !important;
            }
         }
      `;

      const ZOOM_POLL_MS = 2000;
      const ZOOM_BURST_MS = 1500;

      // Comfy's checkChanges polls the window size every frame. outerWidth is 0 while hidden, hence the burst on show.
      function throttleComfyZoomPoll() {
         const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
         let pendingZoomCheck = null;
         let zoomCheckTimer = null;
         let burstUntil = 0;

         function runZoomCheck() {
            clearTimeout(zoomCheckTimer);
            const zoomCheck = pendingZoomCheck;
            pendingZoomCheck = null;
            zoomCheck?.(performance.now());
         }

         function startZoomBurst() {
            burstUntil = performance.now() + ZOOM_BURST_MS;
            runZoomCheck();
         }

         window.requestAnimationFrame = function (callback) {
            const isComfyZoomPoll = callback?.name === "checkChanges";
            const isBursting = performance.now() < burstUntil;

            if (!isComfyZoomPoll || isBursting) {
               return nativeRequestAnimationFrame(callback);
            }

            pendingZoomCheck = callback;
            zoomCheckTimer = setTimeout(runZoomCheck, ZOOM_POLL_MS);
            return 0;
         };

         window.addEventListener("resize", startZoomBurst);
         window.addEventListener("focus", startZoomBurst);
         document.addEventListener("visibilitychange", startZoomBurst);
      }

      throttleComfyZoomPoll();

      core.whenReady("comfyTweaks", () => Boolean(document.head), () => document.head.appendChild(style));
   }

   function folderImages(core) {
      const STORAGE_PREFIX = "folder-image:";
      const FOLDER_ENTRY_SELECTOR = "[aria-labelledby*=':folder:']";
      const PLACEHOLDER_SELECTOR = "[class*='imagePlaceholder'], [class*='imageContainer'] > div:has(> svg), [data-encore-id='listRow'] div[aria-label]:has(> svg:only-child)";
      const ENTRY_ROOT_SELECTOR = "li, [data-encore-id='listRow']";
      const COVER_FRAME_SELECTOR = ".main-cardImage-imageWrapper, [class*='imageContainer']";
      const ART_CLASS = "folder-images-art";
      const TILE_CLASS = "folder-images-tile";
      const TILT_CLASS = "folder-images-tilt";
      const MAX_TILT_DEGREES = 9;
      const STACK_CLASS = "sm-folder-stack";
      const STACK_TILT_DEGREES = 6;
      const STACK_ATTRIBUTE = "data-fi-stack";
      const PLAYING_ATTRIBUTE = "data-fi-playing";
      const DROP_ATTRIBUTE = "data-fi-drop";
      const HEADER_ART_CLASS = "fi-header-art";
      const SIDEBAR_SELECTOR = "#Desktop_LeftSidebar_Id";
      const MENU_ITEM_CLASS = "folder-images-menu-item";
      const MAX_EDGE = 320;
      const GRID_SIZE = 4;
      const ROOTLIST_REFRESH_DELAY_MS = 500;
      const EASE_PRESS = "linear(0, 0.003 1.1%, 0.027 3.4%, 0.091 6.7%, 0.445 20.2%, 0.55 24.7%, 0.619 28.1%, 0.732 34.8%, 0.827 42.7%, 0.904 52.8%, 0.951 64%, 0.981 78.7%, 1)";
      const EASE_RELEASE = "linear(0, 0.023 3.2%, 0.101 7.1%, 0.198 10.7%, 0.533 21.7%, 0.712 28.8%, 0.837 35.5%, 0.923 42.2%, 0.984 50.5%, 1.015 60.7%, 1.02 72.2%, 1)";
      const EASE_HOVER = "linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1)";
      const EASE_CROSSFADE = "linear(0, 0.02 2.9%, 0.082 6.3%, 0.158 9.5%, 0.453 20.6%, 0.616 28%, 0.735 35.1%, 0.824 42.5%, 0.9 52.3%, 0.951 64.2%, 0.981 79%, 1)";
      const EASE_TOGGLE = "linear(0, 0.023 3.4%, 0.099 7.6%, 0.192 11.4%, 0.499 22.8%, 0.67 30.4%, 0.786 37.1%, 0.875 44.3%, 0.946 53.6%, 0.987 64.6%, 1.004 78.1%, 1)";
      const CROSSFADE_MS = 380;
      const REDUCED_FADE_MS = 120;
      const PICTURE_ICON_PATH = "M1 3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2zm2-.5a.5.5 0 0 0-.5.5v7.4l2.7-2.7a1 1 0 0 1 1.4 0L9 10.1l1.3-1.3a1 1 0 0 1 1.4 0l1.8 1.8V3a.5.5 0 0 0-.5-.5zM11 6a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0";
      const REMOVE_ICON_PATH = "M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8m12 .75H4v-1.5h8z";

      let menuFolderId = null;
      let paintScheduled = false;
      let fullPaintRequested = false;
      const pendingRoots = new Set();
      let gridCoversByFolder = new Map();
      let folderIdsByName = new Map();
      let folderIdsByPlaylistUri = new Map();
      let playingFolderIds = new Set();
      let gridRefreshTimer = null;
      const fileInput = document.createElement("input");

      function folderIdFrom(element) {
         const labelledBy = element.getAttribute("aria-labelledby") || "";
         const match = labelledBy.match(/:folder:(\w+)/);
         return match ? match[1] : null;
      }

      function storedImage(folderId) {
         return localStorage.getItem(STORAGE_PREFIX + folderId);
      }

      function imageUrlsFromSpotifyImage(imageUri) {
         if (!imageUri) {
            return [];
         }

         if (imageUri.startsWith("spotify:mosaic:")) {
            return imageUri.slice("spotify:mosaic:".length).split(":").map((imageId) => "https://i.scdn.co/image/" + imageId);
         }

         if (imageUri.startsWith("spotify:image:")) {
            return ["https://i.scdn.co/image/" + imageUri.slice("spotify:image:".length)];
         }

         return [imageUri];
      }

      function playlistsIn(folder) {
         const playlists = [];

         folder.items?.forEach((item) => {
            if (item.type === "folder") {
               playlists.push(...playlistsIn(item));
            } else {
               playlists.push(item);
            }
         });

         return playlists;
      }

      function gridCoversFor(folder) {
         const coverSets = playlistsIn(folder)
            .map((playlist) => imageUrlsFromSpotifyImage(playlist.images?.[0]?.url))
            .filter((urls) => urls.length > 0);

         const covers = [];

         coverSets.forEach((urls) => {
            const isNew = !covers.includes(urls[0]);

            if (isNew && covers.length < GRID_SIZE) {
               covers.push(urls[0]);
            }
         });

         coverSets.flat().forEach((url) => {
            const isNew = !covers.includes(url);

            if (isNew && covers.length < GRID_SIZE) {
               covers.push(url);
            }
         });

         return covers;
      }

      function scheduleGridRefresh() {
         clearTimeout(gridRefreshTimer);
         gridRefreshTimer = setTimeout(refreshGridCovers, ROOTLIST_REFRESH_DELAY_MS);
      }

      async function refreshGridCovers() {
         const rootlistApi = Spicetify.Platform?.RootlistAPI;

         if (!rootlistApi) {
            return;
         }

         try {
            const contents = await rootlistApi.getContents();
            const nextCovers = new Map();
            const nextNames = new Map();
            const nextOwners = new Map();

            const collectFolders = (items) => {
               items?.forEach((item) => {
                  if (item.type !== "folder") {
                     return;
                  }

                  const folderId = item.uri.split(":").pop();
                  nextCovers.set(folderId, gridCoversFor(item));

                  if (!nextNames.has(item.name)) {
                     nextNames.set(item.name, folderId);
                  }

                  playlistsIn(item).forEach((playlist) => {
                     const owners = nextOwners.get(playlist.uri) || [];
                     owners.push(folderId);
                     nextOwners.set(playlist.uri, owners);
                  });

                  collectFolders(item.items);
               });
            };

            collectFolders(contents.items);
            gridCoversByFolder = nextCovers;
            folderIdsByName = nextNames;
            folderIdsByPlaylistUri = nextOwners;
            updatePlayingFolders();
            schedulePaint();
         } catch (error) {
            console.error("folder-images: could not read library", error);
         }
      }

      function artSourcesFor(folderId) {
         const customImage = storedImage(folderId);

         if (customImage) {
            return [customImage];
         }

         return gridCoversByFolder.get(folderId) || [];
      }

      function renderArt(art, sources) {
         art.replaceChildren();
         art.classList.toggle(ART_CLASS + "--grid", sources.length > 1);
         art.dataset.count = sources.length;

         sources.forEach((source) => {
            const tile = document.createElement("span");
            const image = document.createElement("img");

            tile.className = TILE_CLASS;
            image.alt = "";
            image.draggable = false;
            image.decoding = "async";
            image.style.setProperty("border-radius", "0", "important");
            image.addEventListener("load", () => image.setAttribute("data-loaded", ""), { once: true });
            image.addEventListener("error", () => tile.setAttribute("data-broken", ""), { once: true });
            image.src = source;

            const isCached = image.complete && image.naturalWidth > 0;

            if (isCached) {
               image.setAttribute("data-loaded", "");
            }

            tile.appendChild(image);
            art.appendChild(tile);
         });
      }

      function sheetCoversFor(folderId, sources) {
         const playlistCovers = gridCoversByFolder.get(folderId) || [];
         const pool = playlistCovers.length > 0 ? playlistCovers : sources;
         const hasCustomImage = Boolean(storedImage(folderId));
         const behind = hasCustomImage ? pool : pool.slice(1);
         const nearSheet = behind[0] || pool[0] || "";
         const farSheet = behind[1] || nearSheet;

         return [nearSheet, farSheet];
      }

      function cssUrl(url) {
         return url ? `url("${url}")` : "none";
      }

      function markStack(host, entryRoot, folderId, sources) {
         const kind = entryRoot.matches("[data-encore-id='listRow']") ? "row" : "card";
         const [nearSheet, farSheet] = sheetCoversFor(folderId, sources);
         const signature = kind + "|" + nearSheet + "|" + farSheet;

         if (host.dataset.fiSignature !== signature) {
            host.dataset.fiSignature = signature;
            host.setAttribute(STACK_ATTRIBUTE, kind);
            host.style.setProperty("--fi-sheet-near", cssUrl(nearSheet));
            host.style.setProperty("--fi-sheet-far", cssUrl(farSheet));
         }

         host.toggleAttribute("data-fi-empty", sources.length === 0);
         markPlaying(entryRoot, folderId);
      }

      function markPlaying(entryRoot, folderId) {
         const isPlayingFolder = playingFolderIds.has(folderId);
         const playbackState = Spicetify.Player?.isPlaying?.() ? "playing" : "paused";

         if (!isPlayingFolder) {
            entryRoot.removeAttribute(PLAYING_ATTRIBUTE);
            return;
         }

         if (entryRoot.getAttribute(PLAYING_ATTRIBUTE) !== playbackState) {
            entryRoot.setAttribute(PLAYING_ATTRIBUTE, playbackState);
         }
      }

      function playingFoldersFor(contextUri) {
         return new Set(folderIdsByPlaylistUri.get(contextUri) || []);
      }

      function updatePlayingFolders(contextOverride) {
         const hasOverride = typeof contextOverride === "string";
         const contextUri = hasOverride ? contextOverride : Spicetify.Player?.data?.context?.uri || "";
         playingFolderIds = playingFoldersFor(contextUri);

         const sidebar = document.querySelector(SIDEBAR_SELECTOR);

         sidebar?.querySelectorAll(FOLDER_ENTRY_SELECTOR).forEach((entry) => {
            const folderId = folderIdFrom(entry);
            const entryRoot = entry.closest(ENTRY_ROOT_SELECTOR);

            if (folderId && entryRoot) {
               markPlaying(entryRoot, folderId);
            }
         });
      }

      function paintFolderHeader() {
         const sidebar = document.querySelector(SIDEBAR_SELECTOR);
         const backButton = sidebar?.querySelector("button[aria-label='Go back']");
         const header = backButton?.closest("header") || backButton?.parentElement?.parentElement;
         const titleButton = header?.querySelector("button:has(> h2)");

         if (!titleButton) {
            return;
         }

         const folderId = folderIdsByName.get(titleButton.getAttribute("aria-label"));
         const sources = folderId ? artSourcesFor(folderId) : [];
         const signature = sources.join("|");
         let headerArt = titleButton.querySelector("." + HEADER_ART_CLASS);

         if (headerArt?.dataset.signature === signature) {
            return;
         }

         if (sources.length === 0) {
            headerArt?.remove();
            return;
         }

         if (!headerArt) {
            headerArt = document.createElement("span");
            headerArt.className = HEADER_ART_CLASS;
            headerArt.setAttribute("aria-hidden", "true");
            titleButton.prepend(headerArt);
         }

         headerArt.dataset.signature = signature;
         headerArt.dataset.count = Math.min(sources.length, GRID_SIZE);
         headerArt.replaceChildren(...sources.slice(0, GRID_SIZE).map((source) => {
            const image = document.createElement("img");
            image.src = source;
            image.alt = "";
            image.draggable = false;
            return image;
         }));
      }

      function paintEntry(entry) {
         const folderId = folderIdFrom(entry);

         if (!folderId) {
            return;
         }

         const entryRoot = entry.closest(ENTRY_ROOT_SELECTOR) || entry;
         const sources = artSourcesFor(folderId);
         const signature = sources.join("|");
         const paintedArt = entryRoot.getElementsByClassName(ART_CLASS)[0];
         const isAlreadyPainted = paintedArt && paintedArt.dataset.signature === signature && sources.length > 0;

         if (isAlreadyPainted) {
            return;
         }

         const placeholder = entryRoot.querySelector(PLACEHOLDER_SELECTOR);

         if (!placeholder) {
            return;
         }

         const coverFrame = placeholder.closest(COVER_FRAME_SELECTOR) || placeholder.parentElement || placeholder;
         let art = coverFrame.querySelector("." + ART_CLASS);

         if (coverFrame.parentElement) {
            markStack(coverFrame.parentElement, entryRoot, folderId, sources);
         }

         if (sources.length === 0) {
            art?.remove();
            return;
         }

         if (!art) {
            art = document.createElement("div");
            art.className = ART_CLASS;

            if (getComputedStyle(coverFrame).position === "static") {
               coverFrame.style.position = "relative";
            }

            coverFrame.appendChild(art);
         }

         const isStale = art.dataset.signature !== signature;

         if (isStale) {
            const hasPreviousImages = art.childElementCount > 0;

            if (hasPreviousImages) {
               fadeOutPreviousArt(coverFrame, art);
            }

            art.dataset.signature = signature;
            renderArt(art, sources);
         }
      }

      function fadeOutPreviousArt(coverFrame, art) {
         coverFrame.querySelectorAll("." + ART_CLASS + "[data-ghost]").forEach((ghost) => ghost.remove());

         const ghost = art.cloneNode(true);
         const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
         const duration = prefersReducedMotion ? REDUCED_FADE_MS : CROSSFADE_MS;
         const easing = prefersReducedMotion ? "linear" : EASE_CROSSFADE;

         ghost.removeAttribute("data-signature");
         ghost.removeAttribute("data-hot");
         ghost.setAttribute("data-ghost", "");
         ghost.setAttribute("aria-hidden", "true");
         coverFrame.appendChild(ghost);

         const fade = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing, fill: "forwards" });
         fade.onfinish = () => ghost.remove();
         fade.oncancel = () => ghost.remove();
      }

      function paintAll() {
         const paintEverything = fullPaintRequested;
         const addedRoots = [...pendingRoots];

         paintScheduled = false;
         fullPaintRequested = false;
         pendingRoots.clear();

         if (paintEverything) {
            document.querySelectorAll(FOLDER_ENTRY_SELECTOR).forEach(paintEntry);
            paintFolderHeader();
            return;
         }

         const entries = new Set();
         const sidebar = document.querySelector(SIDEBAR_SELECTOR);
         let touchedSidebar = false;

         addedRoots.forEach((root) => {
            const isDetached = !root.isConnected;

            if (isDetached) {
               return;
            }

            if (sidebar?.contains(root)) {
               touchedSidebar = true;
            }

            const isEntry = root.matches(FOLDER_ENTRY_SELECTOR);
            const entryRoot = root.closest(ENTRY_ROOT_SELECTOR);

            if (isEntry) {
               entries.add(root);
            }

            root.querySelectorAll(FOLDER_ENTRY_SELECTOR).forEach((entry) => entries.add(entry));
            entryRoot?.querySelectorAll(FOLDER_ENTRY_SELECTOR).forEach((entry) => entries.add(entry));
         });

         entries.forEach(paintEntry);

         if (touchedSidebar) {
            paintFolderHeader();
         }
      }

      function schedulePaint() {
         fullPaintRequested = true;
         requestPaintFrame();
      }

      function requestPaintFrame() {
         if (paintScheduled) {
            return;
         }

         paintScheduled = true;
         requestAnimationFrame(paintAll);
      }

      function isOwnArtNode(node) {
         const isArt = node.classList.contains(ART_CLASS) || node.classList.contains(HEADER_ART_CLASS);
         const isTile = node.parentElement?.classList.contains(ART_CLASS) || node.parentElement?.classList.contains(HEADER_ART_CLASS);

         return isArt || isTile;
      }

      function closeMenu(menu) {
         const escape = { key: "Escape", code: "Escape", keyCode: 27, bubbles: true };
         menu.dispatchEvent(new KeyboardEvent("keydown", escape));
         document.body.dispatchEvent(new KeyboardEvent("keydown", escape));
      }

      function buildMenuItem(template, label, iconPath, onSelect) {
         const item = template.cloneNode(true);
         item.classList.add(MENU_ITEM_CLASS);
         item.querySelector("span").textContent = label;

         ["id", "data-key", "data-focused", "data-hovered", "data-pressed", "data-focus-visible"].forEach((attribute) => {
            item.removeAttribute(attribute);
         });

         item.querySelectorAll("svg path").forEach((path, index) => {
            if (index === 0) {
               path.setAttribute("d", iconPath);
            } else {
               path.remove();
            }
         });

         const clickTarget = item.querySelector("button") || item;
         clickTarget.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            onSelect();
         });

         return item;
      }

      function decorateMenu(menu) {
         const folderId = menuFolderId;
         const alreadyDecorated = menu.querySelector("." + MENU_ITEM_CLASS);
         const template = menu.querySelector("[role='menuitem']:has(svg)")
            || menu.querySelector("[role='menuitem']")
            || menu.querySelector("li[role='presentation']");

         if (!folderId || alreadyDecorated || !template) {
            return;
         }

         const chooseItem = buildMenuItem(template, "Choose folder image", PICTURE_ICON_PATH, () => {
            fileInput.dataset.folderId = folderId;
            fileInput.value = "";
            fileInput.click();
            closeMenu(menu);
         });
         menu.appendChild(chooseItem);

         if (storedImage(folderId)) {
            const removeItem = buildMenuItem(template, "Use playlist grid", REMOVE_ICON_PATH, () => {
               localStorage.removeItem(STORAGE_PREFIX + folderId);
               schedulePaint();
               closeMenu(menu);
            });
            menu.appendChild(removeItem);
         }
      }

      function shrinkImage(dataUrl) {
         return new Promise((resolve, reject) => {
            const image = new Image();

            image.onload = () => {
               const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
               const canvas = document.createElement("canvas");
               canvas.width = Math.round(image.width * scale);
               canvas.height = Math.round(image.height * scale);
               canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
               resolve(canvas.toDataURL("image/jpeg", 0.85));
            };

            image.onerror = reject;
            image.src = dataUrl;
         });
      }

      function handleChosenFile() {
         const folderId = fileInput.dataset.folderId;
         const file = fileInput.files?.[0];

         if (!folderId || !file) {
            return;
         }

         const reader = new FileReader();

         reader.onload = async () => {
            try {
               const imageData = await shrinkImage(reader.result);
               localStorage.setItem(STORAGE_PREFIX + folderId, imageData);
               schedulePaint();
            } catch (error) {
               Spicetify.showNotification?.("Could not set folder image: " + error, true);
            }
         };

         reader.readAsDataURL(file);
      }

      function installStyles() {
         const style = document.createElement("style");
         style.textContent = `
            .${ART_CLASS} {
               position: absolute;
               inset: 0;
               z-index: 1;
               overflow: hidden;
               border-radius: inherit;
               background: var(--background-elevated-base, #282828);
            }

            .${ART_CLASS} img {
               display: block;
               width: 100%;
               height: 100%;
               object-fit: cover;
            }

            :is(li, [data-encore-id='listRow']) .${ART_CLASS}.${ART_CLASS}--grid {
               display: grid !important;
               grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
               grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
               gap: 1px;
               background: rgba(0, 0, 0, 0.6);
            }

            .${ART_CLASS}[data-count="2"] {
               grid-template-rows: minmax(0, 1fr);
            }

            .${TILE_CLASS} {
               display: block;
               min-width: 0;
               min-height: 0;
               overflow: hidden;
               border-radius: var(--fi-tile-radius, 0);
            }

            .${ART_CLASS}:not(.${ART_CLASS}--grid) .${TILE_CLASS} {
               width: 100%;
               height: 100%;
            }

            .${ART_CLASS}[data-count="3"] .${TILE_CLASS}:nth-child(1) {
               grid-row: span 2;
            }

            .${ART_CLASS}--grid img {
               min-width: 0;
               min-height: 0;
               border-radius: 0;
               transform-origin: 50% 50%;
               transition:
                  transform 220ms ${EASE_HOVER},
                  filter 220ms ${EASE_HOVER};
            }

            .${ART_CLASS}[data-ghost] {
               z-index: 2;
               pointer-events: none;
            }

            .${ART_CLASS}::after {
               content: "";
               position: absolute;
               inset: 0;
               pointer-events: none;
               opacity: 0;
               background: radial-gradient(circle at var(--glare-x, 50%) var(--glare-y, 50%), rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0) 62%);
               mix-blend-mode: soft-light;
               transition: opacity 220ms ${EASE_HOVER};
            }

            .${TILT_CLASS} {
               transform: perspective(520px) rotateX(var(--tilt-y, 0deg)) rotateY(var(--tilt-x, 0deg));
               transition: transform 90ms ${EASE_PRESS};
            }

            .${TILT_CLASS}--active {
               will-change: transform;
            }

            .${TILT_CLASS}:not(.${TILT_CLASS}--active) {
               transition: transform 250ms ${EASE_RELEASE};
            }

            .${TILT_CLASS} .${ART_CLASS}--grid img {
               transform:
                  translate(calc(var(--px, 0) * var(--depth, 1) * -4%), calc(var(--py, 0) * var(--depth, 1) * -4%))
                  scale(1.24);
               transition: transform 90ms ${EASE_PRESS}, filter 220ms ${EASE_HOVER};
            }

            .${ART_CLASS}--grid .${TILE_CLASS}:nth-child(1) { --depth: 0.6; }
            .${ART_CLASS}--grid .${TILE_CLASS}:nth-child(2) { --depth: 1.3; }
            .${ART_CLASS}--grid .${TILE_CLASS}:nth-child(3) { --depth: 1.7; }
            .${ART_CLASS}--grid .${TILE_CLASS}:nth-child(4) { --depth: 0.9; }

            .${TILT_CLASS} .${ART_CLASS}::after {
               opacity: 1;
            }

            .${ART_CLASS}[data-hot] img {
               filter: brightness(0.8) saturate(0.85);
            }

            .${ART_CLASS}[data-hot="1"] .${TILE_CLASS}:nth-child(1) img,
            .${ART_CLASS}[data-hot="2"] .${TILE_CLASS}:nth-child(2) img,
            .${ART_CLASS}[data-hot="3"] .${TILE_CLASS}:nth-child(3) img,
            .${ART_CLASS}[data-hot="4"] .${TILE_CLASS}:nth-child(4) img {
               filter: brightness(1.14) saturate(1.2);
            }

            @media (prefers-reduced-motion: reduce) {
               .${TILT_CLASS},
               .${TILT_CLASS} .${ART_CLASS}--grid img {
                  transform: none;
               }

               .${TILT_CLASS},
               .${TILT_CLASS}:not(.${TILT_CLASS}--active),
               .${TILT_CLASS} .${ART_CLASS}--grid img,
               .${ART_CLASS}--grid img,
               .${ART_CLASS}::after {
                  transition-duration: ${REDUCED_FADE_MS}ms;
                  transition-timing-function: linear;
               }

               .${TILT_CLASS} .${ART_CLASS}::after {
                  opacity: 0;
               }
            }

            .main-cardImage-imageWrapper:has(> .${ART_CLASS}) > div > [role='gridcell'] {
               z-index: 2;
            }
         ` + stackStyles();
         document.head.appendChild(style);
      }

      function stackStyles() {
         const ROOT = `html.${STACK_CLASS}`;
         const ENTRY = ":is(li, [data-encore-id='listRow'])";
         const HOST = `[${STACK_ATTRIBUTE}]`;
         const ROW_HOST = `[${STACK_ATTRIBUTE}='row']`;
         const ENGAGED = `${ENTRY}:is(:hover, :has(:focus-visible))`;
         const FRONT = `${HOST} > :first-child`;
         const PLATE = "color-mix(in srgb, var(--liq-1, #5b4bd8) 14%, #0d0d10)";
         const RIM_LIT = "color-mix(in srgb, var(--liq-1, #5b4bd8) 70%, #fff)";
         const RIM_DIM = "color-mix(in srgb, var(--liq-1, #5b4bd8) 40%, rgba(255, 255, 255, 0.5))";
         const RING = "color-mix(in srgb, var(--liq-1, #5b4bd8) 45%, #fff)";
         const TITLE = "[data-encore-id='cardTitle'], [data-encore-id='listRow'] [id^='listrow-title']";

         return `
            ${ROOT} ${HOST} {
               --fi-sheet-fill: color-mix(in srgb, var(--liq-1, #5b4bd8) 22%, #17171c);
               --fi-rim: rgba(255, 255, 255, 0.5);
               position: relative;
               isolation: isolate;
            }

            ${ROOT} ${HOST}::before,
            ${ROOT} ${HOST}::after {
               content: "";
               position: absolute;
               z-index: -1;
               inset: 0;
               pointer-events: none;
               background-color: var(--fi-sheet-fill);
               background-position: center;
               background-size: cover;
               background-repeat: no-repeat;
               box-shadow:
                  inset 0 1px 0 var(--fi-rim),
                  inset 0 0 0 1px rgba(255, 255, 255, 0.06);
               transition:
                  transform 220ms ${EASE_HOVER},
                  filter 220ms ${EASE_HOVER};
            }

            ${ROOT} ${HOST}::after {
               inset-inline: 7%;
               border-radius: 5px;
               background-image: var(--fi-sheet-near, none);
               filter: brightness(0.6) saturate(0.9);
               transform: translateY(-4px);
            }

            ${ROOT} ${HOST}::before {
               inset-inline: 14%;
               border-radius: 4px;
               background-image: var(--fi-sheet-far, none);
               filter: brightness(0.42) saturate(0.85);
               transform: translateY(-8px);
            }

            ${ROOT} ${ENGAGED} ${HOST}::after {
               filter: brightness(0.74) saturate(1);
               transform: translateY(-6px);
            }

            ${ROOT} ${ENGAGED} ${HOST}::before {
               filter: brightness(0.58) saturate(0.95);
               transform: translateY(-10px);
            }

            ${ROOT} ${ENTRY}:active ${HOST}::after {
               transform: translateY(-2px);
               transition-duration: 90ms;
               transition-timing-function: ${EASE_PRESS};
            }

            ${ROOT} ${ENTRY}:active ${HOST}::before {
               transform: translateY(-4px);
               transition-duration: 90ms;
               transition-timing-function: ${EASE_PRESS};
            }

            ${ROOT} [${DROP_ATTRIBUTE}] ${HOST}::after {
               filter: brightness(0.86) saturate(1.05);
               transform: translateY(-8px);
               transition:
                  transform 240ms ${EASE_TOGGLE},
                  filter 240ms ${EASE_TOGGLE};
            }

            ${ROOT} [${DROP_ATTRIBUTE}] ${HOST}::before {
               filter: brightness(0.7) saturate(1);
               transform: translateY(-12px);
               transition:
                  transform 240ms ${EASE_TOGGLE},
                  filter 240ms ${EASE_TOGGLE};
            }

            ${ROOT} ${ROW_HOST}::before {
               content: none;
            }

            ${ROOT} ${ROW_HOST}::after {
               inset-inline: 5px;
               border-radius: 3px;
               transform: translateY(-3px);
            }

            ${ROOT} ${ENGAGED} ${ROW_HOST}::after,
            ${ROOT} [${DROP_ATTRIBUTE}] ${ROW_HOST}::after {
               transform: translateY(-4px);
            }

            ${ROOT} ${ENTRY}:active ${ROW_HOST}::after {
               transform: translateY(-1px);
            }

            ${ROOT} [${DROP_ATTRIBUTE}] ${FRONT} {
               outline: 2px solid ${RING};
               outline-offset: 2px;
            }

            ${ROOT} [${PLAYING_ATTRIBUTE}] ${HOST} {
               --fi-rim: ${RIM_LIT};
            }

            ${ROOT} [${PLAYING_ATTRIBUTE}] ${HOST}::after {
               filter: brightness(0.82) saturate(1.05);
               box-shadow:
                  inset 0 1px 0 var(--fi-rim),
                  inset 0 0 0 1px color-mix(in srgb, var(--liq-1, #5b4bd8) 45%, transparent),
                  0 -3px 12px -2px var(--liq-1, #5b4bd8);
            }

            ${ROOT} [${PLAYING_ATTRIBUTE}] :is(${TITLE}) {
               color: var(--text-bright-accent, #1ed760) !important;
            }

            ${ROOT} [${PLAYING_ATTRIBUTE}='paused'] ${HOST},
            ${ROOT}.sm-ambient-rest [${PLAYING_ATTRIBUTE}] ${HOST} {
               --fi-rim: ${RIM_DIM};
            }

            ${ROOT} [${PLAYING_ATTRIBUTE}='paused'] ${HOST}::after,
            ${ROOT}.sm-ambient-rest [${PLAYING_ATTRIBUTE}] ${HOST}::after {
               filter: brightness(0.66) saturate(0.95);
               box-shadow:
                  inset 0 1px 0 var(--fi-rim),
                  inset 0 0 0 1px rgba(255, 255, 255, 0.06);
            }

            ${ROOT} .${ART_CLASS} {
               --fi-tile-radius: 2px;
            }

            ${ROOT} ${ENTRY} .${ART_CLASS}.${ART_CLASS}--grid {
               gap: 2px;
               background: ${PLATE};
            }

            ${ROOT} [data-encore-id='listRow'] .${ART_CLASS}.${ART_CLASS}--grid {
               --fi-tile-radius: 1px;
               gap: 1px;
            }

            ${ROOT} .${ART_CLASS} img {
               transition:
                  transform 220ms ${EASE_HOVER},
                  filter 220ms ${EASE_HOVER},
                  opacity ${CROSSFADE_MS}ms ${EASE_CROSSFADE};
            }

            ${ROOT} .${TILT_CLASS} .${ART_CLASS}--grid img {
               transition:
                  transform 90ms ${EASE_PRESS},
                  filter 220ms ${EASE_HOVER},
                  opacity ${CROSSFADE_MS}ms ${EASE_CROSSFADE};
            }

            ${ROOT} .${ART_CLASS} img:not([data-loaded]),
            ${ROOT} .${TILE_CLASS}[data-broken] img {
               opacity: 0;
            }

            ${ROOT} [data-fi-empty] > :first-child {
               background: ${PLATE} !important;
            }

            ${ROOT} [data-fi-empty] .main-card-imagePlaceholder svg {
               opacity: 0.6;
            }

            .${HEADER_ART_CLASS} {
               display: none;
            }

            ${ROOT} ${SIDEBAR_SELECTOR}[data-lp-wide] button:has(> .${HEADER_ART_CLASS}) {
               display: inline-flex;
               align-items: center;
               gap: 8px;
            }

            ${ROOT} ${SIDEBAR_SELECTOR}[data-lp-wide] .${HEADER_ART_CLASS} {
               display: grid;
               grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
               grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
               gap: 1px;
               flex: none;
               inline-size: 24px;
               block-size: 24px;
               overflow: hidden;
               border-radius: 4px;
               background: ${PLATE};
               box-shadow:
                  inset 0 0 0 1px rgba(255, 255, 255, 0.08),
                  0 2px 6px -2px rgba(0, 0, 0, 0.6);
            }

            ${ROOT} .${HEADER_ART_CLASS}[data-count="1"] {
               grid-template-columns: minmax(0, 1fr);
               grid-template-rows: minmax(0, 1fr);
            }

            ${ROOT} .${HEADER_ART_CLASS}[data-count="2"] {
               grid-template-rows: minmax(0, 1fr);
            }

            ${ROOT} .${HEADER_ART_CLASS}[data-count="3"] img:first-child {
               grid-row: span 2;
            }

            ${ROOT} .${HEADER_ART_CLASS} img {
               display: block;
               width: 100%;
               height: 100%;
               min-width: 0;
               min-height: 0;
               object-fit: cover;
            }

            ${ROOT} ${SIDEBAR_SELECTOR} header button:has(> h2) > h2 {
               color: var(--text-base, #fff) !important;
            }

            ${ROOT} ${SIDEBAR_SELECTOR}[data-lp-wide] button:has(> .${HEADER_ART_CLASS}) > h2 {
               font-size: 1.0625rem !important;
            }

            @media (prefers-reduced-motion: reduce) {
               ${ROOT} ${HOST}::before,
               ${ROOT} ${HOST}::after {
                  transition: filter ${REDUCED_FADE_MS}ms linear !important;
               }

               ${ROOT} ${ENTRY} ${HOST}::after {
                  transform: translateY(-4px) !important;
               }

               ${ROOT} ${ENTRY} ${HOST}::before {
                  transform: translateY(-8px) !important;
               }

               ${ROOT} ${ENTRY} ${ROW_HOST}::after {
                  transform: translateY(-3px) !important;
               }

               ${ROOT} .${ART_CLASS} img,
               ${ROOT} .${TILT_CLASS} .${ART_CLASS}--grid img {
                  transition-duration: ${REDUCED_FADE_MS}ms;
                  transition-timing-function: linear;
               }
            }

            @media (prefers-reduced-transparency: reduce) {
               ${ROOT} ${HOST}::before,
               ${ROOT} ${HOST}::after {
                  background-image: none !important;
               }
            }
         `;
      }

      function tiltFrameFor(target) {
         const art = target.closest?.(ENTRY_ROOT_SELECTOR)?.querySelector("." + ART_CLASS);
         return art ? art.parentElement : null;
      }

      function resetTilt(frame) {
         const art = frame.querySelector("." + ART_CLASS);
         art?.removeAttribute("data-hot");
         frame.classList.remove(TILT_CLASS + "--active");
         frame.style.setProperty("--tilt-x", "0deg");
         frame.style.setProperty("--tilt-y", "0deg");
      }

      function watchTilt() {
         let tiltedFrame = null;
         let tiltedCardBounds = null;
         let tiltedFrameBounds = null;
         let latestPointer = null;
         let tiltScheduled = false;
         const measuredBounds = new Map();

         const boundsObserver = new IntersectionObserver((records) => {
            records.forEach((record) => {
               measuredBounds.set(record.target, record.boundingClientRect);
               boundsObserver.unobserve(record.target);
            });

            if (latestPointer && !tiltScheduled) {
               tiltScheduled = true;
               requestAnimationFrame(applyTilt);
            }
         });

         function forgetBounds() {
            measuredBounds.clear();
            tiltedCardBounds = null;
            tiltedFrameBounds = null;
         }

         function applyTilt() {
            tiltScheduled = false;
            const event = latestPointer;
            const frame = tiltFrameFor(event.target);
            const leftPreviousFrame = tiltedFrame && tiltedFrame !== frame;

            if (leftPreviousFrame) {
               resetTilt(tiltedFrame);
               tiltedFrame = null;
            }

            if (!frame) {
               return;
            }

            const isNewFrame = frame !== tiltedFrame || !tiltedCardBounds;

            if (isNewFrame) {
               const cardElement = frame.closest(ENTRY_ROOT_SELECTOR) || frame;
               const cardBounds = measuredBounds.get(cardElement);
               const frameBounds = measuredBounds.get(frame);
               const isMeasured = Boolean(cardBounds && frameBounds);

               if (!isMeasured) {
                  boundsObserver.observe(cardElement);
                  boundsObserver.observe(frame);
                  return;
               }

               tiltedCardBounds = cardBounds;
               tiltedFrameBounds = frameBounds;
            }

            const bounds = tiltedCardBounds;
            const horizontal = (event.clientX - bounds.left) / bounds.width - 0.5;
            const vertical = (event.clientY - bounds.top) / bounds.height - 0.5;

            frame.classList.add(TILT_CLASS, TILT_CLASS + "--active");
            const tiltLimit = document.documentElement.classList.contains(STACK_CLASS) ? STACK_TILT_DEGREES : MAX_TILT_DEGREES;
            frame.style.setProperty("--tilt-x", (horizontal * tiltLimit * 2).toFixed(2) + "deg");
            frame.style.setProperty("--tilt-y", (-vertical * tiltLimit * 2).toFixed(2) + "deg");
            tiltedFrame = frame;
            reactArt(frame, event);
         }

         function reactArt(frame, event) {
            const art = frame.querySelector("." + ART_CLASS);
            const box = tiltedFrameBounds;

            if (!art || !box || box.width === 0) {
               return;
            }

            const across = (event.clientX - box.left) / box.width;
            const down = (event.clientY - box.top) / box.height;
            const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
            const isOverIcon = across >= 0 && across <= 1 && down >= 0 && down <= 1;

            art.style.setProperty("--px", clamp((across - 0.5) * 2, -1.6, 1.6).toFixed(3));
            art.style.setProperty("--py", clamp((down - 0.5) * 2, -1.6, 1.6).toFixed(3));
            art.style.setProperty("--glare-x", clamp(across * 100, 0, 100).toFixed(1) + "%");
            art.style.setProperty("--glare-y", clamp(down * 100, 0, 100).toFixed(1) + "%");

            const count = Number(art.dataset.count);
            const column = across < 0.5 ? 0 : 1;
            const row = down < 0.5 ? 0 : 1;
            const hotByCount = {
               2: column + 1,
               3: column === 0 ? 1 : row + 2,
               4: row * 2 + column + 1
            };
            const hotTile = hotByCount[count];

            if (isOverIcon && hotTile) {
               art.dataset.hot = hotTile;
            } else {
               art.removeAttribute("data-hot");
            }
         }

         document.addEventListener("mousemove", (event) => {
            const isOverEntry = Boolean(event.target.closest?.(ENTRY_ROOT_SELECTOR));
            const hasNothingToDo = !isOverEntry && !tiltedFrame;

            if (hasNothingToDo) {
               return;
            }

            latestPointer = event;

            if (tiltScheduled) {
               return;
            }

            tiltScheduled = true;
            requestAnimationFrame(applyTilt);
         }, { passive: true });

         document.addEventListener("scroll", forgetBounds, { capture: true, passive: true });
         window.addEventListener("resize", forgetBounds, { passive: true });

         document.addEventListener("mouseleave", () => {
            if (tiltedFrame) {
               resetTilt(tiltedFrame);
               tiltedFrame = null;
            }
         });
      }

      function watchDrops() {
         let dropRoot = null;

         function setDropRoot(nextRoot) {
            if (dropRoot === nextRoot) {
               return;
            }

            dropRoot?.removeAttribute(DROP_ATTRIBUTE);
            dropRoot = nextRoot;
            dropRoot?.setAttribute(DROP_ATTRIBUTE, "");
         }

         document.addEventListener("dragover", (event) => {
            const entryRoot = event.target.closest?.(ENTRY_ROOT_SELECTOR);
            const isSameRoot = entryRoot === dropRoot && dropRoot !== null;

            if (isSameRoot) {
               return;
            }

            const isFolderRoot = Boolean(entryRoot?.querySelector(FOLDER_ENTRY_SELECTOR));
            const isDraggedFolder = isFolderRoot && entryRoot.matches("[aria-grabbed='true'], :has([aria-grabbed='true'])");
            const isDropTarget = isFolderRoot && !isDraggedFolder;

            setDropRoot(isDropTarget ? entryRoot : null);
         }, { capture: true, passive: true });

         const clearDrop = () => setDropRoot(null);

         document.addEventListener("drop", clearDrop, { capture: true, passive: true });
         document.addEventListener("dragend", clearDrop, { capture: true, passive: true });
         document.addEventListener("dragleave", (event) => {
            const leftWindow = !event.relatedTarget;

            if (leftWindow) {
               clearDrop();
            }
         }, { capture: true, passive: true });
      }

      function start() {
         document.documentElement.classList.add(STACK_CLASS);
         installStyles();
         watchTilt();
         watchDrops();

         fileInput.type = "file";
         fileInput.accept = "image/jpeg,image/png,image/webp,image/avif,image/gif";
         fileInput.style.display = "none";
         fileInput.addEventListener("change", handleChosenFile);
         document.body.appendChild(fileInput);

         document.addEventListener("contextmenu", (event) => {
            const entry = event.target.closest?.(FOLDER_ENTRY_SELECTOR);
            menuFolderId = entry ? folderIdFrom(entry) : null;
         }, true);

         document.addEventListener("mousedown", (event) => {
            const isRightClick = event.button === 2;

            if (!isRightClick) {
               menuFolderId = null;
            }
         }, true);

         core.onBodyMutations((mutations) => {
            let addedForeignElement = false;

            for (const mutation of mutations) {
               const addedNodes = mutation.addedNodes;

               for (let index = 0; index < addedNodes.length; index += 1) {
                  const node = addedNodes[index];
                  const isElement = node.nodeType === Node.ELEMENT_NODE;

                  if (!isElement || isOwnArtNode(node)) {
                     continue;
                  }

                  addedForeignElement = true;
                  pendingRoots.add(node);
               }
            }

            if (!addedForeignElement) {
               return;
            }

            const menu = document.querySelector("#context-menu [role='menu']");

            if (menu) {
               decorateMenu(menu);
            }

            requestPaintFrame();
         });

         Spicetify.Platform.RootlistAPI.getEvents?.()?.addListener?.("update", scheduleGridRefresh);
         core.onPlayer("songchange", updatePlayingFolders);
         core.onPlayer("onplaypause", updatePlayingFolders);

         core.exports.folderImages = { playingFoldersFor, updatePlayingFolders };
         refreshGridCovers();
      }

      const isSpicetifyReady = () => Boolean(window.Spicetify?.Platform?.RootlistAPI && document.body);

      core.whenReady("folderImages", isSpicetifyReady, start);
   }

   function libraryHider(core) {
      const STORAGE_KEY = "library-hider:hidden";
      const LIBRARY_SELECTOR = "#Desktop_LeftSidebar_Id";
      const MENU_ITEM_CLASS = "library-hider-menu-item";
      const HIDEABLE_ITEMS = {
         "spotify:playlist:37i9dQZF1EYkqdzj48dyYq": "DJ",
         "spotify:collection:local-files": "Local Files",
      };
      const HIDE_ICON_PATH = "M8 3C3.5 3 1 8 1 8s2.5 5 7 5 7-5 7-5-2.5-5-7-5m0 8.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7M8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4M2.2 1.1l12.7 12.7-1.1 1.1L1.1 2.2z";
      const SHOW_ICON_PATH = "M8 3C3.5 3 1 8 1 8s2.5 5 7 5 7-5 7-5-2.5-5-7-5m0 8.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7M8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4";

      let menuTargetUri = null;
      let menuOpenedInLibrary = false;
      const hidingStyle = document.createElement("style");
      hidingStyle.id = "library-hider";

      function hiddenUris() {
         try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
         } catch (error) {
            return [];
         }
      }

      function saveHiddenUris(uris) {
         localStorage.setItem(STORAGE_KEY, JSON.stringify(uris));
         renderHidingStyle();
      }

      function renderHidingStyle() {
         hidingStyle.textContent = hiddenUris().map((uri) => `
            ${LIBRARY_SELECTOR} li:has([aria-labelledby*="${uri}"]),
            ${LIBRARY_SELECTOR} [role="row"]:has([aria-labelledby*="${uri}"]) {
               display: none !important;
            }
         `).join("\n");
      }

      function uriFrom(element) {
         const labelledBy = element.getAttribute("aria-labelledby") || "";
         const match = labelledBy.match(/(spotify:[^\s]+)/);
         return match ? match[1] : null;
      }

      function closeMenu(menu) {
         const escape = { key: "Escape", code: "Escape", keyCode: 27, bubbles: true };
         menu.dispatchEvent(new KeyboardEvent("keydown", escape));
         document.body.dispatchEvent(new KeyboardEvent("keydown", escape));
      }

      function findTemplate(menu) {
         return menu.querySelector("[role='menuitem']:has(svg)")
            || menu.querySelector("[role='menuitem']")
            || menu.querySelector("li[role='presentation']");
      }

      function buildMenuItem(template, label, iconPath, onSelect) {
         const item = template.cloneNode(true);
         item.classList.add(MENU_ITEM_CLASS);
         item.querySelector("span").textContent = label;

         ["id", "data-key", "data-focused", "data-hovered", "data-pressed", "data-focus-visible"].forEach((attribute) => {
            item.removeAttribute(attribute);
         });

         item.querySelectorAll("svg path").forEach((path, index) => {
            if (index === 0) {
               path.setAttribute("d", iconPath);
            } else {
               path.remove();
            }
         });

         const clickTarget = item.querySelector("button") || item;
         clickTarget.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            onSelect();
         });

         return item;
      }

      function decorateMenu(menu) {
         const alreadyDecorated = menu.querySelector("." + MENU_ITEM_CLASS);
         const template = findTemplate(menu);

         if (!menuOpenedInLibrary || alreadyDecorated || !template) {
            return;
         }

         const targetUri = menuTargetUri;
         const targetName = HIDEABLE_ITEMS[targetUri];
         const hidden = hiddenUris();

         if (targetName) {
            const hideItem = buildMenuItem(template, "Hide from library", HIDE_ICON_PATH, () => {
               saveHiddenUris([...new Set([...hiddenUris(), targetUri])]);
               Spicetify.showNotification?.(targetName + " hidden from your library");
               closeMenu(menu);
            });
            menu.appendChild(hideItem);
         }

         if (hidden.length > 0) {
            const hiddenNames = hidden.map((uri) => HIDEABLE_ITEMS[uri] || uri).join(" and ");
            const showItem = buildMenuItem(template, "Show " + hiddenNames, SHOW_ICON_PATH, () => {
               saveHiddenUris([]);
               closeMenu(menu);
            });
            menu.appendChild(showItem);
         }
      }

      function start() {
         document.head.appendChild(hidingStyle);
         renderHidingStyle();

         document.addEventListener("contextmenu", (event) => {
            const library = event.target.closest?.(LIBRARY_SELECTOR);
            const entry = event.target.closest?.("[aria-labelledby*='spotify:']");
            menuOpenedInLibrary = Boolean(library);
            menuTargetUri = library && entry ? uriFrom(entry) : null;
         }, true);

         document.addEventListener("mousedown", (event) => {
            const isRightClick = event.button === 2;

            if (!isRightClick) {
               menuOpenedInLibrary = false;
               menuTargetUri = null;
            }
         }, true);

         let menuCheckScheduled = false;

         core.onBodyMutations(() => {
            if (menuCheckScheduled) {
               return;
            }

            menuCheckScheduled = true;

            requestAnimationFrame(() => {
               menuCheckScheduled = false;
               const menu = document.querySelector("#context-menu [role='menu']");

               if (menu) {
                  decorateMenu(menu);
               }
            });
         });
      }

      core.whenReady("libraryHider", () => Boolean(window.Spicetify && document.head && document.body), start);
   }

   function libraryMoods(core) {
      const LIBRARY_SELECTOR = "#Desktop_LeftSidebar_Id";
      const ENTRY_SELECTOR = "[aria-labelledby*='spotify:']";
      const COVER_FRAME_SELECTOR = ".main-cardImage-imageWrapper, [class*='imageContainer']";
      const CACHE_KEY = "library-moods:v1";
      const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
      const EMPTY_TTL_MS = 24 * 60 * 60 * 1000;
      const STALE_AFTER_MS = 90 * 24 * 60 * 60 * 1000;
      const LIBRARY_REFRESH_MS = 2 * 60 * 1000;
      const ANALYSIS_GAP_MS = 700;
      const SAMPLE_TRACK_LIMIT = 100;
      const HIGH_ENERGY = 0.6;
      const HIGH_VALENCE = 0.5;
      const MOODS = {
         hype: { label: "Hype", color: "#ffb547" },
         intense: { label: "Intense", color: "#ff5d6c" },
         chill: { label: "Chill", color: "#5ee6a8" },
         moody: { label: "Moody", color: "#8e8cff" },
      };

      let libraryItems = new Map();
      let moodCache = readCache();
      let tagScheduled = false;
      let analysisRunning = false;

      function readCache() {
         try {
            return JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
         } catch (error) {
            return {};
         }
      }

      function writeCache() {
         try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(moodCache));
         } catch (error) {
            moodCache = {};
         }
      }

      function uriFrom(element) {
         const labelledBy = element.getAttribute("aria-labelledby") || "";
         const match = labelledBy.match(/(spotify:[^\s]+)/);
         return match ? match[1] : null;
      }

      function isStale(item) {
         const lastTouched = item.lastPlayedAt || item.addedAt;

         if (!lastTouched) {
            return false;
         }

         return Date.now() - new Date(lastTouched).getTime() > STALE_AFTER_MS;
      }

      function freshMoodFor(uri) {
         const cached = moodCache[uri];
         const isFresh = cached && Date.now() - cached.at < CACHE_TTL_MS;
         const hasMood = isFresh && !cached.none;
         return hasMood ? cached : null;
      }

      function hasFreshEntry(uri) {
         const cached = moodCache[uri];
         const ttl = cached?.none ? EMPTY_TTL_MS : CACHE_TTL_MS;
         return Boolean(cached) && Date.now() - cached.at < ttl;
      }

      function moodFromFeatures(energy, valence) {
         const isEnergetic = energy >= HIGH_ENERGY;
         const isPositive = valence >= HIGH_VALENCE;

         if (isEnergetic) {
            return isPositive ? "hype" : "intense";
         }

         return isPositive ? "chill" : "moody";
      }

      function describeMood(entry) {
         const energyPercent = Math.round(entry.energy * 100);
         const valencePercent = Math.round(entry.valence * 100);
         return `Mood: ${MOODS[entry.mood].label} (energy ${energyPercent}%, positivity ${valencePercent}%)`;
      }

      function tagEntry(entry) {
         const uri = uriFrom(entry);
         const card = entry.closest("li");

         if (!uri || !card) {
            return;
         }

         const item = libraryItems.get(uri);
         const mood = freshMoodFor(uri);
         const shouldFade = Boolean(item) && isStale(item);
         card.toggleAttribute("data-library-stale", shouldFade);

         if (mood) {
            const description = describeMood(mood);

            if (card.dataset.libraryMood !== mood.mood) {
               card.dataset.libraryMood = mood.mood;
            }

            if (card.title !== description) {
               card.title = description;
            }
         } else if (card.dataset.libraryMood) {
            delete card.dataset.libraryMood;
            card.removeAttribute("title");
         }
      }

      function tagAll() {
         tagScheduled = false;
         const library = document.querySelector(LIBRARY_SELECTOR);

         if (!library) {
            return;
         }

         library.querySelectorAll(ENTRY_SELECTOR).forEach(tagEntry);
      }

      function scheduleTagging() {
         if (tagScheduled) {
            return;
         }

         tagScheduled = true;
         requestAnimationFrame(tagAll);
      }

      async function refreshLibrary() {
         try {
            const contents = await Spicetify.Platform.LibraryAPI.getContents({ limit: 1000, offset: 0, flattenTree: true });
            libraryItems = new Map(contents.items.map((item) => [item.uri, item]));
            scheduleTagging();
            analyzeMissingPlaylists();
         } catch (error) {
            libraryItems = new Map();
         }
      }

      async function fetchAverageFeatures(playlistUri) {
         const contents = await Spicetify.Platform.PlaylistAPI.getContents(playlistUri, { limit: SAMPLE_TRACK_LIMIT });
         const trackIds = contents.items
            .map((track) => track.uri)
            .filter((uri) => uri?.startsWith("spotify:track:"))
            .map((uri) => uri.split(":")[2]);

         if (trackIds.length === 0) {
            return null;
         }

         const token = Spicetify.Platform.AuthorizationAPI.getState().token.accessToken;
         const response = await fetch("https://spclient.wg.spotify.com/audio-attributes/v1/audio-features?ids=" + trackIds.join(","), {
            headers: { Authorization: "Bearer " + token },
         });

         if (!response.ok) {
            return null;
         }

         const body = await response.json();
         const features = (body.audio_features || []).filter(Boolean);

         if (features.length === 0) {
            return null;
         }

         const average = (field) => features.reduce((sum, feature) => sum + feature[field], 0) / features.length;
         return { energy: average("energy"), valence: average("valence") };
      }

      async function analyzeMissingPlaylists() {
         if (analysisRunning) {
            return;
         }

         analysisRunning = true;

         const pending = [...libraryItems.values()].filter((item) => {
            const isPlaylist = item.type === "playlist";
            return isPlaylist && !hasFreshEntry(item.uri);
         });

         for (const item of pending) {
            try {
               const features = await fetchAverageFeatures(item.uri);

               if (features) {
                  moodCache[item.uri] = { ...features, mood: moodFromFeatures(features.energy, features.valence), at: Date.now() };
                  scheduleTagging();
               } else {
                  moodCache[item.uri] = { none: true, at: Date.now() };
               }
            } catch (error) {
               continue;
            }

            await new Promise((resolve) => setTimeout(resolve, ANALYSIS_GAP_MS));
         }

         writeCache();
         analysisRunning = false;
      }

      function installStyles() {
         const moodColors = Object.entries(MOODS).map(([mood, { color }]) => `
            ${LIBRARY_SELECTOR} li[data-library-mood="${mood}"] {
               --library-mood-color: ${color};
            }
         `).join("");

         const style = document.createElement("style");
         style.id = "library-moods";
         style.textContent = `
            ${moodColors}

            ${LIBRARY_SELECTOR} li[data-library-mood] :is(${COVER_FRAME_SELECTOR})::after {
               content: "";
               position: absolute;
               top: 6px;
               right: 6px;
               z-index: 3;
               width: 10px;
               height: 10px;
               border-radius: 50%;
               pointer-events: none;
               background: var(--library-mood-color);
               box-shadow:
                  0 0 0 2px rgba(0, 0, 0, 0.45),
                  0 0 8px var(--library-mood-color);
            }

            ${LIBRARY_SELECTOR} li[data-library-stale] {
               opacity: 0.5;
               transition: opacity 220ms linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1);
            }

            ${LIBRARY_SELECTOR} li[data-library-stale] img {
               filter: grayscale(0.65);
               transition: filter 220ms linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1);
            }

            ${LIBRARY_SELECTOR} li[data-library-stale]:hover {
               opacity: 1;
            }

            ${LIBRARY_SELECTOR} li[data-library-stale]:hover img {
               filter: none;
            }
         `;
         document.head.appendChild(style);
      }

      function start() {
         installStyles();

         core.onBodyMutations((mutations) => {
            const addedElement = mutations.some((mutation) => {
               for (const node of mutation.addedNodes) {
                  if (node.nodeType === Node.ELEMENT_NODE) {
                     return true;
                  }
               }

               return false;
            });

            if (addedElement) {
               scheduleTagging();
            }
         });

         refreshLibrary();
         setInterval(refreshLibrary, LIBRARY_REFRESH_MS);
      }

      const isSpicetifyReady = () => Boolean(window.Spicetify?.Platform?.LibraryAPI && Spicetify.Platform.PlaylistAPI && Spicetify.Platform.AuthorizationAPI && document.body);

      core.whenReady("libraryMoods", isSpicetifyReady, start);
   }

   function libraryOrder(core) {
      const LIBRARY_SELECTOR = "#Desktop_LeftSidebar_Id";
      const GRID_SELECTOR = "[class*='gridContainer']";
      const TITLE_PREFIX = "card-title-";
      const RESCAN_DEBOUNCE_MS = 150;
      const LAST_RANK = 99;

      const RANK_BY_KIND = {
         folder: 10,
         playlist: 20,
         collection: 30,
         album: 40,
         artist: 50,
         show: 60,
         episode: 65,
         concert: 80,
      };

      let rescanTimer = null;

      function readUri(item) {
         const labelled = item.querySelector(`[aria-labelledby^='${TITLE_PREFIX}']`) || item;
         const label = labelled.getAttribute("aria-labelledby") || "";
         return label.replace(TITLE_PREFIX, "");
      }

      function readKind(uri) {
         const parts = uri.split(":");
         const isFolder = uri.includes(":folder:");
         const kind = parts[1] || "";

         if (isFolder) {
            return "folder";
         }

         return kind;
      }

      function isPinned(item) {
         const titles = Array.from(item.querySelectorAll("svg > title"));

         return titles.some((title) => title.textContent.trim() === "Pinned");
      }

      function rankOf(item) {
         const uri = readUri(item);
         const hasUri = uri.startsWith("spotify:");

         if (!hasUri) {
            return LAST_RANK;
         }

         if (isPinned(item)) {
            return 0;
         }

         const kind = readKind(uri);
         const rank = RANK_BY_KIND[kind];

         return rank === undefined ? 70 : rank;
      }

      function applyOrder() {
         rescanTimer = null;

         const library = document.querySelector(LIBRARY_SELECTOR);
         const grid = library && library.querySelector(GRID_SELECTOR);

         if (!grid) {
            return;
         }

         Array.from(grid.children).forEach((item) => {
            const rank = String(rankOf(item));
            const isCurrent = item.style.order === rank;

            if (!isCurrent) {
               item.style.order = rank;
            }
         });
      }

      function scheduleOrder() {
         if (rescanTimer !== null) {
            return;
         }

         rescanTimer = setTimeout(applyOrder, RESCAN_DEBOUNCE_MS);
      }

      function start() {
         const library = document.querySelector(LIBRARY_SELECTOR);
         const observer = new MutationObserver(scheduleOrder);
         observer.observe(library, { childList: true, subtree: true });
         applyOrder();
      }

      core.whenReady("libraryOrder", () => Boolean(document.querySelector(LIBRARY_SELECTOR)), start);
   }

   function libraryPicker(core) {
      const LIBRARY = "html:root #main #Desktop_LeftSidebar_Id .YourLibraryX";
      const CHIP_ROW = `${LIBRARY} > div:first-child > div:has([aria-label='Filter options'])`;
      const TRACK = `${CHIP_ROW} > div`;
      const LISTBOX = `${TRACK} [aria-label='Filter options']`;
      const OPTION = `${LISTBOX} > [role='option']`;
      const CHIP = `${LISTBOX} [data-encore-id='chip']`;
      const CHIP_INNER = `${CHIP} [class*='legacy-chip__inner']`;
      const CLEAR = `${LISTBOX} [data-encore-id='chipClear']`;
      const INNER_SELECTOR = "[class*='legacy-chip__inner']";
      const CHECKED_SELECTOR = `[data-encore-id='chip'][aria-checked='true'] ${INNER_SELECTOR}`;
      const PRESS = "linear(0, 0.003 1.1%, 0.027 3.4%, 0.091 6.7%, 0.445 20.2%, 0.55 24.7%, 0.619 28.1%, 0.732 34.8%, 0.827 42.7%, 0.904 52.8%, 0.951 64%, 0.981 78.7%, 1)";
      const RELEASE = "linear(0, 0.023 3.2%, 0.101 7.1%, 0.198 10.7%, 0.533 21.7%, 0.712 28.8%, 0.837 35.5%, 0.923 42.2%, 0.984 50.5%, 1.015 60.7%, 1.02 72.2%, 1)";
      const HOVER = "linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1)";
      const TOGGLE = "linear(0, 0.023 3.4%, 0.099 7.6%, 0.192 11.4%, 0.499 22.8%, 0.67 30.4%, 0.786 37.1%, 0.875 44.3%, 0.946 53.6%, 0.987 64.6%, 1.004 78.1%, 1)";
      const MENU = "linear(0, 0.018 3.7%, 0.071 7.8%, 0.154 12.4%, 0.435 25.7%, 0.574 33%, 0.703 41.3%, 0.806 50%, 0.884 59.6%, 0.941 70.6%, 0.976 83.5%, 1)";
      const VIEW = "linear(0, 0.02 2.9%, 0.085 6.5%, 0.45 20.5%, 0.615 28%, 0.735 35.1%, 0.824 42.6%, 0.902 52.7%, 0.952 64.4%, 0.981 79%, 1)";

      const STIFFNESS = 320;
      const DAMPING = 24;
      const MAX_STEP_S = 1 / 30;
      const FOLLOW_MS = 300;
      const POINTER_FOLLOW_MS = 280;
      const STRETCH_PER_VELOCITY = 1 / 2600;
      const MAX_STRETCH = 0.24;
      const BLOOM_START = 0.35;
      const ENTER_STAGGER_MS = 30;
      const ENTER_STAGGER_CAP_MS = 120;
      const RESCAN_DEBOUNCE_MS = 200;
      const GLOW_HALF_WIDTH = 90;
      const GLOW_HALF_HEIGHT = 60;
      const PRESSABLE_SELECTOR = `${INNER_SELECTOR}, [data-encore-id='chipClear']`;

      const style = document.createElement("style");
      style.id = "library-picker";
      style.textContent = `
         ${TRACK} > .lp-rim {
            position: absolute;
            inset: 0;
            z-index: 2;
            padding: 1px;
            overflow: clip;
            border-radius: inherit;
            -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
            -webkit-mask-composite: xor;
            mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
            opacity: 0.55;
            pointer-events: none;
            transition: opacity 220ms ${HOVER};
         }

         ${TRACK}:hover > .lp-rim {
            opacity: 0.9;
         }

         .lp-rim-spin {
            position: absolute;
            left: 50%;
            top: 50%;
            width: 200%;
            aspect-ratio: 1;
            transform: translate(-50%, -50%);
            will-change: transform;
            background: conic-gradient(
               color-mix(in srgb, var(--liq-1, #5b4bd8) 70%, transparent),
               rgba(255, 255, 255, 0.05) 22%,
               color-mix(in srgb, var(--liq-3, #3b9be0) 65%, transparent) 45%,
               rgba(255, 255, 255, 0.04) 66%,
               color-mix(in srgb, var(--liq-2, #d84b9c) 70%, transparent) 84%,
               color-mix(in srgb, var(--liq-1, #5b4bd8) 70%, transparent));
            animation: lp-rim 36s steps(216) infinite;
         }

         ${TRACK} > .lp-glow {
            position: absolute;
            left: 0;
            top: 0;
            z-index: 0;
            width: ${GLOW_HALF_WIDTH * 2}px;
            height: ${GLOW_HALF_HEIGHT * 2}px;
            background: radial-gradient(${GLOW_HALF_WIDTH}px ${GLOW_HALF_HEIGHT}px at 50% 50%,
               color-mix(in srgb, var(--liq-2, #fff) 30%, rgba(255, 255, 255, 0.14)),
               transparent 70%);
            opacity: 0;
            pointer-events: none;
            will-change: transform;
            transition: opacity 220ms ${HOVER};
         }

         ${TRACK}:hover > .lp-glow {
            opacity: 1;
         }

         ${TRACK} > div:first-child {
            position: relative;
            z-index: 1;
         }

         .lp-blob {
            display: block;
            position: absolute;
            left: 0;
            top: 0;
            z-index: 0;
            overflow: clip;
            border-radius: 999px;
            opacity: 0;
            pointer-events: none;
            transform-origin: center;
            will-change: transform;
            box-shadow:
               0 6px 16px -6px color-mix(in srgb, var(--liq-2, #d84b9c) 85%, transparent),
               0 0 24px -6px color-mix(in srgb, var(--liq-3, #3b9be0) 55%, transparent);
            transition: opacity 240ms ${TOGGLE};
         }

         .lp-blob-flow {
            position: absolute;
            left: 0;
            top: 0;
            width: 320%;
            height: 100%;
            will-change: transform;
            background: linear-gradient(110deg,
               var(--liq-1, #5b4bd8),
               var(--liq-2, #d84b9c) 30%,
               var(--liq-3, #3b9be0) 62%,
               var(--liq-4, #8a6cff) 82%,
               var(--liq-1, #5b4bd8));
            animation: lp-flow 16s steps(128) infinite alternate;
         }

         .lp-blob::before {
            content: "";
            position: absolute;
            inset: 0;
            z-index: 1;
            border-radius: inherit;
            background: linear-gradient(165deg, rgba(255, 255, 255, 0.38), rgba(255, 255, 255, 0.04) 48%, rgba(255, 255, 255, 0) 60%);
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.55),
               inset 0 -2px 3px rgba(0, 0, 0, 0.16),
               inset 0 0 0 1px rgba(255, 255, 255, 0.16);
         }

         .lp-blob.is-sub {
            box-shadow: 0 4px 14px -8px color-mix(in srgb, var(--liq-3, #3b9be0) 80%, transparent);
         }

         .lp-blob.is-sub .lp-blob-flow {
            background: linear-gradient(110deg,
               color-mix(in srgb, var(--liq-3, #3b9be0) 34%, rgba(255, 255, 255, 0.06)),
               color-mix(in srgb, var(--liq-2, #d84b9c) 26%, rgba(255, 255, 255, 0.05)) 50%,
               color-mix(in srgb, var(--liq-3, #3b9be0) 34%, rgba(255, 255, 255, 0.06)));
         }

         .lp-blob.is-sub::before {
            background: linear-gradient(165deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0) 55%);
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.34),
               inset 0 0 0 1px color-mix(in srgb, var(--liq-3, #fff) 45%, rgba(255, 255, 255, 0.1));
         }

         .lp-blob.is-shown {
            opacity: 1;
         }

         .lp-blob:not(.is-shown) .lp-blob-flow,
         html[data-lp-paused] .lp-blob-flow,
         html[data-lp-paused] .lp-rim-spin {
            animation-play-state: paused;
         }

         .lp-blob::after {
            content: "";
            position: absolute;
            left: 0;
            top: 0;
            z-index: 2;
            width: 220%;
            height: 100%;
            background: linear-gradient(105deg, transparent 30%, rgba(255, 255, 255, 0.5) 48%, transparent 64%);
            mix-blend-mode: soft-light;
            opacity: 0;
            transform: translateX(82%);
         }

         .lp-blob.is-arriving::after {
            animation:
               lp-sheen-move 300ms ${VIEW} both,
               lp-sheen-fade 300ms linear both;
         }

         .lp-ripple {
            position: absolute;
            z-index: 0;
            border-radius: 50%;
            pointer-events: none;
            background: radial-gradient(circle,
               rgba(255, 255, 255, 0.32),
               color-mix(in srgb, var(--liq-2, #fff) 30%, transparent) 45%,
               transparent 70%);
         }

         ${CHIP_INNER} {
            min-block-size: 28px !important;
            padding-inline: 13px !important;
            border-radius: 999px !important;
            color: rgba(255, 255, 255, 0.68) !important;
            background: transparent !important;
            box-shadow: none !important;
            animation: none !important;
            -webkit-backdrop-filter: none !important;
            backdrop-filter: none !important;
            letter-spacing: 0.01em;
            transition:
               color 220ms ${HOVER},
               background-color 220ms ${HOVER},
               box-shadow 220ms ${HOVER},
               text-shadow 220ms ${HOVER},
               transform 250ms ${RELEASE} !important;
         }

         ${CHIP_INNER}::after {
            opacity: 0 !important;
         }

         ${CHIP}[aria-checked='false'] [class*='legacy-chip__inner']:hover {
            color: #fff !important;
            filter: none !important;
            transform: scale(1.04) !important;
            background: rgba(255, 255, 255, 0.07) !important;
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.14),
               inset 0 0 0 1px rgba(255, 255, 255, 0.05) !important;
            transition-duration: 220ms !important;
            transition-timing-function: ${HOVER} !important;
         }

         ${CHIP}[aria-checked='true'] [class*='legacy-chip__inner'] {
            color: #fff !important;
            text-shadow: 0 1px 8px rgba(0, 0, 0, 0.35);
         }

         ${CHIP}[aria-checked='true'] [class*='legacy-chip__inner']:hover {
            filter: none !important;
            transform: scale(1.035) !important;
            box-shadow: none !important;
            transition-duration: 220ms !important;
            transition-timing-function: ${HOVER} !important;
         }

         ${CHIP}[aria-checked] [class*='legacy-chip__inner']:active {
            transform: scale(0.93) !important;
            transition-duration: 90ms !important;
            transition-timing-function: ${PRESS} !important;
         }

         ${OPTION}[data-focus-visible] :is([class*='legacy-chip__inner'], [data-encore-id='chipClear']) {
            box-shadow:
               0 0 0 2px color-mix(in srgb, var(--liq-2, #fff) 70%, #fff),
               0 0 14px 2px color-mix(in srgb, var(--liq-2, #fff) 45%, transparent) !important;
         }

         ${CLEAR} {
            inline-size: 28px !important;
            block-size: 28px !important;
            min-block-size: 28px !important;
            margin-inline: auto;
            border-radius: 50% !important;
            color: rgba(255, 255, 255, 0.8) !important;
            background:
               linear-gradient(165deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.02) 60%),
               color-mix(in srgb, var(--liq-1, #000) 18%, rgba(255, 255, 255, 0.04)) !important;
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.22),
               inset 0 0 0 1px rgba(255, 255, 255, 0.07) !important;
            transition:
               color 220ms ${HOVER},
               background-color 220ms ${HOVER},
               box-shadow 220ms ${HOVER},
               transform 250ms ${RELEASE} !important;
         }

         ${CLEAR} svg {
            transition: transform 240ms ${TOGGLE};
         }

         ${CLEAR}:hover {
            color: #fff !important;
            transform: scale(1.08);
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.3),
               inset 0 0 0 1px color-mix(in srgb, var(--liq-2, #fff) 50%, transparent),
               0 4px 14px -6px color-mix(in srgb, var(--liq-2, #d84b9c) 80%, transparent) !important;
            transition-duration: 220ms !important;
            transition-timing-function: ${HOVER} !important;
         }

         ${CLEAR}:hover svg {
            transform: rotate(90deg);
         }

         ${CLEAR}:active {
            transform: scale(0.88);
            transition-duration: 90ms !important;
            transition-timing-function: ${PRESS} !important;
         }

         ${OPTION}[data-lp-enter] > [data-carousel-item] {
            animation: lp-rise 240ms ${MENU} both;
            animation-delay: var(--lp-delay, 0ms);
         }

         ${OPTION}[data-lp-enter] [data-encore-id='chipClear'] {
            animation: lp-spin-in 300ms ${VIEW} both;
         }

         @keyframes lp-rim {
            from { transform: translate(-50%, -50%) rotate(0deg); }
            to { transform: translate(-50%, -50%) rotate(360deg); }
         }

         @keyframes lp-flow {
            from { transform: translateX(0); }
            to { transform: translateX(-68.75%); }
         }

         @keyframes lp-sheen-move {
            from { transform: translateX(82%); }
            to { transform: translateX(-82%); }
         }

         @keyframes lp-sheen-fade {
            0% { opacity: 0; }
            25% { opacity: 1; }
            100% { opacity: 0; }
         }

         @keyframes lp-rise {
            from {
               opacity: 0;
               filter: blur(6px);
               transform: translateY(5px) scale(0.86);
            }
         }

         @keyframes lp-spin-in {
            from {
               opacity: 0;
               transform: rotate(-120deg) scale(0.4);
            }
         }

         @media (prefers-reduced-motion: reduce) {
            .lp-rim-spin,
            .lp-blob-flow,
            .lp-blob.is-arriving::after,
            ${OPTION}[data-lp-enter] > [data-carousel-item],
            ${OPTION}[data-lp-enter] [data-encore-id='chipClear'] {
               animation: none !important;
            }

            ${CHIP_INNER},
            ${CLEAR},
            ${CLEAR} svg,
            ${TRACK} > .lp-rim,
            ${TRACK} > .lp-glow,
            .lp-blob {
               transition-duration: 120ms !important;
               transition-timing-function: linear !important;
            }

            ${CHIP}[aria-checked] [class*='legacy-chip__inner']:is(:hover, :active),
            ${CLEAR}:is(:hover, :active),
            ${CLEAR}:hover svg {
               transform: none !important;
               transition-duration: 120ms !important;
               transition-timing-function: linear !important;
            }
         }
      `;
      document.head.appendChild(style);

      const HEADER_CLASS = "sm-library-header";
      const H_LIBRARY = `html:root.${HEADER_CLASS} #main #Desktop_LeftSidebar_Id .YourLibraryX`;
      const H_DOCK = `${H_LIBRARY} > div:first-child`;
      const H_HEADER = `${H_DOCK} > header`;
      const H_CREATE = `${H_HEADER} button[aria-label='Create']`;
      const H_EXPAND = `${H_HEADER} button:is([aria-label='Expand Your Library'], [aria-label='Minimize Your Library'], [aria-label^='Show less'], [aria-label^='Show more'])`;
      const H_ROW = `${H_DOCK} > div:has([aria-label='Filter options'])`;
      const H_TRACK = `${H_ROW} > div`;
      const H_LISTBOX = `${H_TRACK} [aria-label='Filter options']`;
      const H_OPTION = `${H_LISTBOX} > [role='option']`;
      const H_CHIP = `${H_LISTBOX} [data-encore-id='chip']`;
      const H_INNER = `${H_CHIP} [class*='legacy-chip__inner']`;
      const H_CLEAR = `${H_LISTBOX} [data-encore-id='chipClear']`;
      const H_SHOW_ALL = `html:root.${HEADER_CLASS} #main .main-view-container a[href^='/section/']:has(> span.encore-text-body-small-bold)`;
      const H_LENS = `:is(${H_CREATE}, ${H_SHOW_ALL})`;

      function whileResting(selector) {
         return selector.replace(`html:root.${HEADER_CLASS}`, `html:root.${HEADER_CLASS}.sm-ambient-rest`);
      }
      const H_SLIDE_HOSTS = `:is(button[aria-label='Create'], [class*='legacy-chip__inner'])`;
      const DIALOG = "linear(0, 0.023 3.7%, 0.086 7.7%, 0.171 11.7%, 0.461 24.1%, 0.619 32.1%, 0.729 39.1%, 0.815 46.5%, 0.895 56.5%, 0.948 67.9%, 0.979 81.6%, 1)";
      const BLOB_STOP = (index) => `color-mix(in srgb, color-mix(in srgb, var(--liq-${index}, #5b4bd8), #000 var(--lp-dim, 0%)), #fff var(--lp-lift, 0%))`;
      const MAX_BLOB_LUMINANCE = 0.11;
      const MIN_BLOB_LUMINANCE = 0.045;
      const MAX_LIFT = 0.3;
      const MAX_DIM = 0.8;
      const WIDE_SIDEBAR_PX = 600;
      const WIDE_ATTRIBUTE = "data-lp-wide";
      const H_WIDE_SIDEBAR = `html:root.${HEADER_CLASS} #main #Desktop_LeftSidebar_Id[${WIDE_ATTRIBUTE}]`;
      const H_WIDE_TRACK = `${H_WIDE_SIDEBAR} .YourLibraryX > div:first-child > div:has([aria-label='Filter options']) > div`;
      const DIM_STEP = 0.02;

      const headerStyle = document.createElement("style");
      headerStyle.id = "library-header";
      headerStyle.textContent = `
         ${H_DOCK} {
            margin: 8px 8px 0 !important;
            padding: 0 0 2px !important;
            border-radius: 0 !important;
            background: none !important;
            box-shadow: none !important;
            transition: none !important;
         }

         ${H_HEADER} {
            min-block-size: 48px;
            padding-block: 6px !important;
            padding-inline: 8px 6px !important;
         }

         ${H_HEADER} button[aria-label='Collapse Your Library'],
         ${H_HEADER} button[aria-label='Collapse Your Library'] > span {
            transition: transform 220ms ${HOVER}, opacity 220ms ${HOVER} !important;
         }

         ${H_HEADER} h1 {
            overflow: hidden;
            font-size: 1.0625rem !important;
            letter-spacing: 0 !important;
            white-space: nowrap;
            text-overflow: ellipsis;
            color: #fff !important;
            background: none !important;
            -webkit-text-fill-color: currentColor !important;
            transition: none !important;
         }

         ${H_HEADER} > div > div:last-child {
            flex-shrink: 0;
            gap: 4px;
         }

         ${H_CREATE} {
            inline-size: 32px !important;
            min-inline-size: 32px !important;
            padding: 0 !important;
         }

         ${H_LENS} {
            position: relative;
            overflow: hidden;
            block-size: 32px !important;
            min-block-size: 32px !important;
            border-radius: 16px !important;
            color: #fff !important;
            animation: none !important;
            filter: none;
            -webkit-backdrop-filter: none !important;
            backdrop-filter: none !important;
            background:
               linear-gradient(170deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0) 55%),
               color-mix(in srgb, var(--liq-1, #5b4bd8) 30%, rgba(255, 255, 255, 0.09)) !important;
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.28),
               inset 0 0 0 1px rgba(255, 255, 255, 0.08),
               0 4px 12px -6px rgba(0, 0, 0, 0.6) !important;
            transition:
               transform 250ms ${RELEASE},
               background-color 220ms ${HOVER},
               filter 300ms ${DIALOG} !important;
         }

         ${H_CREATE}:has(> span) {
            inline-size: auto !important;
            gap: 6px;
            padding-inline: 10px 14px !important;
         }

         ${H_SHOW_ALL} {
            display: inline-flex !important;
            align-items: center;
            inline-size: auto !important;
            min-inline-size: 0 !important;
            padding: 0 14px !important;
            margin-block: 8px;
            text-decoration: none !important;
         }

         ${H_SHOW_ALL} > span {
            color: #fff !important;
            letter-spacing: 0.01em;
         }

         ${H_SHOW_ALL}::before,
         ${H_SHOW_ALL}::after {
            content: none !important;
            animation: none !important;
         }

         ${H_SHOW_ALL}:focus-visible {
            outline: 2px solid rgba(255, 255, 255, 0.9) !important;
            outline-offset: 2px;
         }

         ${H_HEADER} ${H_SLIDE_HOSTS}::before,
         ${H_HEADER} ${H_SLIDE_HOSTS}::after,
         ${H_LISTBOX} ${H_SLIDE_HOSTS}::before {
            content: none !important;
            animation: none !important;
         }

         ${H_CREATE} svg {
            filter: none !important;
            transform: none !important;
         }

         ${H_LENS}:hover {
            transform: scale(1.06) !important;
            filter: brightness(1.18) !important;
            transition:
               transform 220ms ${HOVER},
               background-color 220ms ${HOVER},
               filter 220ms ${HOVER} !important;
         }

         ${H_LENS}:active {
            transform: scale(0.94) !important;
            transition: transform 90ms ${PRESS}, filter 90ms ${PRESS} !important;
         }

         ${H_EXPAND} {
            max-width: none !important;
            inline-size: 32px !important;
            block-size: 32px !important;
            min-inline-size: 32px !important;
            min-block-size: 32px !important;
            padding: 0 !important;
            justify-content: center;
            border-radius: 16px !important;
            overflow: visible;
            opacity: 0.62 !important;
            transform: none;
            background-color: transparent !important;
            transition:
               opacity 220ms ${HOVER},
               background-color 220ms ${HOVER},
               transform 250ms ${RELEASE} !important;
         }

         ${H_EXPAND}:hover {
            opacity: 1 !important;
            background-color: rgba(255, 255, 255, 0.08) !important;
         }

         ${H_EXPAND}:active {
            transform: scale(0.94);
            transition: transform 90ms ${PRESS} !important;
         }

         ${H_HEADER} button:focus-visible {
            outline: 2px solid rgba(255, 255, 255, 0.9) !important;
            outline-offset: 2px;
         }

         ${H_ROW} {
            margin-inline: 0 !important;
            margin-bottom: 2px !important;
         }

         ${H_TRACK} {
            flex: 1 1 auto;
            min-inline-size: 0;
            padding: 4px !important;
            border-radius: 18px !important;
            background: rgba(0, 0, 0, 0.24) !important;
            box-shadow:
               inset 0 1px 3px rgba(0, 0, 0, 0.45),
               inset 0 -1px 0 rgba(255, 255, 255, 0.06) !important;
         }

         ${H_LISTBOX} {
            gap: 4px !important;
         }

         ${H_WIDE_SIDEBAR} {
            background-color: rgba(14, 13, 22, 0.97) !important;
         }

         ${H_WIDE_TRACK} {
            flex: 0 1 auto;
         }

         ${H_WIDE_TRACK} [aria-label='Filter options'] > * {
            flex: 0 0 auto !important;
         }

         ${H_TRACK} > .lp-rim {
            opacity: 0.45;
            transition: opacity 220ms ${HOVER}, filter 300ms ${DIALOG};
         }

         ${H_TRACK}:hover > .lp-rim {
            opacity: 0.8;
         }

         ${H_TRACK} .lp-rim-spin {
            animation: none !important;
            will-change: auto;
            transform: translate(-50%, -50%) rotate(-40deg);
         }

         ${H_INNER} {
            min-block-size: 28px !important;
            padding-inline: 12px !important;
            border-radius: 14px !important;
            color: rgba(255, 255, 255, 0.72) !important;
            background: transparent !important;
            -webkit-backdrop-filter: none !important;
            backdrop-filter: none !important;
            box-shadow: none !important;
            text-shadow: none;
            filter: none !important;
            transition:
               color 220ms ${HOVER},
               background-color 220ms ${HOVER},
               transform 250ms ${RELEASE} !important;
         }

         ${H_CHIP}[aria-checked='false'] [class*='legacy-chip__inner']:hover {
            transform: none !important;
            color: #fff !important;
            background: rgba(255, 255, 255, 0.08) !important;
            box-shadow: none !important;
         }

         ${H_CHIP}[aria-checked='true'] [class*='legacy-chip__inner'] {
            color: #fff !important;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
         }

         ${H_CHIP}[aria-checked='true'] [class*='legacy-chip__inner']:hover {
            transform: none !important;
         }

         ${H_CHIP}[aria-checked] [class*='legacy-chip__inner']:active {
            transform: scale(0.96) !important;
            transition-duration: 90ms !important;
            transition-timing-function: ${PRESS} !important;
         }

         ${H_OPTION}[data-focus-visible] :is([class*='legacy-chip__inner'], [data-encore-id='chipClear']) {
            box-shadow:
               0 0 0 2px rgba(255, 255, 255, 0.9),
               0 0 12px 2px color-mix(in srgb, var(--liq-2, #fff) 40%, transparent) !important;
         }

         ${H_CLEAR} {
            inline-size: 28px !important;
            block-size: 28px !important;
            min-block-size: 28px !important;
            margin-inline: 0 !important;
            color: rgba(255, 255, 255, 0.85) !important;
            background:
               linear-gradient(170deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0) 60%),
               rgba(255, 255, 255, 0.06) !important;
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.2),
               inset 0 0 0 1px rgba(255, 255, 255, 0.06) !important;
         }

         ${H_CLEAR}:hover {
            transform: none;
            background-color: rgba(255, 255, 255, 0.12) !important;
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.26),
               inset 0 0 0 1px rgba(255, 255, 255, 0.1) !important;
         }

         ${H_LISTBOX} > [role='option']:has([data-encore-id='chipClear']) {
            flex: 0 0 auto !important;
         }

         html:root.${HEADER_CLASS} .lp-blob {
            box-shadow: 0 4px 12px -6px color-mix(in srgb, var(--liq-1, #5b4bd8) 70%, #000);
            transition: opacity 240ms ${TOGGLE}, filter 300ms ${DIALOG};
         }

         html:root.${HEADER_CLASS} .lp-blob-flow {
            background: linear-gradient(110deg, ${BLOB_STOP(1)}, ${BLOB_STOP(2)} 30%, ${BLOB_STOP(3)} 62%, ${BLOB_STOP(4)} 82%, ${BLOB_STOP(1)});
         }

         html:root.${HEADER_CLASS} .lp-blob::before {
            background: linear-gradient(175deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0) 42%);
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.4),
               inset 0 0 0 1px rgba(255, 255, 255, 0.1);
         }

         html:root.${HEADER_CLASS} .lp-blob.is-sub {
            box-shadow: none;
         }

         html:root.${HEADER_CLASS} .lp-blob.is-sub .lp-blob-flow {
            background: color-mix(in srgb, ${BLOB_STOP(3)} 40%, rgba(255, 255, 255, 0.08));
         }

         html:root.${HEADER_CLASS}.sm-ambient-rest .lp-blob,
         ${whileResting(H_CREATE)},
         ${whileResting(H_SHOW_ALL)} {
            filter: saturate(0.65) !important;
         }

         ${whileResting(H_TRACK)} > .lp-rim {
            opacity: 0.3;
         }

         @media (prefers-reduced-transparency: reduce) {
            ${H_TRACK} {
               background: rgb(18, 16, 26) !important;
            }

            ${H_LENS} {
               background: color-mix(in srgb, var(--liq-1, #5b4bd8) 22%, rgb(44, 40, 60)) !important;
            }

            ${H_CLEAR} {
               background: rgb(44, 40, 60) !important;
            }

            html:root.${HEADER_CLASS} .lp-blob::before {
               background: none;
            }

            ${H_TRACK} > .lp-glow {
               display: none;
            }
         }

         @media (prefers-reduced-motion: reduce) {
            ${H_LENS},
            ${H_EXPAND},
            ${H_INNER} {
               transition-duration: 120ms !important;
               transition-timing-function: linear !important;
            }

            ${H_LENS}:is(:hover, :active),
            ${H_EXPAND}:active,
            ${H_CHIP}[aria-checked] [class*='legacy-chip__inner']:active {
               transform: none !important;
            }
         }
      `;
      document.head.appendChild(headerStyle);
      document.documentElement.classList.add(HEADER_CLASS);

      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

      let track = null;
      let listbox = null;
      let glow = null;
      let blobs = [];
      let frame = null;
      let lastFrameTime = 0;
      let followUntil = 0;
      let needsAssign = false;
      let trackBoundsCache = null;
      let knownOptions = new WeakSet();
      const boundTracks = new WeakSet();

      const listboxObserver = new MutationObserver(onListboxMutation);
      const resizeObserver = new ResizeObserver(() => {
         invalidateTrackBounds();
         syncWide();
         follow();
      });

      function syncWide() {
         const sidebar = track?.closest("#Desktop_LeftSidebar_Id");

         if (!sidebar) {
            return;
         }

         const isWide = sidebar.getBoundingClientRect().width >= WIDE_SIDEBAR_PX;

         if (sidebar.hasAttribute(WIDE_ATTRIBUTE) !== isWide) {
            sidebar.toggleAttribute(WIDE_ATTRIBUTE, isWide);
         }
      }

      function invalidateTrackBounds() {
         trackBoundsCache = null;
      }

      function getTrackBounds() {
         trackBoundsCache ??= track.getBoundingClientRect();

         return trackBoundsCache;
      }

      function createSpan(className) {
         const element = document.createElement("span");
         element.className = className;

         return element;
      }

      function createBlob(className) {
         const element = createSpan(className);
         element.appendChild(createSpan("lp-blob-flow"));

         return {
            element,
            target: null,
            shown: false,
            x: 0, y: 0, w: 0, h: 0,
            vx: 0, vy: 0, vw: 0, vh: 0,
         };
      }

      function createRim() {
         const rim = createSpan("lp-rim");
         rim.appendChild(createSpan("lp-rim-spin"));

         return rim;
      }

      function measure(inner, trackBounds) {
         const bounds = inner.getBoundingClientRect();

         return {
            x: bounds.left - trackBounds.left,
            y: bounds.top - trackBounds.top,
            w: bounds.width,
            h: bounds.height,
         };
      }

      function snapTo(blob, rect) {
         const bloomWidth = rect.w * BLOOM_START;
         const bloomHeight = rect.h * BLOOM_START;

         blob.x = rect.x + (rect.w - bloomWidth) / 2;
         blob.y = rect.y + (rect.h - bloomHeight) / 2;
         blob.w = bloomWidth;
         blob.h = bloomHeight;
         blob.vx = blob.vy = blob.vw = blob.vh = 0;
      }

      function stepAxis(blob, key, velocityKey, goal, dt) {
         const displacement = goal - blob[key];
         const acceleration = STIFFNESS * displacement - DAMPING * blob[velocityKey];
         blob[velocityKey] += acceleration * dt;
         blob[key] += blob[velocityKey] * dt;

         const isSettled = Math.abs(displacement) < 0.25 && Math.abs(blob[velocityKey]) < 0.5;

         if (isSettled) {
            blob[key] = goal;
            blob[velocityKey] = 0;
         }

         return isSettled;
      }

      function render(blob) {
         const speed = Math.hypot(blob.vx, blob.vy);
         const stretch = Math.min(speed * STRETCH_PER_VELOCITY, MAX_STRETCH);
         const isMostlyHorizontal = Math.abs(blob.vx) >= Math.abs(blob.vy);
         const scaleX = isMostlyHorizontal ? 1 + stretch : 1 - stretch * 0.4;
         const scaleY = isMostlyHorizontal ? 1 - stretch * 0.5 : 1 + stretch;

         blob.element.style.width = Math.max(blob.w, 0) + "px";
         blob.element.style.height = Math.max(blob.h, 0) + "px";
         blob.element.style.transform = `translate(${blob.x}px, ${blob.y}px) scale(${scaleX}, ${scaleY})`;
      }

      function tick(now) {
         frame = null;

         if (!track?.isConnected) {
            return;
         }

         const previousFrameTime = lastFrameTime;

         if (needsAssign) {
            needsAssign = false;
            assignTargets();
         }

         const dt = Math.min((now - previousFrameTime) / 1000 || MAX_STEP_S, MAX_STEP_S);
         lastFrameTime = now;

         const activeBlobs = blobs.filter((blob) => Boolean(blob.target?.isConnected));
         const trackBounds = track.getBoundingClientRect();
         const rects = activeBlobs.map((blob) => measure(blob.target, trackBounds));
         const isReducedMotion = prefersReducedMotion.matches;

         let allSettled = true;

         activeBlobs.forEach((blob, index) => {
            const rect = rects[index];

            if (isReducedMotion) {
               Object.assign(blob, rect, { vx: 0, vy: 0, vw: 0, vh: 0 });
               return;
            }

            const settledX = stepAxis(blob, "x", "vx", rect.x, dt);
            const settledY = stepAxis(blob, "y", "vy", rect.y, dt);
            const settledW = stepAxis(blob, "w", "vw", rect.w, dt);
            const settledH = stepAxis(blob, "h", "vh", rect.h, dt);
            const isBlobSettled = settledX && settledY && settledW && settledH;

            allSettled = allSettled && isBlobSettled;
         });

         activeBlobs.forEach(render);

         const isStillFollowing = now < followUntil;
         const shouldContinue = (!allSettled || isStillFollowing) && !frame;

         if (shouldContinue) {
            frame = requestAnimationFrame(tick);
         }
      }

      function follow(duration = FOLLOW_MS) {
         followUntil = Math.max(followUntil, performance.now() + duration);

         if (!frame) {
            lastFrameTime = performance.now();
            frame = requestAnimationFrame(tick);
         }
      }

      function arrive(blob) {
         blob.element.classList.remove("is-arriving");
         void blob.element.offsetWidth;
         blob.element.classList.add("is-arriving");
      }

      function assignTargets() {
         if (!listbox) {
            return;
         }

         const checkedInners = [...listbox.querySelectorAll(CHECKED_SELECTOR)];
         const trackBounds = track.getBoundingClientRect();

         blobs.forEach((blob, index) => {
            const nextTarget = checkedInners[index] ?? null;
            const hasNewTarget = Boolean(nextTarget) && nextTarget !== blob.target;

            if (hasNewTarget) {
               const wasHidden = !blob.shown;

               if (wasHidden) {
                  snapTo(blob, measure(nextTarget, trackBounds));
                  render(blob);
               }

               blob.target = nextTarget;
               blob.shown = true;
               blob.element.classList.add("is-shown");
               arrive(blob);
            }

            if (!nextTarget && blob.shown) {
               blob.shown = false;
               blob.target = null;
               blob.element.classList.remove("is-shown");
            }
         });

         follow();
      }

      function onEnterAnimationEnd(event) {
         const option = event.currentTarget;
         const runningAnimations = option.getAnimations({ subtree: true })
            .filter((animation) => animation instanceof CSSAnimation && animation.playState !== "finished");
         const isStillAnimating = runningAnimations.length > 0;

         if (isStillAnimating) {
            return;
         }

         delete option.dataset.lpEnter;
         option.style.removeProperty("--lp-delay");
         option.removeEventListener("animationend", onEnterAnimationEnd);
      }

      function markEntering(options) {
         if (prefersReducedMotion.matches) {
            return;
         }

         options.forEach((option, index) => {
            const delay = Math.min(index * ENTER_STAGGER_MS, ENTER_STAGGER_CAP_MS);

            option.style.setProperty("--lp-delay", delay + "ms");
            option.dataset.lpEnter = "";
            option.addEventListener("animationend", onEnterAnimationEnd);
         });
      }

      function collectNewOptions() {
         const options = [...listbox.querySelectorAll(":scope > [role='option']")];
         const freshOptions = options.filter((option) => !knownOptions.has(option));

         options.forEach((option) => knownOptions.add(option));

         return freshOptions;
      }

      function onListboxMutation(mutations) {
         const hasNewNodes = mutations.some((mutation) => mutation.type === "childList" && mutation.addedNodes.length > 0);

         if (hasNewNodes) {
            markEntering(collectNewOptions());
         }

         needsAssign = true;
         follow(0);
      }

      function spawnRipple(event) {
         const inner = event.target.closest?.(PRESSABLE_SELECTOR);

         if (!inner || prefersReducedMotion.matches) {
            return;
         }

         const trackBounds = getTrackBounds();
         const innerBounds = inner.getBoundingClientRect();
         const size = Math.max(innerBounds.width, innerBounds.height) * 2.2;
         const ripple = createSpan("lp-ripple");

         ripple.style.width = ripple.style.height = size + "px";
         ripple.style.left = event.clientX - trackBounds.left - size / 2 + "px";
         ripple.style.top = event.clientY - trackBounds.top - size / 2 + "px";
         event.currentTarget.appendChild(ripple);

         ripple.animate([
            { transform: "scale(0.1)", opacity: 0.9 },
            { transform: "scale(1)", opacity: 0 },
         ], { duration: 360, easing: VIEW }).finished.then(() => ripple.remove(), () => ripple.remove());

         follow(POINTER_FOLLOW_MS);
      }

      function followPressable(event) {
         const isPressable = Boolean(event.target.closest?.(PRESSABLE_SELECTOR));

         if (isPressable) {
            follow(POINTER_FOLLOW_MS);
         }
      }

      function bindTrack(node) {
         if (boundTracks.has(node)) {
            return;
         }

         boundTracks.add(node);

         let pointerFrame = null;
         let pointerX = 0;
         let pointerY = 0;

         node.addEventListener("pointermove", (event) => {
            pointerX = event.clientX;
            pointerY = event.clientY;

            if (pointerFrame) {
               return;
            }

            pointerFrame = requestAnimationFrame(() => {
               pointerFrame = null;

               if (!glow || node !== track) {
                  return;
               }

               const bounds = getTrackBounds();
               const glowX = pointerX - bounds.left - GLOW_HALF_WIDTH;
               const glowY = pointerY - bounds.top - GLOW_HALF_HEIGHT;

               glow.style.transform = `translate(${glowX}px, ${glowY}px)`;
            });
         }, { passive: true });

         node.addEventListener("pointerenter", invalidateTrackBounds, { passive: true });
         node.addEventListener("pointerleave", invalidateTrackBounds, { passive: true });
         node.addEventListener("pointerover", followPressable, { passive: true });
         node.addEventListener("pointerout", followPressable, { passive: true });
         node.addEventListener("pointerdown", spawnRipple, { passive: true });
         node.addEventListener("pointerup", followPressable, { passive: true });
      }

      function attach() {
         const nextListbox = document.querySelector(LISTBOX);
         const isSameListbox = nextListbox === listbox && track?.isConnected;

         if (isSameListbox || !nextListbox) {
            return;
         }

         listboxObserver.disconnect();
         resizeObserver.disconnect();
         invalidateTrackBounds();

         listbox = nextListbox;
         track = document.querySelector(TRACK);
         knownOptions = new WeakSet();
         collectNewOptions();

         glow = createSpan("lp-glow");
         blobs = [createBlob("lp-blob"), createBlob("lp-blob is-sub")];
         track.querySelectorAll(":scope > .lp-blob, :scope > .lp-rim, :scope > .lp-glow").forEach((stale) => stale.remove());
         track.append(createRim(), glow);
         blobs.forEach((blob) => track.appendChild(blob.element));

         bindTrack(track);
         listboxObserver.observe(listbox, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-checked"] });
         resizeObserver.observe(track);
         assignTargets();
         updateBlobDim();
      }

      let rescanTimer = null;

      function scheduleAttach() {
         const isAttached = listbox?.isConnected && track?.isConnected;

         if (isAttached || rescanTimer) {
            return;
         }

         rescanTimer = setTimeout(() => {
            rescanTimer = null;
            attach();
         }, RESCAN_DEBOUNCE_MS);
      }

      let lastCoverColors = "";

      function relativeLuminance([red, green, blue]) {
         const [linearRed, linearGreen, linearBlue] = [red, green, blue].map((channel) => {
            const value = channel / 255;

            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
         });

         return 0.2126 * linearRed + 0.7152 * linearGreen + 0.0722 * linearBlue;
      }

      function parseColor(value) {
         const hexMatch = value.match(/^#([0-9a-f]{6})$/i);

         if (hexMatch) {
            const packed = parseInt(hexMatch[1], 16);

            return [packed >> 16, (packed >> 8) & 255, packed & 255];
         }

         return value.match(/\d+(\.\d+)?/g)?.slice(0, 3).map(Number);
      }

      function dimFor(colors) {
         for (let dim = 0; dim < MAX_DIM; dim += DIM_STEP) {
            const keep = 1 - dim;
            const brightest = Math.max(...colors.map((color) => relativeLuminance(color.map((channel) => channel * keep))));

            if (brightest <= MAX_BLOB_LUMINANCE) {
               return dim;
            }
         }

         return MAX_DIM;
      }

      function liftFor(colors) {
         for (let lift = 0; lift < MAX_LIFT; lift += DIM_STEP) {
            const brightest = Math.max(...colors.map((color) => relativeLuminance(color.map((channel) => channel + (255 - channel) * lift))));

            if (brightest >= MIN_BLOB_LUMINANCE) {
               return lift;
            }
         }

         return MAX_LIFT;
      }

      function updateBlobDim() {
         if (!track?.isConnected) {
            return;
         }

         const rootStyle = document.documentElement.style;
         const coverColors = [1, 2, 3, 4].map((index) => rootStyle.getPropertyValue(`--liq-${index}`).trim());
         const colorKey = coverColors.join("|");

         if (colorKey === lastCoverColors && track.style.getPropertyValue("--lp-dim")) {
            return;
         }

         lastCoverColors = colorKey;

         const parsedColors = coverColors
            .map(parseColor)
            .filter((channels) => channels?.length === 3);

         if (parsedColors.length === 0) {
            return;
         }

         track.style.setProperty("--lp-dim", Math.round(dimFor(parsedColors) * 100) + "%");
         track.style.setProperty("--lp-lift", Math.round(liftFor(parsedColors) * 100) + "%");
      }

      function syncPaused() {
         document.documentElement.toggleAttribute("data-lp-paused", document.hidden);
      }

      function start() {
         const sidebar = document.querySelector("#Desktop_LeftSidebar_Id");

         new MutationObserver(scheduleAttach).observe(sidebar, { childList: true, subtree: true });
         core.onRootAttributes((records) => {
            const hasStyleChange = records.some((record) => record.attributeName === "style");

            if (hasStyleChange) {
               updateBlobDim();
            }
         });
         document.addEventListener("visibilitychange", syncPaused);
         window.addEventListener("resize", invalidateTrackBounds, { passive: true });
         document.addEventListener("scroll", invalidateTrackBounds, { capture: true, passive: true });
         syncPaused();
         attach();
      }

      core.whenReady("libraryPicker", () => Boolean(document.querySelector("#Desktop_LeftSidebar_Id")), start);
   }

   function liquidGlass(core) {
      const FLOW_FPS = 5;
      const BLOB_CYCLES_S = [46, 61, 79, 97];
      const CARD_ENTRY_ENABLED = false;
      const ENTER_STAGGER_MS = 30;
      const ENTER_MAX_DELAY_MS = 120;
      const ENTER_SETTLE_MS = 300 + ENTER_MAX_DELAY_MS + 60;
      const GLOW_FALLBACK = "var(--liq-2, #8a6cff)";
      const CARD_SELECTOR = "[data-encore-id='card']";
      const SHORTCUT_SELECTOR = ".view-homeShortcutsGrid-shortcut";
      const REACTIVE_SELECTOR = `${CARD_SELECTOR}, ${SHORTCUT_SELECTOR}`;
      const PANEL_SELECTOR = ":is(#main-view, #Desktop_LeftSidebar_Id, .Root__right-sidebar-peek)";
      const PLAYER_BAR_SELECTOR = "aside[data-testid='now-playing-bar']";
      const LIBRARY = ":root #main #Desktop_LeftSidebar_Id .YourLibraryX";
      const LIBRARY_DOCK = `${LIBRARY} > div:first-child`;
      const CHIP_ROW = `${LIBRARY_DOCK} > div:has([aria-label='Filter options'])`;
      const CHIP_TRACK = `${CHIP_ROW} > div`;
      const CHIP = `${CHIP_TRACK} [data-encore-id='chip']`;
      const SEARCH_ROW = `${LIBRARY} [data-overlayscrollbars-viewport] div:has(> div > [role='search'])`;
      const EASE_PRESS = "linear(0, 0.003 1.1%, 0.027 3.4%, 0.091 6.7%, 0.445 20.2%, 0.55 24.7%, 0.619 28.1%, 0.732 34.8%, 0.827 42.7%, 0.904 52.8%, 0.951 64%, 0.981 78.7%, 1)";
      const EASE_RELEASE = "linear(0, 0.023 3.2%, 0.101 7.1%, 0.198 10.7%, 0.533 21.7%, 0.712 28.8%, 0.837 35.5%, 0.923 42.2%, 0.984 50.5%, 1.015 60.7%, 1.02 72.2%, 1)";
      const EASE_HOVER = "linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1)";
      const EASE_MENU = "linear(0, 0.018 3.7%, 0.071 7.8%, 0.154 12.4%, 0.435 25.7%, 0.574 33%, 0.703 41.3%, 0.806 50%, 0.884 59.6%, 0.941 70.6%, 0.976 83.5%, 1)";
      const EASE_DIALOG = "linear(0, 0.023 3.7%, 0.086 7.7%, 0.171 11.7%, 0.461 24.1%, 0.619 32.1%, 0.729 39.1%, 0.815 46.5%, 0.895 56.5%, 0.948 67.9%, 0.979 81.6%, 1)";
      const EASE_CROSSFADE = "linear(0, 0.02 2.9%, 0.082 6.3%, 0.158 9.5%, 0.453 20.6%, 0.616 28%, 0.735 35.1%, 0.824 42.5%, 0.9 52.3%, 0.951 64.2%, 0.981 79%, 1)";
      const PRESS = `90ms ${EASE_PRESS}`;
      const RELEASE = `250ms ${EASE_RELEASE}`;
      const HOVER = `220ms ${EASE_HOVER}`;
      const MENU = `220ms ${EASE_MENU}`;
      const DIALOG = `300ms ${EASE_DIALOG}`;
      const XFADE = `380ms ${EASE_CROSSFADE}`;
      const XFADE_LIQ_ALL = `--liq-1 ${XFADE}, --liq-2 ${XFADE}, --liq-3 ${XFADE}, --liq-4 ${XFADE}`;
      const XFADE_LIQ_23 = `--liq-2 ${XFADE}, --liq-3 ${XFADE}`;
      const XFADE_LIQ_123 = `--liq-1 ${XFADE}, --liq-2 ${XFADE}, --liq-3 ${XFADE}`;
      const TIERS_CLASS = "sm-glass-tiers";
      const RECEDE_CLASS = "sm-glass-recede";
      const FLAT_CLASS = "sm-flat-glass";
      const FLAT_GLASS_ENABLED = true;
      const HOME_CHIPS_CLASS = "sm-home-chips";
      const NPV_CARDS_CLASS = "sm-npv-cards";
      const NPV_PANEL_ID = "Desktop_PanelContainer_Id";
      const NPV_LABEL = "Now playing view";
      const EASE_TOGGLE = "linear(0, 0.023 3.4%, 0.099 7.6%, 0.192 11.4%, 0.499 22.8%, 0.67 30.4%, 0.786 37.1%, 0.875 44.3%, 0.946 53.6%, 0.987 64.6%, 1.004 78.1%, 1)";
      const TOGGLE = `240ms ${EASE_TOGGLE}`;
      const LARGE_GLASS = ":root.sm-glass-tiers #main :is(#Desktop_LeftSidebar_Id, .Root__right-sidebar-peek)";
      const BAR_GLASS = ":root.sm-glass-tiers #main aside[data-testid='now-playing-bar']";
      const DIALOG_GLASS = ":root.sm-glass-tiers .Root div:has(> [role='dialog'][aria-modal='true']) > [role='dialog']";
      const RIM_MASK = "linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)";

      const flow = buildFlow();
      const style = document.createElement("style");
      style.id = "liquid-glass";
      style.textContent = `
         #liquid-glass-flow {
            position: absolute;
            inset: 0;
            z-index: -1;
            overflow: hidden;
            pointer-events: none;
            contain: strict;
         }

         #liquid-glass-flow .blob {
            position: absolute;
            width: 78vmax;
            height: 78vmax;
            border-radius: 50%;
            opacity: 0.5;
            will-change: transform;
            transition: ${XFADE_LIQ_ALL};
         }

         #liquid-glass-flow .blob.one {
            top: -30vmax;
            left: -22vmax;
            background: radial-gradient(circle, var(--liq-1) 0%, color-mix(in srgb, var(--liq-1) 35%, transparent) 38%, transparent 66%);
            animation: liquid-glass-drift-one ${BLOB_CYCLES_S[0]}s steps(${BLOB_CYCLES_S[0] * FLOW_FPS}) infinite alternate;
         }

         #liquid-glass-flow .blob.two {
            top: -24vmax;
            right: -26vmax;
            background: radial-gradient(circle, var(--liq-2) 0%, color-mix(in srgb, var(--liq-2) 35%, transparent) 38%, transparent 66%);
            animation: liquid-glass-drift-two ${BLOB_CYCLES_S[1]}s steps(${BLOB_CYCLES_S[1] * FLOW_FPS}) infinite alternate;
         }

         #liquid-glass-flow .blob.three {
            bottom: -34vmax;
            left: 12vmax;
            background: radial-gradient(circle, var(--liq-3) 0%, color-mix(in srgb, var(--liq-3) 35%, transparent) 38%, transparent 66%);
            animation: liquid-glass-drift-three ${BLOB_CYCLES_S[2]}s steps(${BLOB_CYCLES_S[2] * FLOW_FPS}) infinite alternate;
         }

         #liquid-glass-flow .blob.four {
            bottom: -30vmax;
            right: -18vmax;
            opacity: 0.42;
            background: radial-gradient(circle, var(--liq-4) 0%, color-mix(in srgb, var(--liq-4) 35%, transparent) 38%, transparent 66%);
            animation: liquid-glass-drift-four ${BLOB_CYCLES_S[3]}s steps(${BLOB_CYCLES_S[3] * FLOW_FPS}) infinite alternate;
         }

         #liquid-glass-flow .veil {
            position: absolute;
            inset: 0;
            background:
               radial-gradient(120% 90% at 50% 40%, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.42) 100%),
               linear-gradient(rgba(8, 6, 10, 0.18), rgba(8, 6, 10, 0.32));
         }

         @keyframes liquid-glass-drift-one {
            0% { transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
            35% { transform: translate3d(18vw, 14vh, 0) scale(1.12) rotate(40deg); }
            70% { transform: translate3d(6vw, 32vh, 0) scale(0.92) rotate(95deg); }
            100% { transform: translate3d(26vw, 8vh, 0) scale(1.06) rotate(150deg); }
         }

         @keyframes liquid-glass-drift-two {
            0% { transform: translate3d(0, 0, 0) scale(1.05); }
            40% { transform: translate3d(-24vw, 22vh, 0) scale(0.9); }
            75% { transform: translate3d(-10vw, 40vh, 0) scale(1.15); }
            100% { transform: translate3d(-30vw, 12vh, 0) scale(1); }
         }

         @keyframes liquid-glass-drift-three {
            0% { transform: translate3d(0, 0, 0) scale(0.95); }
            30% { transform: translate3d(22vw, -18vh, 0) scale(1.1); }
            65% { transform: translate3d(-8vw, -30vh, 0) scale(1); }
            100% { transform: translate3d(14vw, -10vh, 0) scale(1.18); }
         }

         @keyframes liquid-glass-drift-four {
            0% { transform: translate3d(0, 0, 0) scale(1); }
            50% { transform: translate3d(-28vw, -24vh, 0) scale(1.2); }
            100% { transform: translate3d(-12vw, -6vh, 0) scale(0.9); }
         }

         :root.liquid-glass-hidden #liquid-glass-flow .blob {
            animation-play-state: paused;
         }

         :root #main ${PANEL_SELECTOR} {
            background-color: rgba(var(--spice-rgb-main), 0.26) !important;
            background-image:
               linear-gradient(165deg, rgba(255, 255, 255, 0.085) 0%, rgba(255, 255, 255, 0.02) 34%, rgba(255, 255, 255, 0) 62%, rgba(var(--ambience-rgb-accent-2, 255, 255, 255), 0.05) 100%) !important;
            border-radius: 20px !important;
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.17),
               inset 0 0 0 1px rgba(255, 255, 255, 0.055),
               inset 0 -1px 0 rgba(0, 0, 0, 0.22),
               0 30px 60px -34px rgba(0, 0, 0, 0.7) !important;
         }

         :root #main ${PLAYER_BAR_SELECTOR} {
            background-color: rgba(var(--spice-rgb-sidebar), 0.3) !important;
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.18),
               inset 0 0 0 1px rgba(255, 255, 255, 0.06),
               0 -18px 50px -30px color-mix(in srgb, var(--liq-2, #000) 60%, transparent) !important;
         }

         :root #main #main-view ${CARD_SELECTOR} {
            border-radius: 20px !important;
            transition:
               transform ${RELEASE},
               background-color ${HOVER},
               box-shadow ${HOVER},
               opacity ${HOVER} !important;
         }

         :root #main #main-view ${CARD_SELECTOR}:hover {
            transform: translateY(-5px);
            transition:
               transform ${HOVER},
               background-color ${HOVER},
               box-shadow ${HOVER},
               opacity ${HOVER} !important;
            background-color: rgba(255, 255, 255, 0.045) !important;
            background-image:
               radial-gradient(260px circle at var(--glass-x, 50%) var(--glass-y, 0%), rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0) 62%),
               linear-gradient(165deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0.015) 55%, color-mix(in srgb, var(--glass-glow, ${GLOW_FALLBACK}) 14%, transparent)) !important;
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.2),
               inset 0 0 0 1px rgba(255, 255, 255, 0.07),
               0 22px 44px -22px color-mix(in srgb, var(--glass-glow, ${GLOW_FALLBACK}) 75%, transparent) !important;
         }

         :root #main #main-view [role="grid"]:has(${CARD_SELECTOR}) {
            content-visibility: visible !important;
         }

         :root #main #main-view div:has(> div > [role="grid"]) {
            padding-top: 18px !important;
            padding-bottom: 44px !important;
            margin-top: -18px !important;
            margin-bottom: -44px !important;
         }

         :root #main #main-view ${CARD_SELECTOR}:active {
            transform: translateY(-5px) scale(0.985);
            transition:
               transform ${PRESS},
               background-color ${PRESS},
               box-shadow ${PRESS},
               opacity ${PRESS} !important;
         }

         :root #main #main-view ${CARD_SELECTOR} .main-cardImage-imageWrapper {
            position: relative;
            overflow: hidden;
            border-radius: 14px !important;
            transition: box-shadow ${HOVER};
         }

         :root #main #main-view ${CARD_SELECTOR}:hover .main-cardImage-imageWrapper {
            box-shadow: 0 16px 34px -14px color-mix(in srgb, var(--card-color, ${GLOW_FALLBACK}) 85%, transparent) !important;
         }

         :root #main #main-view ${CARD_SELECTOR} .main-cardImage-image {
            transition: transform ${RELEASE}, filter ${HOVER} !important;
         }

         :root #main #main-view ${CARD_SELECTOR}:hover .main-cardImage-image {
            transform: scale(1.055);
            filter: saturate(1.12) contrast(1.03);
            transition: transform ${HOVER}, filter ${HOVER} !important;
         }

         :root #main #main-view ${CARD_SELECTOR} .main-cardImage-imageWrapper::after {
            content: "";
            position: absolute;
            inset: 0;
            z-index: 1;
            pointer-events: none;
            border-radius: inherit;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), inset 0 0 0 1px rgba(255, 255, 255, 0.06);
            background: linear-gradient(115deg, transparent 30%, rgba(255, 255, 255, 0.28) 46%, rgba(255, 255, 255, 0.06) 54%, transparent 66%) 160% 0 / 260% 100% no-repeat;
            transition: background-position 0s;
         }

         :root #main #main-view ${CARD_SELECTOR}:hover .main-cardImage-imageWrapper::after {
            background-position: -60% 0;
            transition: background-position 280ms ${EASE_HOVER};
         }

         :root #main #main-view ${SHORTCUT_SELECTOR} {
            overflow: hidden;
            border-radius: 14px !important;
            background-color: rgba(255, 255, 255, 0.055) !important;
            background-image:
               radial-gradient(220px circle at var(--glass-x, 30%) var(--glass-y, 0%), rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0) 65%),
               linear-gradient(120deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0.02) 60%) !important;
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.16),
               inset 0 0 0 1px rgba(255, 255, 255, 0.05),
               0 10px 24px -18px rgba(0, 0, 0, 0.8) !important;
            transition:
               transform ${RELEASE},
               background-color ${HOVER},
               box-shadow ${HOVER},
               opacity ${HOVER} !important;
         }

         :root #main #main-view ${SHORTCUT_SELECTOR}:hover {
            transform: translateY(-3px) scale(1.012);
            transition:
               transform ${HOVER},
               background-color ${HOVER},
               box-shadow ${HOVER},
               opacity ${HOVER} !important;
            background-color: rgba(255, 255, 255, 0.1) !important;
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.24),
               inset 0 0 0 1px rgba(255, 255, 255, 0.08),
               0 18px 36px -18px color-mix(in srgb, var(--glass-glow, ${GLOW_FALLBACK}) 80%, transparent) !important;
         }

         :root #main #main-view ${SHORTCUT_SELECTOR}:active {
            transform: translateY(-3px) scale(0.985);
            transition:
               transform ${PRESS},
               background-color ${PRESS},
               box-shadow ${PRESS},
               opacity ${PRESS} !important;
         }

         :root #main #main-view ${SHORTCUT_SELECTOR} .view-homeShortcutsGrid-image {
            transition: transform ${RELEASE} !important;
         }

         :root #main #main-view ${SHORTCUT_SELECTOR}:hover .view-homeShortcutsGrid-image {
            transform: scale(1.08);
            transition: transform ${HOVER} !important;
         }

         :root #main #main-view ${SHORTCUT_SELECTOR} .view-homeShortcutsGrid-PlayButtonContainer {
            opacity: 0;
            transform: scale(0.6) translateX(6px);
            transition: opacity ${HOVER}, transform ${RELEASE};
         }

         :root #main #main-view ${SHORTCUT_SELECTOR}:is(:hover, :focus-within) .view-homeShortcutsGrid-PlayButtonContainer,
         :root #main #main-view ${SHORTCUT_SELECTOR} .view-homeShortcutsGrid-PlayButtonContainer:has(button[aria-label='Pause']) {
            opacity: 1;
            transform: none;
            transition: opacity ${HOVER}, transform ${HOVER};
         }

         :root #main #main-view [data-encore-id='chip'] > span,
         :root #main #main-view button[data-encore-id='chip'] {
            border-radius: 999px !important;
            background-color: rgba(255, 255, 255, 0.07) !important;
            background-image: linear-gradient(160deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.02)) !important;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16), inset 0 0 0 1px rgba(255, 255, 255, 0.06) !important;
            transition: background-color ${HOVER}, box-shadow ${HOVER}, transform ${RELEASE} !important;
         }

         :root #main #main-view [data-encore-id='chip']:hover > span,
         :root #main #main-view button[data-encore-id='chip']:hover {
            transform: translateY(-1px);
            background-color: rgba(255, 255, 255, 0.12) !important;
            transition: background-color ${HOVER}, box-shadow ${HOVER}, transform ${HOVER} !important;
         }

         :root #main #main-view [role="list"]:has(> * > * > [data-encore-id='chip']) {
            padding: 4px !important;
            margin: -4px !important;
         }

         :root #main #main-view [data-encore-id='chip']:active > span,
         :root #main #main-view button[data-encore-id='chip']:active {
            transform: scale(0.96);
            transition: background-color ${PRESS}, box-shadow ${PRESS}, transform ${PRESS} !important;
         }

         :root #main #main-view [data-encore-id='chip'][aria-checked='true'] > span,
         :root #main #main-view button[data-encore-id='chip'][aria-checked='true'] {
            color: #fff !important;
            background-color: transparent !important;
            background-image:
               linear-gradient(160deg, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0) 55%),
               linear-gradient(110deg, var(--liq-1, #5b4bd8), var(--liq-2, #d84b9c) 55%, var(--liq-3, #3b9be0)) !important;
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.4),
               inset 0 0 0 1px rgba(255, 255, 255, 0.12),
               inset 0 -7px 10px -6px rgba(255, 255, 255, 0.28),
               0 1px 3px color-mix(in srgb, var(--liq-2, #d84b9c) 70%, transparent) !important;
         }

         :root #main #main-view div:has(> [class*='JIrO_Kklclbf_mnPX9Dh']:has([data-encore-id='card'])) {
            overflow: visible !important;
         }

         :root #main #main-view [class*='JIrO_Kklclbf_mnPX9Dh']:has([data-encore-id='card']) {
            padding-bottom: 56px !important;
            margin-bottom: -56px !important;
         }

         :root #main #main-view section[data-testid='component-shelf'] h2[data-encore-id='listRowTitle'] {
            background: linear-gradient(100deg, #fff 0%, #fff 35%, color-mix(in srgb, var(--liq-2, #fff) 45%, #fff) 70%, color-mix(in srgb, var(--liq-3, #fff) 45%, #fff) 100%);
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
            transition: ${XFADE_LIQ_23};
         }

         :root #main #main-view [data-glass-enter="pending"] {
            opacity: 0 !important;
            transform: translateY(16px) scale(0.975) !important;
         }

         :root #main #main-view [data-glass-enter="shown"] {
            transition:
               opacity ${DIALOG} var(--glass-delay, 0ms),
               transform ${DIALOG} var(--glass-delay, 0ms),
               background-color ${HOVER},
               box-shadow ${HOVER} !important;
         }

         :root #main #Desktop_PanelContainer_Id [class*="nL2a9KOrkvOlg4iyuRDL"] {
            position: relative;
            overflow: hidden;
            border-radius: 22px !important;
            background-color: color-mix(in srgb, var(--liq-2, #8a6cff) 16%, rgba(14, 12, 20, 0.34)) !important;
            background-image:
               radial-gradient(320px circle at var(--glass-x, 20%) var(--glass-y, 0%), rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0) 64%),
               linear-gradient(160deg, rgba(255, 255, 255, 0.13) 0%, rgba(255, 255, 255, 0.025) 42%, color-mix(in srgb, var(--liq-3, #fff) 14%, transparent) 100%) !important;
            -webkit-backdrop-filter: blur(28px) saturate(185%);
            backdrop-filter: blur(28px) saturate(185%);
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.28),
               inset 0 0 0 1px rgba(255, 255, 255, 0.08),
               inset 0 -14px 28px -18px color-mix(in srgb, var(--liq-1, #000) 55%, transparent),
               0 20px 40px -24px rgba(0, 0, 0, 0.75) !important;
            transition: transform ${RELEASE}, box-shadow ${HOVER} !important;
         }

         :root #main #Desktop_PanelContainer_Id [class*="nL2a9KOrkvOlg4iyuRDL"]:hover {
            transform: translateY(-3px);
            transition: transform ${HOVER}, box-shadow ${HOVER} !important;
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.34),
               inset 0 0 0 1px rgba(255, 255, 255, 0.11),
               0 26px 48px -22px color-mix(in srgb, var(--liq-2, #8a6cff) 70%, transparent) !important;
         }

         :root #main #Desktop_PanelContainer_Id [data-testid="lyrics-npv-section"] h2 {
            letter-spacing: 0.02em;
            color: rgba(255, 255, 255, 0.92) !important;
         }

         :root #main #Desktop_PanelContainer_Id [data-testid="lyrics-npv-section"] :is(div, span, p):not(:has(*)) {
            color: rgba(255, 255, 255, 0.94) !important;
            text-shadow: 0 2px 18px color-mix(in srgb, var(--liq-2, #000) 55%, transparent);
         }

         :root #main #Desktop_PanelContainer_Id [class*="nL2a9KOrkvOlg4iyuRDL"] h2 {
            text-shadow: 0 1px 14px rgba(0, 0, 0, 0.55);
         }

         :root #main #Desktop_PanelContainer_Id [class*="nL2a9KOrkvOlg4iyuRDL"] img {
            transition: transform ${RELEASE}, filter ${HOVER};
         }

         :root #main #Desktop_PanelContainer_Id [class*="nL2a9KOrkvOlg4iyuRDL"]:hover img {
            transform: scale(1.05);
            filter: saturate(1.15);
            transition: transform ${HOVER}, filter ${HOVER};
         }

         :root #main #Desktop_PanelContainer_Id [class*="nL2a9KOrkvOlg4iyuRDL"]::after {
            content: "";
            position: absolute;
            inset: 0;
            pointer-events: none;
            border-radius: inherit;
            background: linear-gradient(115deg, transparent 32%, rgba(255, 255, 255, 0.2) 48%, transparent 62%) 170% 0 / 260% 100% no-repeat;
            transition: background-position 0s;
         }

         :root #main #Desktop_PanelContainer_Id [class*="nL2a9KOrkvOlg4iyuRDL"]:hover::after {
            background-position: -70% 0;
            transition: background-position 280ms ${EASE_HOVER};
         }

         :root #main #Desktop_PanelContainer_Id [class*="YobB51jI5MqFtV09iBY1"] :is(h1, h2, a, span, p) {
            text-shadow: 0 2px 20px rgba(0, 0, 0, 0.75), 0 0 2px rgba(0, 0, 0, 0.4);
            color: #fff !important;
         }

         :root #main #Desktop_PanelContainer_Id [class*="D7OEPKy5xCQIi_jeGX1p"] {
            position: relative;
            isolation: isolate;
         }

         :root #main #Desktop_PanelContainer_Id [class*="D7OEPKy5xCQIi_jeGX1p"]::before {
            content: "";
            position: absolute;
            z-index: -1;
            left: -24px;
            right: -24px;
            bottom: -40px;
            height: 260px;
            pointer-events: none;
            background: radial-gradient(70% 62% at 32% 72%, color-mix(in srgb, var(--liq-1, #000) 30%, rgba(6, 4, 10, 0.62)) 0%, rgba(6, 4, 10, 0.32) 48%, transparent 100%);
            filter: blur(14px);
         }

         :root #main #Desktop_PanelContainer_Id [class*="D7OEPKy5xCQIi_jeGX1p"] :is(a, span) {
            color: #fff !important;
            text-shadow: 0 2px 16px rgba(0, 0, 0, 0.6);
         }

         ${LIBRARY_DOCK} {
            position: relative;
            z-index: 2;
            margin: 8px 8px 2px;
            padding: 2px 0 12px;
            border-radius: 18px;
            background:
               radial-gradient(140% 120% at 0% 0%, color-mix(in srgb, var(--liq-1, #5b4bd8) 26%, transparent) 0%, transparent 60%),
               radial-gradient(120% 140% at 100% 100%, color-mix(in srgb, var(--liq-3, #3b9be0) 20%, transparent) 0%, transparent 62%),
               linear-gradient(165deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.025) 48%, rgba(255, 255, 255, 0.04));
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.2),
               inset 0 0 0 1px rgba(255, 255, 255, 0.06),
               inset 0 -10px 24px -16px color-mix(in srgb, var(--liq-2, #d84b9c) 60%, transparent),
               0 14px 30px -22px rgba(0, 0, 0, 0.8);
            transition: ${XFADE_LIQ_123};
         }

         ${LIBRARY_DOCK} > header {
            padding-inline: 8px 6px;
         }

         ${LIBRARY_DOCK} > header h1 {
            font-size: 1.0625rem !important;
            letter-spacing: 0.01em;
            background: linear-gradient(100deg, #fff 0%, #fff 45%, color-mix(in srgb, var(--liq-2, #fff) 55%, #fff) 80%, color-mix(in srgb, var(--liq-3, #fff) 55%, #fff) 100%);
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
            transition: ${XFADE_LIQ_23};
         }

         ${LIBRARY_DOCK} > header button[aria-label='Create'] {
            width: 32px !important;
            height: 32px !important;
            border-radius: 50% !important;
            animation: none !important;
            background:
               radial-gradient(80% 80% at 30% 20%, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0) 60%),
               conic-gradient(from 210deg, var(--liq-1, #5b4bd8), var(--liq-2, #d84b9c), var(--liq-3, #3b9be0), var(--liq-4, #5b4bd8), var(--liq-1, #5b4bd8)) !important;
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.45),
               inset 0 0 0 1px rgba(255, 255, 255, 0.14),
               inset 0 -6px 10px -4px rgba(0, 0, 0, 0.35),
               0 8px 20px -8px color-mix(in srgb, var(--liq-2, #d84b9c) 85%, transparent) !important;
            transition: transform ${RELEASE}, box-shadow ${HOVER}, filter ${HOVER}, ${XFADE_LIQ_ALL} !important;
         }

         ${LIBRARY_DOCK} > header button[aria-label='Create'] svg {
            filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35));
            transition: transform ${RELEASE};
         }

         ${LIBRARY_DOCK} > header button[aria-label='Create']:hover {
            transform: scale(1.08);
            filter: saturate(1.25) brightness(1.08);
            transition: transform ${HOVER}, box-shadow ${HOVER}, filter ${HOVER}, ${XFADE_LIQ_ALL} !important;
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.55),
               inset 0 0 0 1px rgba(255, 255, 255, 0.2),
               0 10px 28px -8px color-mix(in srgb, var(--liq-3, #3b9be0) 95%, transparent) !important;
         }

         ${LIBRARY_DOCK} > header button[aria-label='Create']:hover svg {
            transform: rotate(90deg);
            transition: transform ${HOVER};
         }

         ${LIBRARY_DOCK} > header button[aria-label='Create']:active {
            transform: scale(0.92);
            transition: transform ${PRESS}, box-shadow ${PRESS}, filter ${PRESS} !important;
         }

         ${LIBRARY_DOCK} > header button:is([aria-label='Expand Your Library'], [aria-label^='Show less'], [aria-label^='Show more']) {
            max-width: 0;
            min-width: 0 !important;
            padding-inline: 0 !important;
            overflow: hidden;
            opacity: 0;
            transform: scale(0.6);
            transition: max-width ${MENU}, padding ${MENU}, opacity ${MENU}, transform ${MENU};
         }

         ${LIBRARY_DOCK}:is(:hover, :focus-within) > header button:is([aria-label='Expand Your Library'], [aria-label^='Show less'], [aria-label^='Show more']) {
            max-width: 40px;
            padding-inline: 6px !important;
            opacity: 0.7;
            transform: none;
         }

         ${LIBRARY_DOCK} > header button:is([aria-label='Expand Your Library'], [aria-label^='Show less'], [aria-label^='Show more']):hover {
            opacity: 1 !important;
         }

         ${CHIP_ROW} {
            margin-inline: 12px;
         }

         ${CHIP_TRACK} {
            padding: 3px;
            border-radius: 17px;
            background: rgba(0, 0, 0, 0.22);
            box-shadow:
               inset 0 1px 3px rgba(0, 0, 0, 0.45),
               inset 0 -1px 0 rgba(255, 255, 255, 0.07);
         }

         ${CHIP_TRACK} > div:first-child {
            overflow: visible !important;
         }

         ${CHIP_TRACK} > div:first-child > div,
         ${CHIP_TRACK} [aria-label='Filter options'] {
            width: 100% !important;
         }

         ${CHIP_TRACK} [aria-label='Filter options'] {
            display: flex !important;
            flex-wrap: wrap;
            gap: 3px;
         }

         ${CHIP_TRACK} [aria-label='Filter options'] > * {
            flex: 1 1 auto;
            margin: 0 !important;
         }

         ${CHIP_TRACK} [aria-label='Filter options'] :is([data-carousel-item], [data-encore-id='chip'], [class*='legacy-chip__inner']) {
            width: 100%;
            justify-content: center;
            text-align: center;
         }

         ${CHIP_TRACK} > div:not(:first-child) {
            display: none !important;
         }

         ${CHIP} [class*='legacy-chip__inner'] {
            min-block-size: 28px !important;
            padding-inline: 13px !important;
            border-radius: 999px !important;
            animation: none !important;
            -webkit-backdrop-filter: none;
            backdrop-filter: none;
            color: rgba(255, 255, 255, 0.72) !important;
            background: transparent !important;
            box-shadow: none !important;
            transition: color ${HOVER}, background-color ${HOVER}, box-shadow ${HOVER}, transform ${RELEASE} !important;
         }

         ${CHIP} [class*='legacy-chip__inner']::after {
            opacity: 0;
            transition: opacity ${HOVER};
         }

         ${CHIP} [class*='legacy-chip__inner']:hover {
            transform: none;
            filter: none;
            color: #fff !important;
            background: rgba(255, 255, 255, 0.08) !important;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
            transition: color ${HOVER}, background-color ${HOVER}, box-shadow ${HOVER}, transform ${HOVER} !important;
         }

         ${CHIP}[aria-checked='true'] [class*='legacy-chip__inner'] {
            color: #fff !important;
            background:
               linear-gradient(160deg, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0) 55%),
               linear-gradient(110deg, var(--liq-1, #5b4bd8), var(--liq-2, #d84b9c) 55%, var(--liq-3, #3b9be0)) !important;
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.42),
               inset 0 0 0 1px rgba(255, 255, 255, 0.12),
               0 6px 16px -6px color-mix(in srgb, var(--liq-2, #d84b9c) 85%, transparent) !important;
            text-shadow: 0 1px 6px rgba(0, 0, 0, 0.3);
         }

         ${CHIP}[aria-checked='true'] [class*='legacy-chip__inner']::after {
            opacity: 1;
         }

         ${CHIP} [class*='legacy-chip__inner']:active {
            transform: scale(0.94);
            transition: color ${PRESS}, background-color ${PRESS}, box-shadow ${PRESS}, transform ${PRESS} !important;
         }

         ${SEARCH_ROW} {
            position: sticky;
            top: 0;
            z-index: 3;
            padding: 4px 0 8px;
            margin-bottom: 2px;
         }

         ${LIBRARY} [data-overlayscrollbars-viewport]:has([role='search']) {
            -webkit-mask-image: linear-gradient(transparent 0, #000 10px);
            mask-image: linear-gradient(transparent 0, #000 10px);
         }

         ${SEARCH_ROW} > div {
            height: 36px;
            padding-inline: 4px 6px;
            border-radius: 999px;
            background:
               linear-gradient(165deg, rgba(255, 255, 255, 0.11), rgba(255, 255, 255, 0.03) 60%),
               color-mix(in srgb, var(--liq-1, #000) 14%, rgba(16, 12, 22, 0.55));
            -webkit-backdrop-filter: blur(22px) saturate(1.8);
            backdrop-filter: blur(22px) saturate(1.8);
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.18),
               inset 0 0 0 1px rgba(255, 255, 255, 0.06),
               0 10px 24px -14px rgba(0, 0, 0, 0.85);
            transition: box-shadow ${HOVER}, background-color ${HOVER}, --liq-1 ${XFADE};
         }

         ${SEARCH_ROW} > div:focus-within {
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.24),
               inset 0 0 0 1px color-mix(in srgb, var(--liq-2, #fff) 55%, transparent),
               0 0 0 3px color-mix(in srgb, var(--liq-2, #fff) 18%, transparent),
               0 10px 26px -12px color-mix(in srgb, var(--liq-2, #000) 70%, transparent);
         }

         ${SEARCH_ROW} [role='search'] input {
            background: transparent !important;
            color: #fff !important;
         }

         ${SEARCH_ROW} :is([role='search'] button, button[aria-controls='sort-and-view-picker']) {
            border-radius: 999px !important;
            color: rgba(255, 255, 255, 0.72) !important;
            transition: color ${HOVER}, background-color ${HOVER}, transform ${RELEASE} !important;
         }

         ${SEARCH_ROW} :is([role='search'] button, button[aria-controls='sort-and-view-picker']):hover {
            color: #fff !important;
            background-color: rgba(255, 255, 255, 0.08) !important;
            transition: color ${HOVER}, background-color ${HOVER}, transform ${HOVER} !important;
         }

         ${SEARCH_ROW} :is([role='search'] button, button[aria-controls='sort-and-view-picker']):active {
            transform: scale(0.94);
            transition: color ${PRESS}, background-color ${PRESS}, transform ${PRESS} !important;
         }

         ${SEARCH_ROW} button[aria-controls='sort-and-view-picker'] {
            padding-inline: 10px 8px !important;
            min-block-size: 28px !important;
         }

         ${SEARCH_ROW} button[aria-controls='sort-and-view-picker'] [data-sortbox-label] {
            font-weight: 400 !important;
            letter-spacing: 0.01em;
         }

         #liquid-glass-flow {
            transition: opacity ${DIALOG};
         }

         ${LARGE_GLASS}::after,
         ${BAR_GLASS}::after {
            content: "";
            position: absolute;
            inset: 0;
            z-index: 5;
            padding: 1px;
            pointer-events: none;
            border-radius: inherit;
            -webkit-mask: ${RIM_MASK};
            mask: ${RIM_MASK};
            transition: opacity ${DIALOG}, ${XFADE_LIQ_23};
         }

         :root.sm-color-flow ${LARGE_GLASS.replace(":root.sm-glass-tiers ", "")}::after,
         :root.sm-color-flow ${BAR_GLASS.replace(":root.sm-glass-tiers ", "")}::after {
            transition: opacity ${DIALOG};
         }

         ${LARGE_GLASS},
         ${BAR_GLASS} {
            position: relative;
         }

         ${LARGE_GLASS}::after {
            background: linear-gradient(158deg,
               rgba(255, 255, 255, 0.42) 0%,
               rgba(255, 255, 255, 0.12) 16%,
               rgba(255, 255, 255, 0.03) 42%,
               rgba(255, 255, 255, 0.02) 70%,
               color-mix(in srgb, var(--liq-2, #fff) 38%, rgba(255, 255, 255, 0.1)) 100%);
         }

         ${BAR_GLASS}::after {
            background: linear-gradient(180deg,
               rgba(255, 255, 255, 0.34) 0%,
               color-mix(in srgb, var(--liq-3, #fff) 22%, rgba(255, 255, 255, 0.06)) 45%,
               rgba(255, 255, 255, 0.02) 100%);
         }

         :root.sm-glass-tiers #main #Desktop_LeftSidebar_Id {
            isolation: isolate;
            box-shadow: 0 34px 70px -38px rgba(0, 0, 0, 0.85), 0 2px 10px -4px rgba(0, 0, 0, 0.35) !important;
         }

         :root.sm-glass-tiers #main #Desktop_LeftSidebar_Id::before {
            content: "";
            position: absolute;
            inset: auto 0 0 0;
            height: 38%;
            z-index: -1;
            pointer-events: none;
            background: radial-gradient(130% 80% at 30% 100%, color-mix(in srgb, var(--liq-1, #000) 16%, transparent) 0%, transparent 72%);
            transition: opacity ${DIALOG}, --liq-1 ${XFADE};
         }

         :root.${FLAT_CLASS} #main [data-testid="now-playing-bar"],
         :root.${FLAT_CLASS} #main #Desktop_PanelContainer_Id [class*="nL2a9KOrkvOlg4iyuRDL"],
         :root.${FLAT_CLASS} #main #main-view .main-topBar-background,
         :root.${FLAT_CLASS} #main .main-view-container [class*="legacy-button-primary"],
         :root.${FLAT_CLASS} #main .main-view-container .main-entityHeader-headerText > div:last-child,
         :root.${FLAT_CLASS} #main #Desktop_LeftSidebar_Id button[aria-label="Create"],
         :root.${FLAT_CLASS} ${SEARCH_ROW} > div {
            -webkit-backdrop-filter: none !important;
            backdrop-filter: none !important;
         }

         :root.${FLAT_CLASS} #main [data-testid="now-playing-bar"] {
            background: linear-gradient(to bottom,
               color-mix(in srgb, var(--liq-2, #8a6cff) 8%, rgba(var(--spice-rgb-main), 0.8)),
               rgba(var(--spice-rgb-main), 0.9)) !important;
         }

         :root.${FLAT_CLASS} #main #Desktop_PanelContainer_Id [class*="nL2a9KOrkvOlg4iyuRDL"] {
            background-color: color-mix(in srgb, var(--liq-2, #8a6cff) 18%, rgba(14, 12, 20, 0.62)) !important;
         }

         :root.${FLAT_CLASS} #main #main-view .main-topBar-background {
            background-color: rgba(var(--spice-rgb-main), 0.8) !important;
         }

         :root.${FLAT_CLASS} #main .main-view-container [class*="legacy-button-primary"],
         :root.${FLAT_CLASS} #main #Desktop_LeftSidebar_Id button[aria-label="Create"] {
            background-color: color-mix(in srgb, var(--liq-2, #8a6cff) 30%, rgba(24, 20, 32, 0.72)) !important;
         }

         ${BAR_GLASS} {
            box-shadow:
               inset 0 0 0 1px rgba(255, 255, 255, 0.04),
               0 -14px 40px -26px color-mix(in srgb, var(--liq-2, #000) 55%, transparent),
               0 18px 40px -20px rgba(0, 0, 0, 0.7) !important;
         }

         ${DIALOG_GLASS} {
            border-radius: 22px !important;
            background-color: color-mix(in srgb, var(--liq-4, #1a181a) 10%, rgba(22, 20, 24, 0.8)) !important;
            background-image: linear-gradient(165deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.015) 40%, transparent 70%) !important;
            -webkit-backdrop-filter: blur(30px) saturate(1.7);
            backdrop-filter: blur(30px) saturate(1.7);
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.22),
               inset 0 0 0 1px rgba(255, 255, 255, 0.07),
               0 40px 90px -30px rgba(0, 0, 0, 0.8) !important;
         }

         :root.${RECEDE_CLASS}.sm-ambient-rest #liquid-glass-flow {
            opacity: 0.55;
         }

         :root.${RECEDE_CLASS}.sm-ambient-rest #main :is(#Desktop_LeftSidebar_Id, .Root__right-sidebar-peek, aside[data-testid='now-playing-bar'])::after,
         :root.${RECEDE_CLASS}.sm-ambient-rest #main #Desktop_LeftSidebar_Id::before {
            opacity: 0.4;
         }

         @media (prefers-reduced-transparency: reduce) {
            #liquid-glass-flow {
               display: none;
            }

            :root #main ${PANEL_SELECTOR},
            :root #main ${PLAYER_BAR_SELECTOR} {
               background-color: rgba(var(--spice-rgb-main), 0.94) !important;
            }

            :root #context-menu > [data-encore-id='menu'],
            ${DIALOG_GLASS} {
               background-color: rgba(28, 26, 30, 0.97) !important;
               -webkit-backdrop-filter: none !important;
               backdrop-filter: none !important;
            }
         }

         @media (prefers-reduced-motion: reduce) {
            #liquid-glass-flow .blob {
               animation: none !important;
            }

            :root #main #main-view [data-glass-enter="pending"] {
               opacity: 1 !important;
               transform: none !important;
            }

            :root #main :is(#main-view, #Desktop_PanelContainer_Id, #Desktop_LeftSidebar_Id) :is(${CARD_SELECTOR}, ${SHORTCUT_SELECTOR}, [data-encore-id='chip'], [class*="nL2a9KOrkvOlg4iyuRDL"], button, [class*='legacy-chip__inner'], img, .view-homeShortcutsGrid-PlayButtonContainer, .main-cardImage-image, .main-cardImage-imageWrapper) {
               transition-duration: 120ms !important;
               transition-delay: 0ms !important;
               transition-timing-function: ease !important;
            }

            :root #main :is(#main-view, #Desktop_PanelContainer_Id, #Desktop_LeftSidebar_Id) :is(:hover, :active):is(${CARD_SELECTOR}, ${SHORTCUT_SELECTOR}, button, [class*='legacy-chip__inner'], [class*="nL2a9KOrkvOlg4iyuRDL"]),
            :root #main :is(#main-view, #Desktop_PanelContainer_Id) :is(:hover, :active) :is(.main-cardImage-image, .view-homeShortcutsGrid-image, img) {
               transform: none !important;
            }
         }
      `;
      document.head.appendChild(style);

      const homeChipsStyle = document.createElement("style");
      homeChipsStyle.id = "liquid-glass-home-chips";
      homeChipsStyle.textContent = buildHomeChipsStyle();
      document.head.appendChild(homeChipsStyle);

      const nowPlayingCardsStyle = document.createElement("style");
      nowPlayingCardsStyle.id = "liquid-glass-npv-cards";
      nowPlayingCardsStyle.textContent = buildNowPlayingCardsStyle();
      document.head.appendChild(nowPlayingCardsStyle);

      function buildNowPlayingCardsStyle() {
         const PANEL = `:root.${NPV_CARDS_CLASS} #main #${NPV_PANEL_ID}`;
         const CARD = `${PANEL} [data-npv-card][data-npv-card]`;
         const PLATE_CARD = `${PANEL} [data-npv-card]:not([data-npv-card="lyrics"])[data-npv-card]`;
         const ARTIST = `${PANEL} [data-npv-card="artist"][data-npv-card]`;
         const HERO = `${ARTIST} [data-npv-part="hero"]`;
         const BODY = `${ARTIST} [data-npv-part="body"]`;
         const META = `${ARTIST} [data-npv-part="meta"]`;
         const HEAD = `${CARD} [data-npv-part="head"]`;
         const ROW = `${CARD} [data-encore-id="listRow"]`;
         const LINKED_ROW = `${ROW}[class*="--interactive"]`;
         const FOLLOW = `${CARD} [data-npv-following]`;
         const PLATE = "color-mix(in srgb, var(--liq-1, #5b4bd8) 9%, rgba(16, 14, 22, 0.62))";
         const PLATE_HOVER = "color-mix(in srgb, var(--liq-1, #5b4bd8) 12%, rgba(30, 28, 38, 0.64))";
         const PLATE_RIM = "inset 0 1px 0 rgba(255, 255, 255, 0.09), inset 0 0 0 1px rgba(255, 255, 255, 0.05)";
         const PLATE_DROP = "0 12px 28px -20px rgba(0, 0, 0, 0.6)";
         const FOCUS_RING = "color-mix(in srgb, var(--liq-1, #8a6cff) 45%, #fff)";

         return `
            @keyframes sm-npv-shade {
               from {
                  opacity: 0;
               }

               to {
                  opacity: 1;
               }
            }

            :root.${NPV_CARDS_CLASS} #main #${NPV_PANEL_ID} [data-npv-root] {
               timeline-scope: --sm-npv-scroll;
            }

            :root.${NPV_CARDS_CLASS} #main #${NPV_PANEL_ID} [data-npv-root] [data-overlayscrollbars-viewport] {
               scroll-timeline: --sm-npv-scroll block;
            }

            :root.${NPV_CARDS_CLASS} #main #${NPV_PANEL_ID} [data-npv-root] > div:first-child::before {
               content: "";
               position: absolute;
               inset: 0 0 -24px;
               z-index: -1;
               pointer-events: none;
               border-radius: 20px 20px 0 0;
               background: linear-gradient(to bottom, rgba(14, 12, 20, 0.94), rgba(14, 12, 20, 0.8) 62%, rgba(14, 12, 20, 0));
               opacity: 0;
               animation: sm-npv-shade linear both;
               animation-timeline: --sm-npv-scroll;
               animation-range: 0 48px;
            }

            ${CARD} {
               border-radius: 20px !important;
               transform: none;
            }

            ${PLATE_CARD} {
               position: relative;
               overflow: hidden;
               background-color: ${PLATE} !important;
               background-image: none !important;
               -webkit-backdrop-filter: none !important;
               backdrop-filter: none !important;
               box-shadow: ${PLATE_RIM}, ${PLATE_DROP} !important;
               transition: scale ${RELEASE} !important;
            }

            ${PLATE_CARD}::after {
               display: none !important;
            }

            ${ARTIST}:hover {
               background-color: ${PLATE_HOVER} !important;
               box-shadow: ${PLATE_RIM}, ${PLATE_DROP} !important;
               transform: none !important;
            }

            ${ARTIST}:active:not(:has(:is(button, a):active)) {
               scale: 0.985;
               transition: scale ${PRESS} !important;
            }

            ${ARTIST} > div:first-child {
               border-radius: inherit !important;
               background-color: transparent !important;
            }

            ${HERO} {
               position: relative;
               padding: 8px 8px 0 !important;
               -webkit-mask-image: linear-gradient(to bottom, #000 68%, transparent);
               mask-image: linear-gradient(to bottom, #000 68%, transparent);
            }

            ${HERO} h2 {
               display: flex;
            }

            ${HERO} h2 button {
               block-size: 24px;
               padding: 0 10px !important;
               border-radius: 12px !important;
               font-size: 12px !important;
               font-weight: 700 !important;
               line-height: 24px !important;
               letter-spacing: 0.01em;
               color: #fff !important;
               text-shadow: none !important;
               background-color: rgba(0, 0, 0, 0.38) !important;
               -webkit-backdrop-filter: blur(14px) saturate(1.4);
               backdrop-filter: blur(14px) saturate(1.4);
               box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18), inset 0 0 0 1px rgba(255, 255, 255, 0.12);
            }

            ${ARTIST}[data-npv-hero="none"] [data-npv-part="hero"] {
               block-size: auto !important;
               min-block-size: 0 !important;
               aspect-ratio: auto !important;
               padding: 16px 16px 16px !important;
               -webkit-mask-image: none;
               mask-image: none;
            }

            ${ARTIST}[data-npv-hero="none"] [data-npv-part="hero"] h2 button {
               padding: 0 !important;
               font-size: 15px !important;
               background-color: transparent !important;
               -webkit-backdrop-filter: none;
               backdrop-filter: none;
               box-shadow: none;
            }

            ${BODY} {
               display: grid !important;
               grid-template-columns: minmax(0, 1fr) auto;
               column-gap: 12px;
               row-gap: 2px;
               align-items: center;
               margin-top: -8px;
               padding: 0 16px 16px !important;
               background-color: transparent !important;
            }

            ${BODY} > a {
               grid-column: 1;
               grid-row: 1;
               min-inline-size: 0;
            }

            ${BODY} > a > span:first-child {
               overflow: hidden;
               font-size: 18px !important;
               font-weight: 700 !important;
               letter-spacing: -0.01em;
               white-space: nowrap;
               text-overflow: ellipsis;
            }

            ${META} {
               display: contents !important;
            }

            ${META} > :not(button) {
               grid-column: 1;
               grid-row: 2;
               font-size: 13px !important;
               font-weight: 500 !important;
               color: rgba(255, 255, 255, 0.64) !important;
            }

            ${META} > button {
               grid-column: 2;
               grid-row: 1 / span 2;
            }

            ${BODY} > [data-npv-part="bio"] {
               display: -webkit-box !important;
               grid-column: 1 / -1;
               grid-row: 3;
               margin-top: 12px;
               overflow: hidden;
               -webkit-box-orient: vertical;
               -webkit-line-clamp: 3;
               font-size: 14px !important;
               line-height: 1.45 !important;
               color: rgba(255, 255, 255, 0.76) !important;
            }

            ${CARD} :is(h1, h2, a, span, p) {
               text-shadow: none !important;
            }

            ${PLATE_CARD} > div:has(> [data-npv-part="head"]),
            ${PLATE_CARD} [data-npv-part="stack"] {
               row-gap: 12px !important;
            }

            ${HEAD} {
               min-block-size: 32px;
               align-items: center;
            }

            ${HEAD} h2,
            ${HEAD} h2 * {
               font-size: 15px !important;
               font-weight: 700 !important;
               letter-spacing: -0.01em;
               color: #fff !important;
            }

            ${HEAD} > button {
               block-size: 28px;
               min-block-size: 28px !important;
               margin-inline-end: -10px;
               padding: 0 10px !important;
               border-radius: 14px !important;
               font-size: 13px !important;
               font-weight: 700 !important;
               color: rgba(255, 255, 255, 0.72) !important;
               background-color: transparent !important;
               transition: none !important;
            }

            ${HEAD} > button > span {
               padding: 0 !important;
               font: inherit !important;
               color: inherit !important;
               background: none !important;
            }

            ${HEAD} > button:hover,
            ${HEAD} > button:hover > span {
               text-decoration: none !important;
            }

            ${HEAD} > button:hover {
               color: #fff !important;
               background-color: rgba(255, 255, 255, 0.08) !important;
            }

            ${HEAD} > button:active {
               background-color: rgba(255, 255, 255, 0.12) !important;
            }

            ${ROW} {
               border-radius: 12px !important;
               transition: scale ${RELEASE} !important;
            }

            ${ROW}:not([class*="--interactive"]) {
               inline-size: auto !important;
               margin-inline: -8px;
               padding-inline: 8px !important;
            }

            ${ROW}::before {
               content: "";
               position: absolute;
               inset: 0 8px auto;
               block-size: 1px;
               pointer-events: none;
               background-color: rgba(255, 255, 255, 0.07);
               transition: opacity ${HOVER};
            }

            ${ROW}:not([data-encore-id="listRow"] + *)::before,
            ${LINKED_ROW}:hover::before,
            ${LINKED_ROW}:hover + [data-encore-id="listRow"]::before {
               opacity: 0;
            }

            ${LINKED_ROW}:hover {
               background-color: rgba(255, 255, 255, 0.07) !important;
            }

            ${LINKED_ROW}:active:not(:has(button:active, a:active)) {
               scale: 0.985;
               transition: scale ${PRESS} !important;
            }

            ${ROW} [class*="list-row__column"] > :first-child,
            ${ROW} [class*="list-row__column"] > :first-child span {
               font-size: 15px !important;
               font-weight: 500 !important;
               color: #fff !important;
            }

            ${ROW} [data-encore-id="listRowSubtitle"],
            ${ROW} [data-encore-id="listRowSubtitle"] :is(span, a):not([data-encore-id="tagIcon"]) {
               font-size: 13px !important;
               color: rgba(255, 255, 255, 0.6) !important;
            }

            ${ROW} [data-encore-id="listRowSubtitle"] a:hover {
               color: #fff !important;
            }

            ${ROW} [class*="list-row__slot"] > svg {
               inline-size: 16px;
               block-size: 16px;
               color: rgba(255, 255, 255, 0.6);
               fill: currentColor;
            }

            ${CARD}[data-npv-card="queue"] [class*="list-row__header-side"] :is(img, [role="button"]),
            ${CARD}[data-npv-card="queue"] [class*="list-row__header-side"] img + *,
            ${CARD}[data-npv-card="queue"] [class*="list-row__header-side"] div:has(> img) {
               border-radius: 4px !important;
            }

            ${CARD}[data-npv-card="queue"] [class*="list-row__header-side"] img {
               outline: 1px solid rgba(255, 255, 255, 0.08);
               outline-offset: -1px;
            }

            ${FOLLOW} {
               min-block-size: 32px;
               padding: 0 14px !important;
               border: 0 !important;
               border-radius: 16px !important;
               font-size: 13px !important;
               font-weight: 700 !important;
               transition: background-color ${TOGGLE}, color ${TOGGLE}, box-shadow ${TOGGLE} !important;
            }

            ${FOLLOW}[data-npv-following="true"],
            ${CARD}:not([data-npv-card="artist"]) [data-npv-following] {
               color: rgba(255, 255, 255, 0.92) !important;
               background-color: rgba(255, 255, 255, 0.1) !important;
               box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12) !important;
            }

            ${CARD}:not([data-npv-card="artist"]) [data-npv-following] {
               min-block-size: 28px;
               border-radius: 14px !important;
            }

            ${CARD}:not([data-npv-card="artist"]) [data-npv-following][data-npv-following="true"] {
               color: rgba(255, 255, 255, 0.72) !important;
               background-color: rgba(255, 255, 255, 0.05) !important;
            }

            ${CARD}:not([data-npv-card="artist"]) [data-npv-following][data-npv-following="false"] {
               box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.24) !important;
            }

            ${FOLLOW}[data-npv-following="true"]:hover,
            ${CARD}:not([data-npv-card="artist"]) [data-npv-following]:hover {
               color: #fff !important;
               background-color: rgba(255, 255, 255, 0.16) !important;
            }

            ${ARTIST} [data-npv-following][data-npv-following="false"] {
               color: rgb(16, 14, 22) !important;
               background-color: color-mix(in srgb, var(--liq-1, #8a6cff) 12%, #fff) !important;
               box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.12), 0 6px 16px -8px color-mix(in srgb, var(--liq-1, #000) 60%, transparent) !important;
            }

            ${ARTIST} [data-npv-following][data-npv-following="false"]:hover {
               background-color: color-mix(in srgb, var(--liq-1, #8a6cff) 5%, #fff) !important;
            }

            ${CARD} :is(a, button, [role="button"], [tabindex="0"]):focus-visible {
               outline: 2px solid ${FOCUS_RING} !important;
               outline-offset: 2px;
               border-radius: 12px;
            }

            ${CARD} [data-encore-id="listRow"]:has(> [role="button"]:focus-visible) {
               box-shadow: 0 0 0 2px ${FOCUS_RING};
            }

            ${CARD} [data-encore-id="listRow"] > [role="button"]:focus-visible {
               outline: none !important;
            }

            ${ARTIST}:has(> div:first-child > [aria-hidden="true"]:focus-visible) {
               box-shadow: ${PLATE_RIM}, 0 0 0 2px ${FOCUS_RING} !important;
            }

            :root.${NPV_CARDS_CLASS}.${RECEDE_CLASS}.sm-ambient-rest #main #${NPV_PANEL_ID} [data-npv-card]:not([data-npv-card="lyrics"])[data-npv-card] {
               box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), inset 0 0 0 1px rgba(255, 255, 255, 0.03) !important;
            }

            :root.${NPV_CARDS_CLASS} #main aside[aria-label="Queue"] [role="row"] [data-encore-id="listRow"],
            :root.${NPV_CARDS_CLASS} #main aside[aria-label="Queue"] li > [data-encore-id="listRow"] {
               border-radius: 12px !important;
               transition: scale ${RELEASE} !important;
            }

            :root.${NPV_CARDS_CLASS} #main aside[aria-label="Queue"] [data-encore-id="listRow"]:hover {
               background-color: rgba(255, 255, 255, 0.07) !important;
            }

            :root.${NPV_CARDS_CLASS} #main aside[aria-label="Queue"] [data-encore-id="listRow"] [class*="list-row__header-side"] :is(img, [role="button"], div:has(> img)) {
               border-radius: 4px !important;
            }

            @media (prefers-reduced-transparency: reduce) {
               ${PLATE_CARD} {
                  background-color: rgba(24, 22, 28, 0.97) !important;
               }

               ${HERO} h2 button {
                  background-color: rgba(0, 0, 0, 0.72) !important;
                  -webkit-backdrop-filter: none;
                  backdrop-filter: none;
               }

               :root.${NPV_CARDS_CLASS} #main #${NPV_PANEL_ID} [data-npv-root] > div:first-child::before {
                  background: rgba(20, 18, 24, 0.97);
               }
            }

            @media (prefers-reduced-motion: reduce) {
               ${CARD},
               ${ROW},
               ${HERO},
               ${HEAD} > button,
               ${FOLLOW} {
                  transition-duration: 120ms !important;
                  transition-timing-function: ease !important;
               }

               ${CARD}:active,
               ${ROW}:active {
                  scale: none !important;
               }
            }
         `;
      }

      function buildHomeChipsStyle() {
         const ROOT = `:root.${HOME_CHIPS_CLASS} #main #main-view`;
         const TRACK = `${ROOT} .contentSpacing > div:has(> [role='list'] [data-encore-id='chip'])`;
         const CHIP = `${TRACK} button[data-encore-id='chip']`;
         const INNER = `${CHIP} > span`;
         const SELECTED_INNER = `${TRACK} button[data-encore-id='chip'][aria-checked='true'] > span`;
         const BAND = `${ROOT} main > div > div:has(> .contentSpacing > div > [role='list'][aria-label='Home Filters']) > div[style*='opacity']:empty`;
         const SUB_CHIP = `${TRACK} [role='list'] > div > [data-carousel-item][class]:not([class='']) > button[data-encore-id='chip']`;
         const IS_BRIGHT = "clamp(0, (l - 0.62) * 1000, 1)";
         const LIT_STOP = (darkFloor, darkCeiling, brightFloor, brightCeiling) => `oklch(from var(--liq-1, #5b4bd8) calc(clamp(${darkFloor}, l, ${darkCeiling}) * (1 - ${IS_BRIGHT}) + clamp(${brightFloor}, l, ${brightCeiling}) * ${IS_BRIGHT}) c h)`;
         const LIT_LABEL = `oklch(from var(--liq-1, #5b4bd8) calc(1 - ${IS_BRIGHT} * 0.86) 0 0)`;

         return `
            @keyframes sm-hc-rise {
               from {
                  opacity: 0;
               }

               to {
                  opacity: 1;
               }
            }

            ${BAND} {
               bottom: -16px !important;
               background-color: transparent !important;
               background-image: linear-gradient(to bottom, rgba(var(--spice-rgb-main), 0.72), rgba(var(--spice-rgb-main), 0.42) 50%, rgba(var(--spice-rgb-main), 0)) !important;
               box-shadow: none !important;
               -webkit-mask-image: none !important;
               mask-image: none !important;
            }

            ${TRACK} {
               isolation: isolate;
               max-inline-size: 100%;
               padding: 4px !important;
               border-radius: 20px !important;
               background: rgba(0, 0, 0, 0.24) !important;
               box-shadow:
                  inset 0 1px 3px rgba(0, 0, 0, 0.45),
                  inset 0 -1px 0 rgba(255, 255, 255, 0.06) !important;
            }

            ${TRACK}::before,
            ${TRACK}::after {
               content: "";
               position: absolute;
               inset: 0;
               z-index: -1;
               border-radius: inherit;
               pointer-events: none;
               opacity: 0;
               animation: sm-hc-rise linear both;
               animation-timeline: --main-view-scroll;
               animation-range: 8px 40px;
            }

            ${TRACK}::before {
               background-color: color-mix(in srgb, color-mix(in srgb, rgb(var(--spice-rgb-main-elevated, 40, 40, 48)) 90%, var(--liq-1, #5b4bd8)) 66%, transparent);
               -webkit-backdrop-filter: blur(20px) saturate(1.7);
               backdrop-filter: blur(20px) saturate(1.7);
               box-shadow:
                  0 12px 28px -12px rgba(0, 0, 0, 0.7),
                  0 2px 6px rgba(0, 0, 0, 0.3),
                  0 10px 24px -14px color-mix(in srgb, var(--liq-1, #5b4bd8) 55%, transparent);
            }

            ${TRACK}::after {
               z-index: 0;
               padding: 1px;
               background: linear-gradient(180deg, rgba(255, 255, 255, 0.42), rgba(255, 255, 255, 0.06) 60%, rgba(255, 255, 255, 0.12));
               -webkit-mask: ${RIM_MASK};
               mask: ${RIM_MASK};
            }

            ${TRACK} [role='list'] > div {
               gap: 4px !important;
            }

            ${CHIP} {
               margin-block: 0 !important;
               outline: none !important;
               background: transparent !important;
               box-shadow: none !important;
               transform: none !important;
            }

            ${INNER} {
               min-block-size: 32px !important;
               border-radius: 16px !important;
               color: rgba(255, 255, 255, 0.74) !important;
               background-color: transparent !important;
               background-image: none !important;
               box-shadow: none !important;
               transition:
                  color ${HOVER},
                  background-color ${HOVER},
                  filter ${HOVER},
                  transform ${RELEASE} !important;
            }

            ${CHIP}[aria-checked='false']:hover > span {
               color: #fff !important;
               background-color: rgba(255, 255, 255, 0.1) !important;
            }

            ${SUB_CHIP} > span {
               color: rgba(255, 255, 255, 0.86) !important;
               background-color: rgba(255, 255, 255, 0.1) !important;
               box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
            }

            ${SELECTED_INNER} {
               color: ${LIT_LABEL} !important;
               background-image:
                  linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0) 58%),
                  linear-gradient(180deg, ${LIT_STOP(0.36, 0.52, 0.8, 0.9)}, ${LIT_STOP(0.28, 0.4, 0.72, 0.82)}) !important;
               box-shadow:
                  inset 0 1px 0 rgba(255, 255, 255, 0.34),
                  inset 0 0 0 1px rgba(255, 255, 255, 0.1),
                  0 2px 8px -2px color-mix(in srgb, var(--liq-1, #5b4bd8) 60%, transparent) !important;
            }

            ${CHIP}[aria-checked='true']:hover > span {
               filter: brightness(1.08);
            }

            ${CHIP}:active > span {
               transform: scale(0.96);
               transition:
                  color ${PRESS},
                  background-color ${PRESS},
                  transform ${PRESS} !important;
            }

            ${CHIP}:focus-visible > span {
               box-shadow:
                  0 0 0 2px rgba(255, 255, 255, 0.9),
                  0 0 12px 2px color-mix(in srgb, var(--liq-2, #fff) 40%, transparent) !important;
            }

            :root.${HOME_CHIPS_CLASS}.sm-ambient-rest #main #main-view .contentSpacing > div:has(> [role='list'] [data-encore-id='chip'])::before {
               box-shadow:
                  0 12px 28px -12px rgba(0, 0, 0, 0.5),
                  0 2px 6px rgba(0, 0, 0, 0.2);
            }

            :root.${HOME_CHIPS_CLASS}.sm-ambient-rest #main #main-view .contentSpacing > div:has(> [role='list'] [data-encore-id='chip'])::after {
               filter: opacity(0.4);
            }

            @media (prefers-reduced-transparency: reduce) {
               ${BAND} {
                  background-image: linear-gradient(to bottom, rgba(var(--spice-rgb-main), 0.96) 80%, rgba(var(--spice-rgb-main), 0)) !important;
               }

               ${TRACK}::before {
                  background-color: rgba(24, 24, 30, 0.97);
                  -webkit-backdrop-filter: none;
                  backdrop-filter: none;
               }
            }

            @media (prefers-reduced-motion: reduce) {
               ${CHIP}:active > span {
                  transform: none;
               }

               ${INNER} {
                  transition-duration: 120ms !important;
               }
            }
         `;
      }

      function buildFlow() {
         const element = document.createElement("div");
         element.id = "liquid-glass-flow";

         ["one", "two", "three", "four"].forEach((name) => {
            const blob = document.createElement("div");
            blob.className = "blob " + name;
            element.appendChild(blob);
         });

         const veil = document.createElement("div");
         veil.className = "veil";
         element.appendChild(veil);

         return element;
      }

      function mountFlow() {
         const topContainer = document.querySelector("#main-view")?.parentElement;

         if (!topContainer) {
            return;
         }

         topContainer.style.position ||= "relative";
         topContainer.style.isolation = "isolate";

         const ambienceLayer = topContainer.querySelector(":scope > #ambience-liquid");
         const expectedPrevious = ambienceLayer ?? null;
         const isMounted = flow.parentElement === topContainer && flow.previousElementSibling === expectedPrevious;

         if (isMounted) {
            return;
         }

         if (ambienceLayer) {
            ambienceLayer.after(flow);
         } else {
            topContainer.prepend(flow);
         }
      }

      function trackPointerOnGlass() {
         let activeElement = null;
         let activeBounds = null;
         let pendingPoint = null;
         let lastPoint = null;
         let frame = null;

         function releaseFrame() {
            if (frame) {
               cancelAnimationFrame(frame);
               frame = null;
            }
         }

         function clearActive() {
            activeElement = null;
            activeBounds = null;
            pendingPoint = null;
            lastPoint = null;
            releaseFrame();
         }

         function paint() {
            frame = null;

            const hasTarget = activeElement && pendingPoint;

            if (!hasTarget) {
               return;
            }

            const isUnchanged = lastPoint && lastPoint.x === pendingPoint.x && lastPoint.y === pendingPoint.y;

            if (isUnchanged) {
               return;
            }

            activeBounds ||= activeElement.getBoundingClientRect();
            activeElement.style.setProperty("--glass-x", pendingPoint.x - activeBounds.left + "px");
            activeElement.style.setProperty("--glass-y", pendingPoint.y - activeBounds.top + "px");
            lastPoint = pendingPoint;
         }

         function invalidateBounds() {
            activeBounds = null;
         }

         document.addEventListener("pointerover", (event) => {
            const reactive = event.target.closest?.(REACTIVE_SELECTOR);

            if (reactive === activeElement) {
               return;
            }

            clearActive();

            if (!reactive) {
               return;
            }

            activeElement = reactive;
            activeBounds = reactive.getBoundingClientRect();

            const cardColor = reactive.querySelector(".main-cardImage-imageWrapper")?.style.getPropertyValue("--card-color");
            const hasCardColor = Boolean(cardColor && cardColor.trim());

            if (hasCardColor) {
               reactive.style.setProperty("--glass-glow", cardColor.trim());
            }
         }, { passive: true });

         document.addEventListener("pointermove", (event) => {
            if (!activeElement) {
               return;
            }

            pendingPoint = { x: event.clientX, y: event.clientY };

            if (!frame) {
               frame = requestAnimationFrame(paint);
            }
         }, { passive: true });

         document.documentElement.addEventListener("pointerleave", clearActive, { passive: true });
         window.addEventListener("resize", invalidateBounds, { passive: true });
         document.addEventListener("scroll", invalidateBounds, { passive: true, capture: true });
      }

      function revealOnEntry(afterMutations) {
         const revealObserver = new IntersectionObserver((entries) => {
            const revealed = [];
            let batchIndex = 0;

            entries.forEach((entry) => {
               if (!entry.isIntersecting) {
                  return;
               }

               const element = entry.target;
               const delay = Math.min(batchIndex * ENTER_STAGGER_MS, ENTER_MAX_DELAY_MS);
               element.style.setProperty("--glass-delay", delay + "ms");
               element.dataset.glassEnter = "shown";
               revealObserver.unobserve(element);
               revealed.push(element);
               batchIndex += 1;
            });

            if (!revealed.length) {
               return;
            }

            setTimeout(() => {
               revealed.forEach((element) => {
                  element.dataset.glassEnter = "done";
                  element.style.removeProperty("--glass-delay");
               });
            }, ENTER_SETTLE_MS);
         }, { threshold: 0.12 });

         let scanQueued = false;

         function scan() {
            scanQueued = false;

            const mainView = document.querySelector("#main-view");

            if (!mainView) {
               return;
            }

            mountFlow();

            if (!CARD_ENTRY_ENABLED) {
               return;
            }

            mainView.querySelectorAll(REACTIVE_SELECTOR).forEach((element) => {
               if (element.dataset.glassEnter) {
                  return;
               }

               element.dataset.glassEnter = "pending";
               revealObserver.observe(element);
            });
         }

         function scheduleScan() {
            if (scanQueued) {
               return;
            }

            scanQueued = true;
            requestAnimationFrame(scan);
         }

         function handleMutations(records) {
            const flowDetached = !flow.isConnected;
            const isBehindAmbience = flow.previousElementSibling?.id === "ambience-liquid";
            const flowMisordered = !isBehindAmbience && Boolean(flow.parentElement?.querySelector(":scope > #ambience-liquid"));
            const hasAddedNodes = CARD_ENTRY_ENABLED && records.some((record) => record.addedNodes.length > 0);
            const needsScan = flowDetached || flowMisordered || hasAddedNodes;

            afterMutations();

            if (needsScan) {
               scheduleScan();
            }
         }

         core.onBodyMutations(handleMutations);
         scan();
      }

      function watchNowPlayingCards() {
         const FOLLOWING_LABEL = "Following";
         const TITLE_SELECTOR = ":is(a[href^='/album/'], a[href^='/episode/'], a[href^='/show/']) > .encore-text-title-small";
         const heroUrls = new WeakMap();
         const panelObserver = new MutationObserver(scheduleTag);
         const reducedMotionQuery = matchMedia("(prefers-reduced-motion: reduce)");
         let observedPanel = null;
         let tagFrame = null;
         let taggedThisPass = new Set();

         function scheduleTag() {
            if (tagFrame) {
               return;
            }

            tagFrame = requestAnimationFrame(tagCards);
         }

         function setData(element, key, value) {
            taggedThisPass.add(element);

            if (element.dataset[key] !== value) {
               element.dataset[key] = value;
            }
         }

         function clearStaleTags(panel) {
            for (const element of panel.querySelectorAll("[data-npv-card], [data-npv-part], [data-npv-hero]")) {
               if (taggedThisPass.has(element)) {
                  continue;
               }

               delete element.dataset.npvCard;
               delete element.dataset.npvPart;
               delete element.dataset.npvHero;
            }
         }

         function findCard(heading, panel) {
            let card = heading;

            while (card.parentElement && card.parentElement !== panel) {
               const parent = card.parentElement;
               const holdsOtherHeadings = parent.querySelectorAll("h2").length > 1;
               const holdsTrackTitle = Boolean(parent.querySelector(TITLE_SELECTOR));

               if (holdsOtherHeadings || holdsTrackTitle) {
                  break;
               }

               card = parent;
            }

            const onlyChild = card.firstElementChild;
            const wrapsSection = card.tagName !== "SECTION" && card.childElementCount === 1 && onlyChild.tagName === "SECTION";

            return wrapsSection ? onlyChild : card;
         }

         function cardKind(card) {
            const isLyrics = card.matches("[data-testid='lyrics-npv-section']");
            const hasTrackRow = Boolean(card.querySelector("[data-encore-id='listRow'][aria-labelledby*='spotify:track'], [data-encore-id='listRow'][aria-labelledby*='spotify:episode']"));
            const hasRows = Boolean(card.querySelector("[data-encore-id='listRow']"));
            const hasArtistLink = Boolean(card.querySelector("a[href^='/artist/']"));
            const hasFollowButton = Boolean(card.querySelector("[data-encore-id='buttonSecondary']"));
            const isArtistProfile = hasArtistLink && hasFollowButton;

            if (isLyrics) {
               return "lyrics";
            }

            if (hasTrackRow) {
               return "queue";
            }

            if (hasRows) {
               return "credits";
            }

            return isArtistProfile ? "artist" : "other";
         }

         function tagArtist(card, heading) {
            const artistLink = card.querySelector("a[href^='/artist/']");
            const body = artistLink.parentElement;
            const hero = [...body.parentElement.children].find((child) => child !== body && child.contains(heading));
            const followButton = body.querySelector("[data-encore-id='buttonSecondary']");
            const bio = [...body.children].find((child) => child.tagName === "SPAN");

            setData(body, "npvPart", "body");

            if (followButton && followButton.parentElement !== body) {
               setData(followButton.parentElement, "npvPart", "meta");
            }

            if (bio) {
               setData(bio, "npvPart", "bio");
            }

            if (!hero) {
               setData(card, "npvHero", "none");
               return;
            }

            setData(hero, "npvPart", "hero");

            const url = (hero.style.backgroundImage.match(/url\(["']?([^"')]+)/) || [])[1] || "";
            const previousUrl = heroUrls.get(card);
            const isNewPhoto = Boolean(previousUrl && url && previousUrl !== url);
            heroUrls.set(card, url);
            setData(card, "npvHero", url ? "photo" : "none");

            if (isNewPhoto && !reducedMotionQuery.matches) {
               hero.animate({ opacity: [0, 1] }, { duration: 380, easing: EASE_CROSSFADE });
            }
         }

         function tagCards() {
            tagFrame = null;

            const panel = observedPanel;
            const isNowPlaying = panel && panel.isConnected && panel.getAttribute("aria-label") === NPV_LABEL;

            if (!isNowPlaying) {
               return;
            }

            taggedThisPass = new Set();

            for (const heading of panel.querySelectorAll("h2")) {
               const card = findCard(heading, panel);
               const kind = cardKind(card);
               setData(card, "npvCard", kind);

               const head = heading.parentElement;
               const isHeadRow = head !== card && head.querySelector(":scope > button");

               if (isHeadRow) {
                  setData(head, "npvPart", "head");
                  setData(head.parentElement, "npvPart", head.parentElement === card ? "head-host" : "stack");
               }

               if (kind === "artist") {
                  tagArtist(card, heading);
               }
            }

            for (const button of panel.querySelectorAll("[data-encore-id='buttonSecondary']")) {
               setData(button, "npvFollowing", String(button.textContent.trim() === FOLLOWING_LABEL));
            }

            clearStaleTags(panel);
         }

         return function syncPanel() {
            const panel = document.getElementById(NPV_PANEL_ID);

            if (panel === observedPanel) {
               return;
            }

            panelObserver.disconnect();
            observedPanel = panel;

            if (!panel) {
               return;
            }

            panelObserver.observe(panel, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["aria-label"] });
            scheduleTag();
         };
      }

      function pauseWhileHidden() {
         const syncHidden = () => {
            document.documentElement.classList.toggle("liquid-glass-hidden", document.hidden);
         };

         document.addEventListener("visibilitychange", syncHidden);
         syncHidden();
      }

      function start() {
         document.documentElement.classList.add(TIERS_CLASS, RECEDE_CLASS, HOME_CHIPS_CLASS);

         if (FLAT_GLASS_ENABLED) {
            document.documentElement.classList.add(FLAT_CLASS);
         }

         document.documentElement.classList.add(NPV_CARDS_CLASS);

         const syncNowPlayingPanel = watchNowPlayingCards();
         syncNowPlayingPanel();

         mountFlow();
         trackPointerOnGlass();
         revealOnEntry(syncNowPlayingPanel);
         pauseWhileHidden();
      }

      core.whenReady("liquidGlass", () => Boolean(document.querySelector("#main-view")), start);
   }

   function playerGlass(core) {
      const ROOT_CLASS = "sm-player-glass";
      const STYLE_ID = "player-glass";
      const BAR_SELECTOR = "aside[data-testid='now-playing-bar']";
      const PLAY_BUTTON_SELECTOR = `${BAR_SELECTOR} [data-testid='control-button-playpause']`;
      const LENS_SELECTOR = `${PLAY_BUTTON_SELECTOR} > span`;
      const HANDLE_SELECTOR = `${BAR_SELECTOR} [data-testid='playback-progressbar'] [data-testid='progress-bar-handle']`;
      const BEAT_ROOT_ATTRIBUTE = "data-ambience-top";
      const BLOOM_BASE_OPACITY = 0.62;
      const BLOOM_PEAK_GAIN = 0.38;
      const BLOOM_DOWNBEAT_GAIN = 1.35;
      const BLOOM_BEAT_GAIN = 0.3;
      const BEAT_MS = 380;
      const BEAT_STEPS = 11;
      const DOWNBEAT_MS = 900;
      const DOWNBEAT_STEPS = 14;
      const COMET_BASE_OPACITY = 0.78;
      const SEEK_JUMP_MS = 1500;
      const EASE_PRESS = "linear(0, 0.003 1.1%, 0.027 3.4%, 0.091 6.7%, 0.445 20.2%, 0.55 24.7%, 0.619 28.1%, 0.732 34.8%, 0.827 42.7%, 0.904 52.8%, 0.951 64%, 0.981 78.7%, 1)";
      const EASE_RELEASE = "linear(0, 0.023 3.2%, 0.101 7.1%, 0.198 10.7%, 0.533 21.7%, 0.712 28.8%, 0.837 35.5%, 0.923 42.2%, 0.984 50.5%, 1.015 60.7%, 1.02 72.2%, 1)";
      const EASE_HOVER = "linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1)";
      const EASE_CROSSFADE = "linear(0, 0.02 2.9%, 0.082 6.3%, 0.158 9.5%, 0.453 20.6%, 0.616 28%, 0.735 35.1%, 0.824 42.5%, 0.9 52.3%, 0.951 64.2%, 0.981 79%, 1)";
      const HOVER = `220ms ${EASE_HOVER}`;
      const RELEASE = `250ms ${EASE_RELEASE}`;
      const PRESS = `90ms ${EASE_PRESS}`;
      const XFADE = `380ms ${EASE_CROSSFADE}`;

      const BAR = `:root.${ROOT_CLASS} #main ${BAR_SELECTOR}`;
      const PLAY = `${BAR} [data-testid="control-button-playpause"]`;
      const PROGRESS = `${BAR} [data-testid="playback-progressbar"]`;
      const VOLUME = `${BAR} [data-testid="volume-bar"]`;
      const SIDE_BUTTONS = `${BAR} button:not([data-testid="control-button-playpause"]):not([data-testid="cover-art-button"])`;
      const CARD_PLAY = `[data-encore-id="card"] button[data-encore-id="buttonPrimary"][data-is-icon-only="true"]`;
      const LENS_HOST = `:root.${ROOT_CLASS} #main :is(${CARD_PLAY}, .view-homeShortcutsGrid-PlayButtonContainer button[data-encore-id="buttonPrimary"], [data-testid="action-bar-row"] button[data-encore-id="buttonPrimary"]:is([aria-label^="Play"], [aria-label^="Pause"]))`;
      const LENS_MIX = (index) => `color-mix(in srgb, var(--pg-${index}) 66%, #fff)`;

      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
         ${BAR} {
            --pg-1: var(--liq-1, rgb(214, 133, 137));
            --pg-2: var(--liq-2, rgb(148, 180, 219));
            --pg-3: var(--liq-3, rgb(182, 120, 170));
            --pg-4: var(--liq-4, rgb(120, 170, 140));
            --pg-lens-1: ${LENS_MIX(1)};
            --pg-lens-2: ${LENS_MIX(2)};
            --pg-lens-3: ${LENS_MIX(3)};
            --pg-lens-4: ${LENS_MIX(4)};
            --pg-fill-1: color-mix(in srgb, var(--pg-1) 68%, #fff);
            --pg-fill-2: color-mix(in srgb, var(--pg-2) 68%, #fff);
            --pg-fill-3: color-mix(in srgb, var(--pg-3) 68%, #fff);
            --pg-hover: rgba(255, 255, 255, 0.1);
            --pg-pressed: rgba(255, 255, 255, 0.16);
         }

         ${BAR}::before {
            content: "";
            position: absolute;
            top: 0;
            bottom: 0;
            left: -8%;
            right: -8%;
            height: auto;
            z-index: -1;
            pointer-events: none;
            background:
               linear-gradient(180deg, rgba(0, 0, 0, 0.16), rgba(0, 0, 0, 0.22)),
               radial-gradient(38% 150% at 50% 130%, color-mix(in srgb, var(--pg-1) 92%, transparent) 0%, transparent 74%),
               radial-gradient(30% 140% at 18% 140%, color-mix(in srgb, var(--pg-3) 78%, transparent) 0%, transparent 76%),
               radial-gradient(30% 140% at 82% 140%, color-mix(in srgb, var(--pg-2) 78%, transparent) 0%, transparent 76%),
               linear-gradient(180deg, rgba(255, 255, 255, 0.05), transparent 38%);
            opacity: ${BLOOM_BASE_OPACITY};
            transition: opacity ${XFADE};
         }

         :root.ambience-paused.${ROOT_CLASS} #main ${BAR_SELECTOR}::before {
            opacity: 0.16;
         }

         :root.sm-ambient-rest.${ROOT_CLASS} #main ${BAR_SELECTOR}::before {
            opacity: 0.2;
         }

         ${BAR} [data-testid="cover-art-container"] {
            box-shadow:
               0 0 0 1px rgba(255, 255, 255, 0.12),
               0 8px 22px -8px color-mix(in srgb, var(--pg-1) 85%, transparent) !important;
         }

         ${BAR} [data-testid="now-playing-widget-v2"] > div:nth-child(2) > div:first-child,
         ${BAR} [data-testid="now-playing-widget-v2"] > div:nth-child(2) > div:first-child * {
            color: rgba(255, 255, 255, 0.96) !important;
            text-shadow: 0 1px 8px rgba(0, 0, 0, 0.35);
         }

         ${BAR} [data-testid="now-playing-widget-v2"] > div:nth-child(2) > div:nth-child(2),
         ${BAR} [data-testid="now-playing-widget-v2"] > div:nth-child(2) > div:nth-child(2) * {
            color: rgba(255, 255, 255, 0.66) !important;
         }

         ${BAR} .main-addButton-button.control-button-heart[aria-checked="true"] {
            color: color-mix(in srgb, var(--pg-1) 40%, #fff) !important;
         }

         ${SIDE_BUTTONS} {
            border-radius: 50% !important;
            color: rgba(255, 255, 255, 0.72) !important;
            background-color: transparent !important;
         }

         ${SIDE_BUTTONS}:hover {
            color: #fff !important;
            background-color: var(--pg-hover) !important;
         }

         ${SIDE_BUTTONS}:active {
            background-color: var(--pg-pressed) !important;
            transform: scale(0.92) !important;
         }

         ${SIDE_BUTTONS}[aria-checked="true"],
         ${SIDE_BUTTONS}[aria-pressed="true"],
         ${SIDE_BUTTONS}[aria-label*="Disable"] {
            color: color-mix(in srgb, var(--pg-1) 38%, #fff) !important;
         }

         ${SIDE_BUTTONS}[disabled],
         ${SIDE_BUTTONS}[aria-disabled="true"] {
            opacity: 0.35 !important;
            pointer-events: none;
         }

         ${BAR} button:focus-visible {
            outline: 2px solid color-mix(in srgb, var(--pg-2) 70%, #fff) !important;
            outline-offset: 2px !important;
         }

         ${PLAY} {
            width: 40px !important;
            height: 40px !important;
         }

         ${PLAY}::before,
         ${PLAY} > span::after {
            display: none;
         }

         ${PLAY} > span {
            background:
               radial-gradient(86% 54% at 34% 11%, rgba(255, 255, 255, 0.92) 0%, rgba(255, 255, 255, 0) 62%),
               radial-gradient(70% 52% at 72% 106%, var(--pg-lens-2) 0%, transparent 74%),
               conic-gradient(from 200deg, var(--pg-lens-1), var(--pg-lens-2), var(--pg-lens-3), var(--pg-lens-4), var(--pg-lens-1)) !important;
            color: #0d0f14 !important;
            transform: scale(1.04);
            box-shadow:
               inset 0 1.5px 1px rgba(255, 255, 255, 0.85),
               inset 0 -7px 12px color-mix(in srgb, var(--pg-2) 38%, transparent),
               inset 0 0 0 1px rgba(255, 255, 255, 0.34),
               0 0 0 1px rgba(0, 0, 0, 0.14),
               0 10px 24px -8px color-mix(in srgb, var(--pg-1) 85%, transparent),
               0 0 30px -6px color-mix(in srgb, var(--pg-2) 60%, transparent) !important;
            transition:
               transform ${RELEASE},
               filter ${XFADE};
         }

         ${PLAY}:hover > span {
            transform: scale(1.11);
            box-shadow:
               inset 0 1.5px 1px rgba(255, 255, 255, 0.95),
               inset 0 -7px 12px color-mix(in srgb, var(--pg-2) 46%, transparent),
               inset 0 0 0 1px rgba(255, 255, 255, 0.42),
               0 0 0 1px rgba(0, 0, 0, 0.14),
               0 12px 28px -8px color-mix(in srgb, var(--pg-1) 95%, transparent),
               0 0 40px -4px color-mix(in srgb, var(--pg-2) 75%, transparent) !important;
         }

         ${PLAY}:active > span {
            transform: scale(0.97);
            transition: transform ${PRESS}, filter ${XFADE};
         }

         ${PLAY} svg {
            filter:
               drop-shadow(0.7px 0 0 rgba(255, 70, 110, 0.32))
               drop-shadow(-0.7px 0 0 rgba(70, 150, 255, 0.32));
         }

         ${LENS_HOST} {
            --pc-1: color-mix(in srgb, var(--liq-1, rgb(214, 133, 137)) 66%, #fff);
            --pc-2: color-mix(in srgb, var(--liq-2, rgb(148, 180, 219)) 66%, #fff);
            --pc-3: color-mix(in srgb, var(--liq-3, rgb(182, 120, 170)) 66%, #fff);
            --pc-4: color-mix(in srgb, var(--liq-4, rgb(120, 170, 140)) 66%, #fff);
            --pc-rest: 1;
            --pc-hover: 1.08;
            --pc-press: 0.88;
            --pc-ring: 0 0 0 0 transparent;
            overflow: visible !important;
            border-radius: 50% !important;
            background: none !important;
            -webkit-backdrop-filter: none !important;
            backdrop-filter: none !important;
            box-shadow: none !important;
            filter: none !important;
            transform: none !important;
         }

         :root.${ROOT_CLASS} #main ${CARD_PLAY} {
            --pc-rest: 0.92;
            --pc-hover: 1;
            --pc-press: 0.84;
         }

         ${LENS_HOST}::before,
         ${LENS_HOST}::after {
            display: none !important;
         }

         ${LENS_HOST}[aria-label^="Pause"] {
            --pc-ring: 0 0 0 2px color-mix(in srgb, var(--liq-2, rgb(148, 180, 219)) 55%, transparent);
         }

         ${LENS_HOST} > span {
            border-radius: 50% !important;
            background:
               radial-gradient(86% 54% at 34% 11%, rgba(255, 255, 255, 0.92) 0%, rgba(255, 255, 255, 0) 62%),
               radial-gradient(70% 52% at 72% 106%, var(--pc-2) 0%, transparent 74%),
               conic-gradient(from 200deg, var(--pc-1), var(--pc-2), var(--pc-3), var(--pc-4), var(--pc-1)) !important;
            color: #0d0f14 !important;
            transform: scale(var(--pc-rest));
            box-shadow:
               inset 0 1.5px 1px rgba(255, 255, 255, 0.85),
               inset 0 -5px 9px color-mix(in srgb, var(--liq-2, rgb(148, 180, 219)) 38%, transparent),
               inset 0 0 0 1px rgba(255, 255, 255, 0.34),
               0 0 0 1px rgba(0, 0, 0, 0.14),
               var(--pc-ring),
               0 6px 14px -6px color-mix(in srgb, var(--liq-1, rgb(214, 133, 137)) 85%, transparent) !important;
            transition: transform ${RELEASE};
         }

         ${LENS_HOST}:hover > span {
            transform: scale(var(--pc-hover));
            box-shadow:
               inset 0 1.5px 1px rgba(255, 255, 255, 0.95),
               inset 0 -5px 9px color-mix(in srgb, var(--liq-2, rgb(148, 180, 219)) 46%, transparent),
               inset 0 0 0 1px rgba(255, 255, 255, 0.42),
               0 0 0 1px rgba(0, 0, 0, 0.14),
               var(--pc-ring),
               0 8px 18px -6px color-mix(in srgb, var(--liq-1, rgb(214, 133, 137)) 95%, transparent) !important;
            transition: transform ${HOVER};
         }

         ${LENS_HOST}:active > span {
            transform: scale(var(--pc-press));
            transition: transform ${PRESS};
         }

         ${LENS_HOST} svg {
            filter:
               drop-shadow(0.5px 0 0 rgba(255, 70, 110, 0.32))
               drop-shadow(-0.5px 0 0 rgba(70, 150, 255, 0.32));
         }

         :root.${ROOT_CLASS} #main .main-card-PlayButtonContainer,
         :root.${ROOT_CLASS} #main [data-encore-id="card"] div:has(> div > button[data-encore-id="buttonPrimary"][data-is-icon-only="true"]) {
            border-radius: 50% !important;
            box-shadow: none !important;
         }

         ${PLAY} > span::before {
            content: "";
            position: absolute;
            inset: 0;
            z-index: -1;
            border-radius: 50%;
            pointer-events: none;
            background: radial-gradient(72% 72% at 50% 58%, rgba(255, 255, 255, 0.9) 0%, color-mix(in srgb, var(--pg-2) 40%, rgba(255, 255, 255, 0.3)) 46%, transparent 76%);
            opacity: 0;
         }

         :root.ambience-paused.${ROOT_CLASS} #main ${BAR_SELECTOR} [data-testid="control-button-playpause"] > span {
            filter: saturate(0.55) brightness(0.88);
            transform: scale(1);
         }

         ${BAR} [data-testid="general-controls"],
         ${BAR} [data-testid="player-controls"] > div:last-child {
            position: relative;
         }

         ${BAR} [data-testid="player-controls"] > div:last-child {
            gap: 12px !important;
         }

         ${BAR} [data-testid="playback-position"],
         ${BAR} [data-testid="playback-duration"] {
            color: rgba(255, 255, 255, 0.8) !important;
         }

         ${BAR} [data-testid="now-playing-widget-v2"] > div:nth-child(2) > div:is(:first-child, :nth-child(2)) {
            -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 24px), transparent);
            mask-image: linear-gradient(90deg, #000 calc(100% - 24px), transparent);
         }

         ${BAR} .progress-bar {
            overflow: visible !important;
            clip-path: inset(-18px -8px -18px -7px);
         }

         ${BAR} .x-progressBar-progressBarBg {
            background-color: rgba(255, 255, 255, 0.16) !important;
         }

         ${BAR} .x-progressBar-fillColor {
            background-color: var(--pg-fill-1) !important;
            background-image: linear-gradient(90deg, var(--pg-fill-3) 0%, var(--pg-fill-1) 40%, var(--pg-fill-2) 80%, #fff 100%) !important;
         }

         ${BAR} .progress-bar__slider {
            display: flex !important;
            background-color: #fff !important;
            box-shadow:
               0 0 0 2.5px color-mix(in srgb, var(--pg-2) 40%, transparent),
               0 0 12px 2px color-mix(in srgb, var(--pg-2) 85%, transparent),
               0 1px 3px rgba(0, 0, 0, 0.4) !important;
         }

         ${PROGRESS} .progress-bar__slider::before {
            content: "";
            position: absolute;
            right: 100%;
            top: 50%;
            width: 140px;
            height: 22px;
            margin-top: -11px;
            pointer-events: none;
            border-radius: 10px 0 0 10px;
            background: radial-gradient(100% 50% at 100% 50%, color-mix(in srgb, var(--pg-2) 78%, #fff) 0%, color-mix(in srgb, var(--pg-1) 48%, transparent) 34%, transparent 82%);
            opacity: ${COMET_BASE_OPACITY};
            transform-origin: 100% 50%;
         }

         :root.ambience-paused.${ROOT_CLASS} #main ${BAR_SELECTOR} [data-testid="playback-progressbar"] .progress-bar__slider::before {
            opacity: 0.25;
         }

         ${VOLUME} .progress-bar__slider {
            opacity: 0;
            transition: opacity ${HOVER};
         }

         ${VOLUME}:hover .progress-bar__slider,
         ${VOLUME}:focus-within .progress-bar__slider,
         ${VOLUME}:active .progress-bar__slider {
            opacity: 1;
         }

         @media (max-width: 1360px) {
            ${BAR} > div:first-child {
               grid-template-columns: minmax(0, 1fr) minmax(300px, 520px) minmax(0, 1fr) !important;
               column-gap: 16px !important;
            }

            ${VOLUME} {
               flex-basis: 96px !important;
               min-width: 96px !important;
            }

            ${BAR} button[data-testid="pip-toggle-button"],
            ${BAR} span:has(> button[aria-label*="device"]) {
               display: none !important;
            }
         }

         @media (max-width: 960px) {
            ${BAR} > div:first-child {
               grid-template-columns: minmax(0, 1fr) minmax(240px, 400px) auto !important;
            }

            ${VOLUME} > div,
            ${BAR} button[data-testid="pip-toggle-button"],
            ${BAR} span:has(> button[aria-label*="device"]) {
               display: none !important;
            }
         }

         @media (max-width: 760px) {
            ${BAR} button[data-testid="lyrics-button"],
            ${BAR} div:has(> button[data-testid="control-button-queue"]),
            ${BAR} button[data-testid="fullscreen-mode-button"] {
               display: none !important;
            }
         }

         @media (prefers-reduced-motion: reduce) {
            ${PLAY} > span,
            ${PLAY}:hover > span,
            ${PLAY}:active > span {
               transform: none;
            }

            ${SIDE_BUTTONS}:active {
               transform: none !important;
            }
         }

         @media (prefers-reduced-transparency: reduce) {
            ${BAR}::before {
               display: none;
            }

            ${BAR} {
               background-color: rgb(var(--spice-rgb-main)) !important;
               backdrop-filter: none !important;
            }
         }

      `;

      function isEffectActive() {
         const root = document.documentElement;
         const isOn = root.classList.contains(ROOT_CLASS);
         const isResting = root.classList.contains("sm-ambient-rest");
         const isHidden = document.hidden;
         const prefersStill = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
         return isOn && !isResting && !isHidden && !prefersStill;
      }

      function pulseBloom(strength, isDownbeat) {
         const bar = document.querySelector(BAR_SELECTOR);
         const gain = isDownbeat ? BLOOM_DOWNBEAT_GAIN : BLOOM_BEAT_GAIN;
         const peak = Math.min(1, BLOOM_BASE_OPACITY + BLOOM_PEAK_GAIN * strength * gain);
         const duration = isDownbeat ? DOWNBEAT_MS : BEAT_MS;
         const steps = isDownbeat ? DOWNBEAT_STEPS : BEAT_STEPS;

         bar?.animate(
            [{ opacity: peak }, { opacity: BLOOM_BASE_OPACITY }],
            { duration, easing: `steps(${steps})`, pseudoElement: "::before" },
         );
      }

      function pulseLens(strength, isDownbeat) {
         const lens = document.querySelector(LENS_SELECTOR);
         const peak = Math.min(0.85, 0.22 + 0.5 * strength * (isDownbeat ? 1.3 : 1));
         const duration = isDownbeat ? DOWNBEAT_MS : BEAT_MS;
         const steps = isDownbeat ? DOWNBEAT_STEPS : BEAT_STEPS;

         lens?.animate(
            [{ opacity: peak }, { opacity: 0 }],
            { duration, easing: `steps(${steps})`, pseudoElement: "::before" },
         );
      }

      function flareComet(strength) {
         const handle = document.querySelector(HANDLE_SELECTOR);
         const peak = Math.min(1, COMET_BASE_OPACITY + 0.4 * strength);
         const stretch = 1 + 0.55 * strength;

         handle?.animate(
            [
               { opacity: peak, transform: `scaleX(${stretch})` },
               { opacity: COMET_BASE_OPACITY, transform: "scaleX(1)" },
            ],
            { duration: DOWNBEAT_MS, easing: `steps(${DOWNBEAT_STEPS})`, pseudoElement: "::before" },
         );
      }

      function surge(strength, isDownbeat) {
         if (!isEffectActive()) {
            return;
         }

         pulseBloom(strength, isDownbeat);
         pulseLens(strength, isDownbeat);

         if (isDownbeat) {
            flareComet(strength);
         }
      }

      function hookBeatPulses() {
         const nativeAnimate = Element.prototype.animate;
         let pendingStrength = null;
         let pendingDownbeat = false;

         const flushBeat = () => {
            const strength = pendingStrength ?? 0.8;
            const isDownbeat = pendingDownbeat;
            pendingStrength = null;
            pendingDownbeat = false;
            surge(strength, isDownbeat);
         };

         const queueBeat = (strength, isDownbeat) => {
            const isIdle = pendingStrength === null && !pendingDownbeat;
            pendingStrength = strength ?? pendingStrength;
            pendingDownbeat = pendingDownbeat || isDownbeat;

            if (isIdle) {
               queueMicrotask(flushBeat);
            }
         };

         Element.prototype.animate = function animateWithBeatTap(keyframes, options) {
            const animation = nativeAnimate.call(this, keyframes, options);

            try {
               const isPseudoGlow = options && options.pseudoElement === "::before";
               const isPlayButton = isPseudoGlow && this.matches(PLAY_BUTTON_SELECTOR);
               const isBarBreath = options && this.hasAttribute(BEAT_ROOT_ATTRIBUTE);

               if (isPlayButton) {
                  queueBeat(Number(keyframes[0].opacity) || 0.5, false);
               }

               if (isBarBreath) {
                  queueBeat(null, true);
               }
            } catch (error) {
               return animation;
            }

            return animation;
         };
      }

      function watchTransport() {
         let lastProgress = null;
         let lastStamp = 0;

         core.onPlayer("onplaypause", () => surge(0.9, true));
         core.onPlayer("songchange", () => surge(1, true));

         core.onPlayer("onprogress", () => {
            const progress = Spicetify.Player.getProgress();
            const stamp = performance.now();
            const hasPrevious = lastProgress !== null;
            const drift = hasPrevious ? Math.abs((progress - lastProgress) - (stamp - lastStamp)) : 0;
            const isSeek = hasPrevious && drift > SEEK_JUMP_MS;

            lastProgress = progress;
            lastStamp = stamp;

            if (isSeek) {
               surge(1, true);
            }
         });
      }

      function start() {
         document.head.appendChild(style);
         document.documentElement.classList.add(ROOT_CLASS);
         hookBeatPulses();
         watchTransport();
      }

      const hasPlayer = () => Boolean(window.Spicetify && Spicetify.Player && Spicetify.Player.addEventListener);

      core.whenReady("playerGlass", hasPlayer, start);
   }

   function searchGlass(core) {
      const ACTIVE_CLASS = "sm-search-glass";
      const AURORA_ID = "sg-aurora";
      const SPOT_WIDTH_PX = 280;
      const EASE_PRESS = "linear(0, 0.003 1.1%, 0.027 3.4%, 0.091 6.7%, 0.445 20.2%, 0.55 24.7%, 0.619 28.1%, 0.732 34.8%, 0.827 42.7%, 0.904 52.8%, 0.951 64%, 0.981 78.7%, 1)";
      const EASE_RELEASE = "linear(0, 0.023 3.2%, 0.101 7.1%, 0.198 10.7%, 0.533 21.7%, 0.712 28.8%, 0.837 35.5%, 0.923 42.2%, 0.984 50.5%, 1.015 60.7%, 1.02 72.2%, 1)";
      const EASE_HOVER = "linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1)";
      const EASE_MENU = "linear(0, 0.018 3.7%, 0.071 7.8%, 0.154 12.4%, 0.435 25.7%, 0.574 33%, 0.703 41.3%, 0.806 50%, 0.884 59.6%, 0.941 70.6%, 0.976 83.5%, 1)";
      const EASE_DIALOG = "linear(0, 0.023 3.7%, 0.086 7.7%, 0.171 11.7%, 0.461 24.1%, 0.619 32.1%, 0.729 39.1%, 0.815 46.5%, 0.895 56.5%, 0.948 67.9%, 0.979 81.6%, 1)";
      const PRESS = `90ms var(--sm-press-ease, ${EASE_PRESS})`;
      const RELEASE = `250ms var(--sm-release-ease, ${EASE_RELEASE})`;
      const HOVER = `220ms var(--sm-hover-ease, ${EASE_HOVER})`;
      const MENU = `220ms var(--sm-menu-ease, ${EASE_MENU})`;
      const DIALOG = `300ms var(--sm-dialog-ease, ${EASE_DIALOG})`;
      const RING_MASK = "linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)";

      const BAR = `:root.${ACTIVE_CLASS} #main #global-nav-bar`;
      const FORM = `${BAR} form[role="search"]`;
      const FIELD = `${FORM} input[role="combobox"]`;
      const HOME = `${BAR} button[aria-label="Home"]`;
      const BROWSE = `${BAR} button[aria-label="Browse"]`;
      const CLEAR = `${BAR} button[aria-label="Clear search field"]`;
      const AURORA = `${FORM} > #${AURORA_ID}`;
      const LISTBOX = `${FORM} [role="listbox"]`;

      const style = document.createElement("style");
      style.id = "search-glass";
      style.textContent = `
         #${AURORA_ID} {
            display: none;
         }

         ${BAR} {
            --sg-height: 44px;
            --sg-liq-1: var(--liq-1, #8a6cff);
            --sg-liq-2: var(--liq-2, #5b8cff);
            --sg-liq-3: var(--liq-3, #c86cff);
            --sg-liq-4: var(--liq-4, #6cffd0);
            --sg-fill: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02)), rgba(8, 8, 14, 0.36);
            --sg-fill-hover: linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.04)), rgba(8, 8, 14, 0.4);
            --sg-rim:
               inset 0 1px 0 rgba(255, 255, 255, 0.22),
               inset 0 0 0 1px rgba(255, 255, 255, 0.07),
               inset 0 -8px 14px -10px rgba(0, 0, 0, 0.5);
            --sg-lift: 0 8px 20px -8px rgba(0, 0, 0, 0.45);
         }

         ${HOME} {
            position: relative;
            width: var(--sg-height) !important;
            height: var(--sg-height) !important;
            min-width: var(--sg-height) !important;
            border-radius: 999px !important;
            background: var(--sg-fill) !important;
            box-shadow: var(--sg-rim), var(--sg-lift) !important;
            color: rgba(var(--spice-rgb-text), 0.72) !important;
            transition: transform ${RELEASE}, background-color ${HOVER}, color ${HOVER}, opacity ${HOVER} !important;
         }

         ${HOME}::after,
         ${FORM} > #${AURORA_ID} {
            content: "";
            display: block;
            position: absolute;
            inset: 0;
            padding: 1.5px;
            border-radius: 999px;
            pointer-events: none;
            overflow: hidden;
            -webkit-mask: ${RING_MASK};
            mask: ${RING_MASK};
         }

         ${HOME}::after {
            background: linear-gradient(135deg, var(--sg-liq-1), var(--sg-liq-3) 55%, var(--sg-liq-2));
            opacity: 0;
            transition: opacity ${HOVER};
         }

         ${HOME}:hover {
            transform: scale(1.05);
            background: var(--sg-fill-hover) !important;
            color: rgb(var(--spice-rgb-text)) !important;
         }

         ${HOME}:hover::after {
            opacity: 0.85;
         }

         ${HOME}:active {
            transform: scale(0.94);
            transition-duration: 90ms !important;
            transition-timing-function: ${EASE_PRESS} !important;
         }

         ${FORM} {
            position: relative;
            height: var(--sg-height) !important;
            align-self: center;
         }

         ${FIELD} {
            height: var(--sg-height) !important;
            min-height: var(--sg-height) !important;
            padding-left: 48px !important;
            padding-right: 56px !important;
            border-radius: 999px !important;
            border: none !important;
            font-size: 15px !important;
            background: var(--sg-fill) !important;
            box-shadow: var(--sg-rim), var(--sg-lift) !important;
            color: rgb(var(--spice-rgb-text)) !important;
            transform: none !important;
            transition: background-color ${HOVER}, box-shadow ${HOVER} !important;
         }

         ${FIELD}:hover {
            background: var(--sg-fill-hover) !important;
         }

         ${FIELD}:focus {
            background: var(--sg-fill-hover) !important;
            box-shadow:
               var(--sg-rim),
               0 0 0 4px color-mix(in srgb, var(--sg-liq-1) 16%, transparent),
               0 10px 28px -8px color-mix(in srgb, var(--sg-liq-1) 40%, rgba(0, 0, 0, 0.5)) !important;
         }

         ${FIELD}::placeholder {
            color: rgba(var(--spice-rgb-text), 0.78) !important;
            opacity: 1 !important;
         }

         ${FORM} [class*="icon--leading"] {
            left: 0 !important;
         }

         ${FORM} [class*="icon--trailing"] {
            right: 6px !important;
         }

         ${FORM} [class*="icon--trailing"] > div:has(> button[aria-label="Browse"]) {
            position: relative;
            padding: 0 0 0 12px !important;
            border: none !important;
         }

         ${FORM} [class*="icon--trailing"] > div:has(> button[aria-label="Browse"])::before {
            content: "";
            position: absolute;
            left: 0;
            top: 50%;
            width: 1px;
            height: 16px;
            margin-top: -8px;
            background: rgba(255, 255, 255, 0.14);
         }

         ${FORM} button[aria-label="Search"] {
            color: rgba(var(--spice-rgb-text), 0.7) !important;
            transition: color ${HOVER};
         }

         ${FORM}:hover button[aria-label="Search"],
         ${FORM}:focus-within button[aria-label="Search"] {
            color: rgb(var(--spice-rgb-text)) !important;
         }

         ${FORM} kbd {
            min-width: 22px;
            height: 22px;
            padding: 0 6px;
            border-radius: 7px;
            border: none;
            background: rgba(255, 255, 255, 0.1);
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.12);
            color: rgba(var(--spice-rgb-text), 0.7);
            line-height: 22px;
            font-size: 12px;
            -webkit-mask: none;
            mask: none;
            filter: none;
         }

         ${FORM} input + div > span:last-child {
            background: none !important;
            filter: none !important;
            -webkit-mask: none !important;
            mask: none !important;
            box-shadow: none !important;
         }

         ${BROWSE},
         ${CLEAR} {
            position: relative;
            width: 32px !important;
            height: 32px !important;
            min-width: 32px !important;
            padding: 0 !important;
            border-radius: 999px !important;
            background: transparent !important;
            color: rgba(var(--spice-rgb-text), 0.7) !important;
            transition: transform ${RELEASE}, background-color ${HOVER}, color ${HOVER} !important;
         }

         ${BROWSE}:hover,
         ${CLEAR}:hover {
            background: rgba(255, 255, 255, 0.12) !important;
            color: rgb(var(--spice-rgb-text)) !important;
         }

         ${BROWSE}:active,
         ${CLEAR}:active {
            transform: scale(0.94);
            transition-duration: 90ms !important;
            transition-timing-function: ${EASE_PRESS} !important;
         }

         ${BAR} button:focus-visible {
            outline: 2px solid var(--sg-liq-1) !important;
            outline-offset: 2px;
         }

         ${AURORA} {
            z-index: 2;
            opacity: 0;
            transition: opacity ${HOVER};
         }

         ${FORM}:hover > #${AURORA_ID} {
            opacity: 0.55;
         }

         ${FORM}:focus-within > #${AURORA_ID} {
            opacity: 1;
            transition-duration: 220ms;
         }

         ${AURORA} > .sg-sweep {
            position: absolute;
            top: 0;
            bottom: 0;
            left: 0;
            width: 200%;
            transform: translateX(-50%);
            background: linear-gradient(90deg, transparent 0%, transparent 35%, var(--sg-liq-1) 50%, var(--sg-liq-2) 66%, var(--sg-liq-3) 83%, var(--sg-liq-4) 100%);
         }

         ${AURORA} > .sg-spot {
            position: absolute;
            top: 0;
            bottom: 0;
            left: 0;
            width: ${SPOT_WIDTH_PX}px;
            opacity: 0;
            transform: translateX(-9999px);
            background: radial-gradient(closest-side, #fff, color-mix(in srgb, var(--sg-liq-1) 70%, transparent) 45%, transparent);
            transition: opacity ${HOVER};
         }

         ${FORM}:hover > #${AURORA_ID} > .sg-spot {
            opacity: 1;
         }

         ${FORM}:focus-within > #${AURORA_ID} > .sg-spot {
            opacity: 0;
         }

         ${FORM}:focus-within > #${AURORA_ID} > .sg-sweep {
            animation: sg-sweep ${DIALOG} both;
         }

         @keyframes sg-sweep {
            from {
               transform: translateX(0);
            }
         }

         ${LISTBOX} {
            margin-top: 8px;
            border-radius: 22px !important;
            overflow: hidden;
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.02)), rgba(14, 14, 22, 0.88) !important;
            box-shadow:
               inset 0 1px 0 rgba(255, 255, 255, 0.18),
               inset 0 0 0 1px rgba(255, 255, 255, 0.07),
               0 22px 48px -14px rgba(0, 0, 0, 0.6) !important;
            transform-origin: 50% 0;
            animation: sg-pop ${MENU} both;
         }

         @keyframes sg-pop {
            from {
               opacity: 0;
               transform: scale(0.97);
            }
         }

         :root.sm-ambient-rest ${AURORA} {
            opacity: 0.4 !important;
         }

         :root.sm-ambient-rest ${AURORA} > .sg-spot {
            opacity: 0 !important;
         }

         @media (prefers-reduced-motion: reduce) {
            ${HOME}:hover,
            ${HOME}:active,
            ${BROWSE}:active,
            ${CLEAR}:active {
               transform: none;
            }

            ${AURORA} > .sg-spot {
               display: none;
            }

            ${FORM}:focus-within > #${AURORA_ID} > .sg-sweep,
            ${LISTBOX} {
               animation: none;
            }

            ${HOME},
            ${FIELD},
            ${AURORA} {
               transition-duration: 120ms !important;
               transition-timing-function: linear !important;
            }
         }

         @media (prefers-reduced-transparency: reduce) {
            ${BAR} {
               --sg-fill: rgba(26, 26, 32, 0.96);
               --sg-fill-hover: rgba(36, 36, 44, 0.98);
            }

            ${LISTBOX} {
               background: rgb(22, 22, 28) !important;
            }

            ${AURORA},
            ${HOME}::after {
               display: none;
            }
         }
      `;
      document.head.appendChild(style);

      let cachedRect = null;
      let pendingX = null;
      let frameId = 0;

      function buildAurora() {
         const aurora = document.createElement("div");
         aurora.id = AURORA_ID;
         aurora.setAttribute("aria-hidden", "true");
         aurora.innerHTML = "<i class='sg-sweep'></i><i class='sg-spot'></i>";
         return aurora;
      }

      function moveSpot() {
         frameId = 0;
         const spot = document.querySelector(`#${AURORA_ID} > .sg-spot`);
         const hasTarget = spot && cachedRect && pendingX !== null;

         if (!hasTarget) {
            return;
         }

         const localX = Math.max(0, Math.min(cachedRect.width, pendingX - cachedRect.left));
         spot.style.transform = `translateX(${Math.round(localX - SPOT_WIDTH_PX / 2)}px)`;
      }

      function onPointerMove(event) {
         const form = event.currentTarget;
         cachedRect = cachedRect || form.getBoundingClientRect();
         pendingX = event.clientX;

         if (!frameId) {
            frameId = requestAnimationFrame(moveSpot);
         }
      }

      function forgetRect() {
         cachedRect = null;
      }

      function mount() {
         const form = document.querySelector("#global-nav-bar form[role='search']");

         if (!form) {
            return false;
         }

         const isMounted = form.querySelector(`#${AURORA_ID}`);

         if (!isMounted) {
            form.insertBefore(buildAurora(), form.firstChild);
            form.addEventListener("pointermove", onPointerMove, { passive: true });
            form.addEventListener("pointerenter", forgetRect, { passive: true });
            window.addEventListener("resize", forgetRect, { passive: true });
         }

         document.documentElement.classList.add(ACTIVE_CLASS);
         return true;
      }

      function watchBar() {
         const bar = document.querySelector("#global-nav-bar");
         let scheduled = false;

         const remountIfNeeded = () => {
            scheduled = false;
            mount();
         };

         new MutationObserver(() => {
            if (!scheduled) {
               scheduled = true;
               requestAnimationFrame(remountIfNeeded);
            }
         }).observe(bar, { childList: true, subtree: true });
      }

      function start() {
         mount();
         watchBar();
      }

      core.whenReady("searchGlass", () => Boolean(document.querySelector("#global-nav-bar form[role='search']")), start);
   }

   function spotifyMotion(core) {
      const ROOT_CLASS = "sm-motion";
      const STYLE_ID = "spotify-motion";
      const OWN_STYLE_IDS = new Set([
         "spotify-motion",
         "album-ambience",
         "ambience-ripple",
         "ambience-liquid",
         "comfy-tweaks",
         "library-hider",
         "library-moods",
         "library-picker",
         "liquid-glass",
         "liquid-glass-flow",
         "folder-images",
      ]);

      const PRESETS = {
         press: { duration: 90, easing: "linear(0, 0.003 1.1%, 0.027 3.4%, 0.091 6.7%, 0.445 20.2%, 0.55 24.7%, 0.619 28.1%, 0.732 34.8%, 0.827 42.7%, 0.904 52.8%, 0.951 64%, 0.981 78.7%, 1)" },
         release: { duration: 250, easing: "linear(0, 0.023 3.2%, 0.101 7.1%, 0.198 10.7%, 0.533 21.7%, 0.712 28.8%, 0.837 35.5%, 0.923 42.2%, 0.984 50.5%, 1.015 60.7%, 1.02 72.2%, 1)" },
         hover: { duration: 220, easing: "linear(0, 0.017 2.7%, 0.079 6.2%, 0.165 9.8%, 0.449 20.4%, 0.616 28%, 0.735 35.1%, 0.825 42.7%, 0.901 52.4%, 0.952 64.4%, 0.981 79.1%, 1)" },
         toggle: { duration: 240, easing: "linear(0, 0.023 3.4%, 0.099 7.6%, 0.192 11.4%, 0.499 22.8%, 0.67 30.4%, 0.786 37.1%, 0.875 44.3%, 0.946 53.6%, 0.987 64.6%, 1.004 78.1%, 1)" },
         menu: { duration: 220, easing: "linear(0, 0.018 3.7%, 0.071 7.8%, 0.154 12.4%, 0.435 25.7%, 0.574 33%, 0.703 41.3%, 0.806 50%, 0.884 59.6%, 0.941 70.6%, 0.976 83.5%, 1)" },
         dialog: { duration: 300, easing: "linear(0, 0.023 3.7%, 0.086 7.7%, 0.171 11.7%, 0.461 24.1%, 0.619 32.1%, 0.729 39.1%, 0.815 46.5%, 0.895 56.5%, 0.948 67.9%, 0.979 81.6%, 1)" },
         view: { duration: 300, easing: "linear(0, 0.02 2.9%, 0.085 6.5%, 0.45 20.5%, 0.615 28%, 0.735 35.1%, 0.824 42.6%, 0.902 52.7%, 0.952 64.4%, 0.981 79%, 1)" },
         crossfade: { duration: 380, easing: "linear(0, 0.02 2.9%, 0.082 6.3%, 0.158 9.5%, 0.453 20.6%, 0.616 28%, 0.735 35.1%, 0.824 42.5%, 0.9 52.3%, 0.951 64.2%, 0.981 79%, 1)" },
         lively: { duration: 380, easing: "linear(0, 0.006 1.6%, 0.026 3.4%, 0.111 7.7%, 0.222 11.6%, 0.577 23%, 0.761 30.1%, 0.882 36.5%, 0.967 43.1%, 1.023 51%, 1.045 60.2%, 1.043 69%, 1)" },
      };

      const CLASS_RULES = [
         { name: "press", pattern: /:active/, budget: 120, preset: "press" },
         { name: "menu", pattern: /menu|tooltip|popover|dialog|modal|dropdown|tippy|popup/i, budget: 380, preset: "menu" },
         { name: "hover", pattern: /:hover|:focus|aria-selected|aria-checked|aria-expanded|aria-pressed|data-state|:checked/, budget: 280, preset: "hover" },
      ];
      const STATE_CLASS = { name: "state", budget: 400, preset: "crossfade" };
      const REDUCED_DURATION = 120;
      const PRESS_DEPTH_CLASS = "sm-press-depth";
      const ROUTE_REVEAL_CLASS = "sm-route-reveal";
      const COVER_SETTLE_CLASS = "sm-cover-settle";
      const SPECULAR_CLASS = "sm-specular";
      const PRESS_LIGHT_CLASS = "sm-press-light";
      const MATERIALIZE_CLASS = "sm-materialize";
      const MENU_POP_CLASS = "sm-menu-pop";
      const SCRUBBER_CLASS = "sm-scrubber";
      const COLOR_FLOW_CLASS = "sm-color-flow";
      const ELEVATIONS = [PRESS_DEPTH_CLASS, ROUTE_REVEAL_CLASS, COVER_SETTLE_CLASS, SPECULAR_CLASS, PRESS_LIGHT_CLASS, MATERIALIZE_CLASS, MENU_POP_CLASS, SCRUBBER_CLASS, COLOR_FLOW_CLASS];
      const PALETTE_PROPERTIES = ["--liq-1", "--liq-2", "--liq-3", "--liq-4"];
      // Every element inherits --liq-*, so each step restyles the whole document (about 45 ms on Home). 0 snaps like --spice-* does.
      const COLOR_FLOW_STEPS = 0;
      const LIGHT_LAYER_ID = "sm-light";
      const GLASS_PANELS = "#Desktop_LeftSidebar_Id, .Root__right-sidebar-peek, [data-testid='now-playing-bar']";
      const FLOATING_GLASS = "#context-menu, [data-tippy-root], [role='dialog']";
      const SCRUBBER_GROWTH = 1.75;
      const HANDLE_GROWTH = 1.15;
      const PRESS_TARGETS = "button, [role='button'], .main-trackList-trackListRow, #Desktop_LeftSidebar_Id [role='row']";
      const PRESS_SKIPPED = "[disabled], [aria-disabled='true'], [role='slider'], #context-menu *, [data-encore-id='card'], [data-encore-id='card'] *, [data-encore-id='chip'], .view-homeShortcutsGrid-shortcut, .view-homeShortcutsGrid-shortcut *, [class*='legacy-chip__inner'], [class*='legacy-chip'] *, .lp-chip, .lp-chip *";
      const BUTTON_PRESS_SCALE = 0.94;
      const ROW_PRESS_SCALE = 0.985;
      const pressAnimations = new WeakMap();
      const REVEAL_TARGETS = ".main-trackList-trackListRow, [data-encore-id='card'], .view-homeShortcutsGrid-shortcut";
      const REVEAL_LIMIT = 12;
      const REVEAL_WINDOW = 700;
      const REVEAL_START_OPACITY = 0.55;
      const REVEAL_DURATION = 200;
      const MAX_REVEAL_DELAY = 60;
      const revealedItems = new WeakSet();
      let revealAnimations = [];
      let revealCount = 0;
      const COVER_SELECTOR = "[data-testid='now-playing-bar'] [data-testid='cover-art-button'] img";
      const REST_WHEN_UNFOCUSED = true;
      const RESTING_CLASS = "sm-ambient-rest";
      const restingLoops = new Map();
      const AMBIENT_TICKER_CLASS = "sm-ambient-ticker";
      const AMBIENT_TICK_MS = 125;
      const AMBIENT_SCAN_MS = 1000;
      // A 30 s drift moves a few px per 125 ms tick, and each write re-blurs every glass surface above it.
      const SLOW_LOOP_MS = 30000;
      const SLOW_LOOP_TICK_MS = 500;
      const tickedLoops = new Map();
      let ambientTickTimer = null;
      let ambientScanTimer = null;
      let restScanTimer = null;
      let lastAmbientTick = 0;
      const ANTI_FLICKER_DELAY = 500;
      const MAX_STAGGER_DELAY = 30;
      const SCRUBBER_TRACKS = "[data-testid='now-playing-bar'] :is([data-testid='playback-progressbar'], [data-testid='volume-bar'])";
      const DIALOG_SCRIM = ".Root div:has(> [role='dialog'][aria-modal='true'])";
      const FRAGMENT_CSS = `
         #${LIGHT_LAYER_ID} {
            position: fixed;
            inset: 0;
            z-index: 9000;
            overflow: hidden;
            pointer-events: none;
            contain: strict;
         }

         #${LIGHT_LAYER_ID} > div {
            position: absolute;
            top: 0;
            left: 0;
            border-radius: 50%;
            opacity: 0;
            will-change: transform, opacity;
         }

         #${LIGHT_LAYER_ID} .sm-light-leaf {
            width: 360px;
            height: 360px;
            margin: -180px 0 0 -180px;
            background: radial-gradient(circle,
               color-mix(in srgb, color-mix(in srgb, var(--liq-1, #fff) 45%, #fff) 15%, transparent) 0%,
               color-mix(in srgb, color-mix(in srgb, var(--liq-1, #fff) 60%, #fff) 6%, transparent) 34%,
               transparent 68%);
            transition: opacity var(--sm-hover-dur) var(--sm-hover-ease), --liq-1 var(--sm-crossfade-dur) var(--sm-crossfade-ease);
         }

         :root.${SPECULAR_CLASS} #${LIGHT_LAYER_ID}.is-lit .sm-light-leaf {
            opacity: 1;
         }

         #${LIGHT_LAYER_ID} .sm-light-spark {
            width: 180px;
            height: 180px;
            margin: -90px 0 0 -90px;
            background: radial-gradient(circle,
               color-mix(in srgb, color-mix(in srgb, var(--liq-2, #fff) 35%, #fff) 26%, transparent) 0%,
               color-mix(in srgb, color-mix(in srgb, var(--liq-2, #fff) 55%, #fff) 9%, transparent) 40%,
               transparent 70%);
         }

         :root.${MENU_POP_CLASS} #context-menu > [data-encore-id='menu'] {
            transform-origin: top left;
            animation: sm-menu-pop var(--sm-menu-dur) var(--sm-menu-ease) backwards;
         }

         :root.${MENU_POP_CLASS} #context-menu:is([data-placement='top-start'], [data-placement='right-end']) > [data-encore-id='menu'] {
            transform-origin: bottom left;
         }

         :root.${MENU_POP_CLASS} #context-menu:is([data-placement='bottom-end'], [data-placement='left-start']) > [data-encore-id='menu'] {
            transform-origin: top right;
         }

         :root.${MENU_POP_CLASS} #context-menu:is([data-placement='top-end'], [data-placement='left-end']) > [data-encore-id='menu'] {
            transform-origin: bottom right;
         }

         :root.${MENU_POP_CLASS} #context-menu[data-placement='top'] > [data-encore-id='menu'] {
            transform-origin: bottom center;
         }

         :root.${MENU_POP_CLASS} #context-menu[data-placement='bottom'] > [data-encore-id='menu'] {
            transform-origin: top center;
         }

         :root.${MATERIALIZE_CLASS} ${DIALOG_SCRIM} {
            animation: sm-scrim-in var(--sm-dialog-dur) var(--sm-dialog-ease) backwards;
         }

         :root.${MATERIALIZE_CLASS} ${DIALOG_SCRIM} > [role='dialog'] {
            animation: sm-dialog-in var(--sm-dialog-dur) var(--sm-dialog-ease) backwards;
         }

         @keyframes sm-menu-pop {
            from {
               opacity: 0;
               scale: 0.96;
               filter: blur(6px);
            }
         }

         @keyframes sm-dialog-in {
            from {
               opacity: 0;
               scale: 0.97;
               filter: blur(6px);
            }
         }

         @keyframes sm-scrim-in {
            from {
               background-color: transparent;
            }
         }

         :root.${SCRUBBER_CLASS} #main ${SCRUBBER_TRACKS} [data-testid='progress-bar-background'] {
            transition: height var(--sm-hover-dur) var(--sm-hover-ease), scale var(--sm-hover-dur) var(--sm-hover-ease) !important;
         }

         :root.${SCRUBBER_CLASS} #main ${SCRUBBER_TRACKS}:hover [data-testid='progress-bar-background'] {
            scale: 1 ${SCRUBBER_GROWTH};
         }

         :root.${SCRUBBER_CLASS} #main ${SCRUBBER_TRACKS} [data-testid='progress-bar-handle'] {
            transition: scale var(--sm-hover-dur) var(--sm-hover-ease);
         }

         :root.${SCRUBBER_CLASS} #main ${SCRUBBER_TRACKS}:hover [data-testid='progress-bar-handle'] {
            scale: ${HANDLE_GROWTH} ${(HANDLE_GROWTH / SCRUBBER_GROWTH).toFixed(3)};
         }

         @media (prefers-reduced-motion: reduce) {
            #${LIGHT_LAYER_ID} {
               display: none;
            }

            :root.${MENU_POP_CLASS} #context-menu > [data-encore-id='menu'],
            :root.${MATERIALIZE_CLASS} ${DIALOG_SCRIM} > [role='dialog'] {
               animation: sm-fade-in ${REDUCED_DURATION}ms linear backwards;
            }

            :root.${MATERIALIZE_CLASS} ${DIALOG_SCRIM} {
               animation-duration: ${REDUCED_DURATION}ms;
            }

            :root.${SCRUBBER_CLASS} #main ${SCRUBBER_TRACKS}:hover :is([data-testid='progress-bar-background'], [data-testid='progress-bar-handle']) {
               scale: none;
            }

            @keyframes sm-fade-in {
               from {
                  opacity: 0;
               }
            }
         }
      `;
      const DISCRETE_PROPERTIES = /^(visibility|display|pointer-events|z-index|content-visibility|overlay)$/;
      const reducedMotionQuery = matchMedia("(prefers-reduced-motion: reduce)");
      const processedSheets = new WeakSet();
      const TIMING_PROPERTIES = ["transition-duration", "transition-delay", "transition-timing-function", "animation-duration", "animation-delay", "animation-timing-function"];
      const authoredTimings = new Map();
      const stats = { sheets: 0, rules: 0, transitions: 0, animations: 0, ms: 0 };

      function toMs(value) {
         const trimmed = value.trim();
         const isMilliseconds = trimmed.endsWith("ms");
         const number = parseFloat(trimmed);

         if (Number.isNaN(number)) {
            return 0;
         }

         return isMilliseconds ? number : number * 1000;
      }

      function splitList(value) {
         const items = [];
         let depth = 0;
         let current = "";

         for (const character of value) {
            const isSeparator = character === "," && depth === 0;

            if (isSeparator) {
               items.push(current.trim());
               current = "";
               continue;
            }

            if (character === "(") {
               depth++;
            }

            if (character === ")") {
               depth--;
            }

            current += character;
         }

         items.push(current.trim());
         return items;
      }

      function classify(selector) {
         for (const rule of CLASS_RULES) {
            if (rule.pattern.test(selector)) {
               return rule;
            }
         }

         return STATE_CLASS;
      }

      function isFixedCurve(easing) {
         const isLinear = easing === "linear" || easing.startsWith("linear(");
         const isStepped = easing.startsWith("steps") || easing === "step-start" || easing === "step-end";
         return isLinear || isStepped;
      }

      function rememberAuthoredTiming(style) {
         if (authoredTimings.has(style)) {
            return;
         }

         const timing = TIMING_PROPERTIES.map((property) => [property, style.getPropertyValue(property), style.getPropertyPriority(property)]);
         authoredTimings.set(style, timing);
      }

      function retimeForMotionPreference() {
         for (const [style, timing] of authoredTimings) {
            for (const [property, value, priority] of timing) {
               if (value === "") {
                  style.removeProperty(property);
               } else {
                  style.setProperty(property, value, priority);
               }
            }
         }

         for (const sheet of document.styleSheets) {
            if (!processedSheets.has(sheet)) {
               continue;
            }

            try {
               walkRules(sheet.cssRules);
            } catch (error) {
               continue;
            }
         }
      }

      function retimeTransition(style, selector) {
         const properties = splitList(style.getPropertyValue("transition-property"));
         const durations = splitList(style.getPropertyValue("transition-duration")).map(toMs);
         const delays = splitList(style.getPropertyValue("transition-delay") || "0s").map(toMs);
         const easings = splitList(style.getPropertyValue("transition-timing-function") || "ease");
         const priority = style.getPropertyPriority("transition-duration");
         const interactionClass = classify(selector);
         const preset = PRESETS[interactionClass.preset];
         const reduced = reducedMotionQuery.matches;
         const ceiling = reduced ? REDUCED_DURATION : preset.duration;
         let changed = false;

         const newDurations = properties.map((property, index) => {
            const duration = durations[index % durations.length];
            const easing = easings[index % easings.length];
            const delay = delays[index % delays.length];
            const isOverBudget = duration + delay > interactionClass.budget;
            const isProgressLike = isFixedCurve(easing) && !isOverBudget;

            if (isProgressLike && !reduced) {
               return duration;
            }

            const shouldClamp = isOverBudget || reduced;
            return shouldClamp ? Math.min(duration, ceiling) : duration;
         });

         const longest = Math.max(0, ...newDurations);

         const newDelays = properties.map((property, index) => {
            const delay = delays[index % delays.length];
            const isDiscrete = DISCRETE_PROPERTIES.test(property);

            if (isDiscrete) {
               return Math.min(delay, longest);
            }

            return 0;
         });

         const newEasings = properties.map((property, index) => {
            const easing = easings[index % easings.length];
            const isDiscrete = DISCRETE_PROPERTIES.test(property);
            const keepEasing = isFixedCurve(easing) || isDiscrete;
            return keepEasing ? easing : preset.easing;
         });

         const durationsChanged = newDurations.some((duration, index) => duration !== durations[index % durations.length]);
         const delaysChanged = newDelays.some((delay, index) => delay !== delays[index % delays.length]);
         const easingsChanged = newEasings.some((easing, index) => easing !== easings[index % easings.length]);

         if (durationsChanged || delaysChanged || easingsChanged) {
            rememberAuthoredTiming(style);
            style.setProperty("transition-duration", newDurations.map((value) => `${value}ms`).join(", "), priority);
            style.setProperty("transition-delay", newDelays.map((value) => `${value}ms`).join(", "), priority);
            style.setProperty("transition-timing-function", newEasings.join(", "), priority);
            changed = true;
         }

         return changed;
      }

      function retimeAnimation(style, selector) {
         const iterations = style.getPropertyValue("animation-iteration-count");
         const timeline = style.getPropertyValue("animation-timeline");
         const isAmbient = iterations.includes("infinite");
         const isScrollDriven = timeline !== "" && timeline !== "auto";

         if (isAmbient || isScrollDriven) {
            return false;
         }

         const durations = splitList(style.getPropertyValue("animation-duration")).map(toMs);
         const delays = splitList(style.getPropertyValue("animation-delay") || "0s").map(toMs);
         const easings = splitList(style.getPropertyValue("animation-timing-function") || "ease");
         const priority = style.getPropertyPriority("animation-duration");
         const interactionClass = classify(selector);
         const preset = PRESETS[interactionClass.preset];
         const reduced = reducedMotionQuery.matches;
         const ceiling = reduced ? REDUCED_DURATION : preset.duration;
         const isOverBudget = durations.some((duration, index) => duration + delays[index % delays.length] > interactionClass.budget);
         const hasDelay = delays.some((delay) => delay > 0);
         const isInteractive = interactionClass !== STATE_CLASS;
         const needsDelayFix = hasDelay && isInteractive;

         if (!isOverBudget && !needsDelayFix && !reduced) {
            return false;
         }

         rememberAuthoredTiming(style);
         style.setProperty("animation-duration", durations.map((value) => `${Math.min(value, ceiling)}ms`).join(", "), priority);

         const newDelays = delays.map((delay) => {
            const isAntiFlicker = delay >= ANTI_FLICKER_DELAY;

            if (isInteractive) {
               return 0;
            }

            return isAntiFlicker ? delay : Math.min(delay, MAX_STAGGER_DELAY);
         });

         style.setProperty("animation-delay", newDelays.map((value) => `${value}ms`).join(", "), priority);

         const newEasings = easings.map((easing) => (isFixedCurve(easing) ? easing : preset.easing));
         style.setProperty("animation-timing-function", newEasings.join(", "), priority);
         return true;
      }

      function walkRules(rules) {
         for (const rule of rules) {
            const hasChildren = rule.cssRules && !(rule instanceof CSSKeyframesRule);

            if (hasChildren) {
               walkRules(rule.cssRules);
            }

            const isStyleRule = rule instanceof CSSStyleRule;

            if (!isStyleRule) {
               continue;
            }

            stats.rules++;
            const style = rule.style;
            const hasTransition = style.getPropertyValue("transition-duration") !== "";
            const hasAnimation = style.getPropertyValue("animation-name") !== "" && style.getPropertyValue("animation-name") !== "none";

            if (hasTransition && retimeTransition(style, rule.selectorText)) {
               stats.transitions++;
            }

            if (hasAnimation && retimeAnimation(style, rule.selectorText)) {
               stats.animations++;
            }
         }
      }

      function isOwnSheet(sheet) {
         const owner = sheet.ownerNode;
         const isOwnStyle = owner && OWN_STYLE_IDS.has(owner.id);
         return Boolean(isOwnStyle);
      }

      function processSheet(sheet) {
         if (processedSheets.has(sheet) || isOwnSheet(sheet)) {
            return;
         }

         let rules;

         try {
            rules = sheet.cssRules;
         } catch (error) {
            return;
         }

         if (!rules) {
            return;
         }

         processedSheets.add(sheet);
         const started = performance.now();
         walkRules(rules);
         stats.sheets++;
         stats.ms += performance.now() - started;
      }

      function processAllSheets() {
         for (const sheet of document.styleSheets) {
            processSheet(sheet);
         }
      }

      function watchNewSheets() {
         const handleSheetMutations = (mutations) => {
            for (const mutation of mutations) {
               const isTopLevelTarget = mutation.target === document.head || mutation.target === document.body;

               if (!isTopLevelTarget || mutation.addedNodes.length === 0) {
                  continue;
               }

               for (const node of mutation.addedNodes) {
                  const isLink = node.tagName === "LINK";
                  const isStyle = node.tagName === "STYLE";

                  if (isLink) {
                     node.addEventListener("load", () => node.sheet && processSheet(node.sheet), { once: true });
                  }

                  if (isStyle && node.sheet) {
                     processSheet(node.sheet);
                  }
               }
            }
         };

         core.onHeadMutations(handleSheetMutations);
         core.onBodyMutations(handleSheetMutations);
      }

      function tokenCss() {
         const presetTokens = Object.entries(PRESETS).map(([name, preset]) => `
            --sm-${name}-ease: ${preset.easing};
            --sm-${name}-dur: ${preset.duration}ms;`).join("");

         return `
            :root.${ROOT_CLASS} {${presetTokens}
               --encore-productive: var(--sm-menu-ease);
               --encore-productive-decelerate: var(--sm-dialog-ease);
               --encore-productive-accelerate: var(--sm-hover-ease);
            }

            @media (prefers-reduced-motion: reduce) {
               :root.${ROOT_CLASS} {
                  --encore-short-1: ${REDUCED_DURATION}ms;
                  --encore-short-2: ${REDUCED_DURATION}ms;
               }
            }
         `;
      }

      function injectStyle() {
         const style = document.createElement("style");
         style.id = STYLE_ID;
         style.textContent = tokenCss() + FRAGMENT_CSS;
         document.head.appendChild(style);
      }

      function isAmbientLoop(animation) {
         const isRunning = animation.playState === "running";
         const isTimeBased = animation.timeline === document.timeline;
         const isEndless = animation.effect && animation.effect.getTiming().iterations === Infinity;
         const isMoving = animation.playbackRate !== 0;
         return isRunning && isTimeBased && isEndless && isMoving;
      }

      function restAmbientLoops() {
         const loops = document.getAnimations().filter(isAmbientLoop);

         for (const loop of loops) {
            restingLoops.set(loop, loop.playbackRate);
            loop.updatePlaybackRate(0);
         }
      }

      function wakeAmbientLoops() {
         for (const [loop, playbackRate] of restingLoops) {
            loop.updatePlaybackRate(playbackRate);
         }

         restingLoops.clear();
      }

      function isSteppedLoop(animation) {
         const timingEasing = animation.effect.getTiming().easing || "";
         const keyframes = animation.effect.getKeyframes ? animation.effect.getKeyframes() : [];
         const keyframeEasing = keyframes.length ? keyframes[0].easing || "" : "";
         return timingEasing.startsWith("steps(") || keyframeEasing.startsWith("steps(");
      }

      function adoptSteppedLoops() {
         const found = document.getAnimations()
            .filter((animation) => isAmbientLoop(animation) && isSteppedLoop(animation))
            .map((loop) => [loop, { playbackRate: loop.playbackRate, time: loop.currentTime, isSlow: loop.effect.getTiming().duration >= SLOW_LOOP_MS, lastWrite: 0 }]);

         const gone = [...tickedLoops.keys()].filter((loop) => {
            const target = loop.effect && loop.effect.target;
            return loop.playState === "idle" || !target || !target.isConnected;
         });

         for (const loop of gone) {
            tickedLoops.delete(loop);
         }

         for (const [loop, state] of found) {
            tickedLoops.set(loop, state);
            loop.updatePlaybackRate(0);
         }

         refreshPauseStates();
      }

      function refreshPauseStates() {
         for (const [loop, state] of tickedLoops) {
            state.isPausedByCss = loop.playState === "paused";
         }
      }

      function watchPauseClasses() {
         core.onRootAttributes((records) => {
            const hasClassChange = records.some((record) => record.attributeName === "class");

            if (hasClassChange) {
               requestAnimationFrame(refreshPauseStates);
            }
         });
      }

      function tickSteppedLoops() {
         const now = performance.now();
         const elapsed = now - lastAmbientTick;
         lastAmbientTick = now;

         for (const [loop, state] of tickedLoops) {
            const isAdvancing = !state.isPausedByCss && state.time !== null;

            if (!isAdvancing) {
               continue;
            }

            state.time += elapsed * state.playbackRate;
            const isSlowLoopResting = state.isSlow && now - state.lastWrite < SLOW_LOOP_TICK_MS;

            if (isSlowLoopResting) {
               continue;
            }

            state.lastWrite = now;
            loop.currentTime = state.time;
         }
      }

      function requestAmbientTick() {
         let hasAdvancingLoop = false;

         for (const state of tickedLoops.values()) {
            if (!state.isPausedByCss && state.time !== null) {
               hasAdvancingLoop = true;
               break;
            }
         }

         if (!hasAdvancingLoop) {
            lastAmbientTick = performance.now();
            return;
         }

         requestAnimationFrame(tickSteppedLoops);
      }

      function startAmbientTicker() {
         const isTicking = ambientTickTimer !== null;
         const isOff = !isEnabled(AMBIENT_TICKER_CLASS);

         if (isTicking || isOff) {
            return;
         }

         adoptSteppedLoops();
         lastAmbientTick = performance.now();
         ambientTickTimer = setInterval(requestAmbientTick, AMBIENT_TICK_MS);
         ambientScanTimer = setInterval(adoptSteppedLoops, AMBIENT_SCAN_MS);
      }

      function stopAmbientTicker() {
         clearInterval(ambientTickTimer);
         clearInterval(ambientScanTimer);
         ambientTickTimer = null;
         ambientScanTimer = null;
      }

      function releaseSteppedLoops() {
         stopAmbientTicker();

         for (const [loop, state] of tickedLoops) {
            loop.updatePlaybackRate(state.playbackRate);
         }

         tickedLoops.clear();
      }

      function watchWindowFocus() {
         if (!REST_WHEN_UNFOCUSED) {
            return;
         }

         const root = document.documentElement;

         const rest = () => {
            root.classList.add(RESTING_CLASS);
            stopAmbientTicker();
            restAmbientLoops();
            clearInterval(restScanTimer);
            restScanTimer = setInterval(restAmbientLoops, AMBIENT_SCAN_MS);
         };

         const wake = () => {
            root.classList.remove(RESTING_CLASS);
            clearInterval(restScanTimer);
            restScanTimer = null;
            wakeAmbientLoops();
            startAmbientTicker();
         };

         window.addEventListener("blur", rest);
         window.addEventListener("focus", wake);

         if (document.hasFocus()) {
            startAmbientTicker();
         } else {
            rest();
         }
      }

      function isEnabled(className) {
         return document.documentElement.classList.contains(className);
      }

      function isSpicetifyReady() {
         return Boolean(window.Spicetify && Spicetify.Player && Spicetify.Player.addEventListener && Spicetify.Platform && Spicetify.Platform.History);
      }

      function currentScale(animation, from, to) {
         const progress = animation.effect.getComputedTiming().progress;
         const hasProgress = typeof progress === "number";
         return hasProgress ? from + (to - from) * progress : to;
      }

      function watchPressDepth() {
         document.addEventListener("pointerdown", (event) => {
            const target = event.target.closest && event.target.closest(PRESS_TARGETS);
            const isPrimary = event.button === 0;
            const isSkipped = target && target.matches(PRESS_SKIPPED);
            const shouldSkip = !isEnabled(PRESS_DEPTH_CLASS) || !isPrimary || !target || isSkipped || reducedMotionQuery.matches;

            if (shouldSkip) {
               return;
            }

            const isButton = target.matches("button, [role='button']");
            const depth = isButton ? BUTTON_PRESS_SCALE : ROW_PRESS_SCALE;
            const running = pressAnimations.get(target);
            const startScale = running ? currentScale(running.animation, running.from, running.to) : 1;

            if (running) {
               running.animation.cancel();
            }

            const down = target.animate({ scale: [startScale, depth] }, { duration: PRESETS.press.duration, easing: PRESETS.press.easing, fill: "forwards" });
            pressAnimations.set(target, { animation: down, from: startScale, to: depth });

            const release = () => {
               removeEventListener("pointerup", release, true);
               removeEventListener("pointercancel", release, true);
               const pressedScale = currentScale(down, startScale, depth);
               down.cancel();
               const up = target.animate({ scale: [pressedScale, 1] }, { duration: PRESETS.release.duration, easing: PRESETS.release.easing });
               pressAnimations.set(target, { animation: up, from: pressedScale, to: 1 });
               up.finished.then(() => pressAnimations.delete(target), () => {});
            };

            addEventListener("pointerup", release, true);
            addEventListener("pointercancel", release, true);
         }, true);
      }

      function revealAddedItems(mutations) {
         if (revealCount >= REVEAL_LIMIT) {
            return;
         }

         const reduced = reducedMotionQuery.matches;

         for (const mutation of mutations) {
            if (mutation.addedNodes.length === 0) {
               continue;
            }

            for (const node of mutation.addedNodes) {
               const isElement = node.nodeType === Node.ELEMENT_NODE;
               const hasRoom = revealCount < REVEAL_LIMIT;

               if (!isElement || !hasRoom) {
                  continue;
               }

               const items = node.matches(REVEAL_TARGETS) ? [node] : node.querySelectorAll(REVEAL_TARGETS);

               for (const item of items) {
                  const isFresh = !revealedItems.has(item);
                  const stillHasRoom = revealCount < REVEAL_LIMIT;

                  if (!isFresh || !stillHasRoom) {
                     continue;
                  }

                  revealedItems.add(item);
                  const keyframes = reduced ? { opacity: [REVEAL_START_OPACITY, 1] } : { opacity: [REVEAL_START_OPACITY, 1], translate: ["0 6px", "0 0"] };
                  const delay = reduced ? 0 : Math.min(revealCount * MAX_STAGGER_DELAY / 3, MAX_REVEAL_DELAY);
                  revealAnimations.push(item.animate(keyframes, { duration: REVEAL_DURATION, easing: PRESETS.view.easing, delay, fill: "backwards" }));
                  revealCount++;
               }
            }
         }
      }

      function watchRouteReveal() {
         const observer = new MutationObserver(revealAddedItems);
         let stopTimer = 0;

         core.onRoute(() => {
            if (!isEnabled(ROUTE_REVEAL_CLASS)) {
               return;
            }

            const mainView = document.querySelector(".main-view-container");

            if (!mainView) {
               return;
            }

            revealAnimations.forEach((animation) => animation.cancel());
            revealAnimations = [];
            revealCount = 0;
            observer.disconnect();
            observer.observe(mainView, { childList: true, subtree: true });
            clearTimeout(stopTimer);
            stopTimer = setTimeout(() => observer.disconnect(), REVEAL_WINDOW);
         });
      }

      function watchCoverSettle() {
         let coverAnimation = null;

         core.onPlayer("songchange", () => {
            if (!isEnabled(COVER_SETTLE_CLASS)) {
               return;
            }

            setTimeout(() => {
               const image = document.querySelector(COVER_SELECTOR);
               const cover = image && image.parentElement;

               if (!cover) {
                  return;
               }

               if (coverAnimation) {
                  coverAnimation.cancel();
               }

               const reduced = reducedMotionQuery.matches;
               const keyframes = reduced ? { opacity: [0.5, 1] } : { scale: [0.94, 1], opacity: [0.5, 1] };
               const timing = reduced ? { duration: REDUCED_DURATION } : { duration: PRESETS.lively.duration, easing: PRESETS.lively.easing };
               coverAnimation = cover.animate(keyframes, timing);
            }, 60);
         });
      }

      function watchColorFlow() {
         if (COLOR_FLOW_STEPS <= 0) {
            return;
         }

         const root = document.documentElement;
         const readInline = () => PALETTE_PROPERTIES.map((property) => root.style.getPropertyValue(property).trim());
         let palette = readInline();
         let flowAnimation = null;

         core.onRootAttributes((records) => {
            const hasStyleChange = records.some((record) => record.attributeName === "style");

            if (!hasStyleChange) {
               return;
            }

            const nextPalette = readInline();
            const hasChanged = nextPalette.some((color, index) => color !== palette[index]);

            if (!hasChanged) {
               return;
            }

            const isFlowing = Boolean(flowAnimation) && flowAnimation.playState === "running";
            const startPalette = isFlowing ? PALETTE_PROPERTIES.map((property) => getComputedStyle(root).getPropertyValue(property).trim()) : palette;
            const isComplete = nextPalette.every(Boolean) && startPalette.every(Boolean);
            const hasSteps = COLOR_FLOW_STEPS > 0;
            const shouldFlow = isEnabled(COLOR_FLOW_CLASS) && hasSteps && isComplete && !reducedMotionQuery.matches;
            palette = nextPalette;

            if (flowAnimation) {
               flowAnimation.cancel();
               flowAnimation = null;
            }

            if (!shouldFlow) {
               return;
            }

            const toFrame = (colors) => Object.fromEntries(PALETTE_PROPERTIES.map((property, index) => [property, colors[index]]));
            flowAnimation = root.animate([toFrame(startPalette), toFrame(nextPalette)], { duration: PRESETS.crossfade.duration, easing: `steps(${COLOR_FLOW_STEPS})` });
         });
      }

      function watchGlassLight() {
         const layer = document.createElement("div");
         const leaf = document.createElement("div");
         const spark = document.createElement("div");
         let panel = null;
         let sparkAnimation = null;

         layer.id = LIGHT_LAYER_ID;
         leaf.className = "sm-light-leaf";
         spark.className = "sm-light-spark";
         layer.append(leaf, spark);
         document.body.appendChild(layer);

         function clipToPanel() {
            const bounds = panel.getBoundingClientRect();
            const radius = getComputedStyle(panel).borderTopLeftRadius;
            layer.style.clipPath = `inset(${bounds.top}px ${innerWidth - bounds.right}px ${innerHeight - bounds.bottom}px ${bounds.left}px round ${radius})`;
         }

         const panelResizeObserver = new ResizeObserver(() => panel && clipToPanel());

         function setPanel(nextPanel) {
            if (nextPanel === panel) {
               return;
            }

            panelResizeObserver.disconnect();
            panel = nextPanel;
            layer.classList.toggle("is-lit", Boolean(panel));

            if (panel) {
               clipToPanel();
               panelResizeObserver.observe(panel);
            }
         }

         function panelUnder(target) {
            const isLightOn = isEnabled(SPECULAR_CLASS) || isEnabled(PRESS_LIGHT_CLASS);
            const canSearch = typeof target.closest === "function";
            const isOverFloatingGlass = canSearch && Boolean(target.closest(FLOATING_GLASS));
            const shouldStayDark = !isLightOn || !canSearch || isOverFloatingGlass || reducedMotionQuery.matches;

            if (shouldStayDark) {
               return null;
            }

            return target.closest(GLASS_PANELS);
         }

         let latestMove = null;
         let moveScheduled = false;

         function followPointer() {
            const event = latestMove;
            moveScheduled = false;
            setPanel(panelUnder(event.target));

            if (!panel) {
               return;
            }

            leaf.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
         }

         document.addEventListener("pointermove", (event) => {
            latestMove = event;

            if (moveScheduled) {
               return;
            }

            moveScheduled = true;
            requestAnimationFrame(followPointer);
         }, { passive: true });

         document.addEventListener("pointerdown", (event) => {
            setPanel(panelUnder(event.target));

            const isPrimary = event.button === 0;
            const shouldLight = isEnabled(PRESS_LIGHT_CLASS) && isPrimary && Boolean(panel);

            if (!shouldLight) {
               return;
            }

            const startOpacity = sparkAnimation ? Number(getComputedStyle(spark).opacity) : 0;

            if (sparkAnimation) {
               sparkAnimation.cancel();
            }

            spark.style.translate = `${event.clientX}px ${event.clientY}px`;
            sparkAnimation = spark.animate({ opacity: [startOpacity, 1], scale: [0.55, 1] }, { duration: PRESETS.press.duration, easing: PRESETS.press.easing, fill: "forwards" });

            const release = () => {
               removeEventListener("pointerup", release, true);
               removeEventListener("pointercancel", release, true);
               if (sparkAnimation) {
                  sparkAnimation.cancel();
               }

               sparkAnimation = spark.animate({ opacity: [1, 0], scale: [1, 1.35] }, { duration: PRESETS.release.duration, easing: PRESETS.hover.easing });
               sparkAnimation.finished.then(() => (sparkAnimation = null), () => {});
            };

            addEventListener("pointerup", release, true);
            addEventListener("pointercancel", release, true);
         }, true);

         document.documentElement.addEventListener("pointerleave", () => setPanel(null), { passive: true });
         window.addEventListener("blur", () => setPanel(null));

         window.addEventListener("resize", () => {
            if (panel) {
               clipToPanel();
            }
         }, { passive: true });
      }

      function start() {
         document.documentElement.classList.add(ROOT_CLASS, AMBIENT_TICKER_CLASS, ...ELEVATIONS);
         injectStyle();
         processAllSheets();
         watchNewSheets();
         watchPressDepth();
         watchGlassLight();
         watchColorFlow();
         watchPauseClasses();
         core.whenReady("spotifyMotion focus", isSpicetifyReady, watchWindowFocus);
         watchRouteReveal();
         watchCoverSettle();
         reducedMotionQuery.addEventListener("change", retimeForMotionPreference);
         core.exports.spotifyMotion = { stats, processAllSheets, PRESETS, tickedLoops, releaseSteppedLoops };
      }

      core.whenReady("spotifyMotion", () => Boolean(document.head && document.body), start);
   }

   function styleEngine(core) {
      const OWN_STYLE_IDS = new Set([
         "album-ambience",
         "ambience-ripple",
         "comfy-tweaks",
         "folder-images",
         "library-header",
         "library-hider",
         "library-moods",
         "library-picker",
         "liquid-glass",
         "liquid-glass-flow",
         "liquid-glass-home-chips",
         "liquid-glass-npv-cards",
         "player-glass",
         "search-glass",
         "spotify-motion",
      ]);
      // Past this many matches a fragment is a family name, and the :is() list costs more than the substring test.
      const MAX_CLASSES_PER_FRAGMENT = 12;
      const CLASS_SUBSTRING = /\[class\*=(["']?)([^"'\]]+)\1\]/g;
      const CLASS_TOKEN = /\.(-?[_a-zA-Z][\w-]*)/g;

      const originalSelectors = new WeakMap();
      const compiledRules = new Set();
      const stats = { compiled: 0, skipped: new Set(), passes: 0 };
      let knownClasses = new Set();
      let knownSheetCount = -1;
      let passQueued = false;
      let resolvedFragments = new Map();
      const dirtySheets = new Set();
      let isFullPassDue = true;
      let isReleased = false;

      function isOwnSheet(sheet) {
         return OWN_STYLE_IDS.has(sheet.ownerNode?.id);
      }

      function readRules(sheet) {
         try {
            return sheet.cssRules;
         } catch {
            return null;
         }
      }

      function collectSelectorClasses(rules, into) {
         for (const rule of rules) {
            if (rule.selectorText) {
               for (const match of rule.selectorText.matchAll(CLASS_TOKEN)) {
                  into.add(match[1]);
               }
            }

            if (rule.cssRules) {
               collectSelectorClasses(rule.cssRules, into);
            }
         }
      }

      function refreshKnownClasses() {
         const spotifySheets = [...document.styleSheets].filter((sheet) => !isOwnSheet(sheet));

         if (spotifySheets.length === knownSheetCount) {
            return false;
         }

         const classes = new Set();

         for (const sheet of spotifySheets) {
            const rules = readRules(sheet);

            if (rules) {
               collectSelectorClasses(rules, classes);
            }
         }

         knownSheetCount = spotifySheets.length;
         const hasChanged = classes.size !== knownClasses.size;
         knownClasses = classes;

         if (hasChanged) {
            resolvedFragments = new Map();
            stats.skipped.clear();
         }

         return hasChanged;
      }

      // A class only seen in the DOM may belong to a chunk whose CSS has not loaded, so the fragment stays a substring test.
      function hasUnknownDomClass(fragment) {
         for (const element of document.querySelectorAll(`[class*="${CSS.escape(fragment)}"]`)) {
            for (const name of element.classList) {
               const isMissing = name.includes(fragment) && !knownClasses.has(name);

               if (isMissing) {
                  return true;
               }
            }
         }

         return false;
      }

      function resolveFragment(fragment) {
         const classes = [...knownClasses].filter((name) => name.includes(fragment));
         const isResolvable = classes.length > 0 && classes.length <= MAX_CLASSES_PER_FRAGMENT && !hasUnknownDomClass(fragment);

         if (!isResolvable) {
            stats.skipped.add(fragment);
            return null;
         }

         return `:is(${classes.map((name) => "." + CSS.escape(name)).join(", ")})`;
      }

      function compileSelector(selector) {
         const resolved = resolvedFragments;
         let isComplete = true;

         const compiled = selector.replace(CLASS_SUBSTRING, (whole, quote, fragment) => {
            if (!resolved.has(fragment)) {
               resolved.set(fragment, resolveFragment(fragment));
            }

            const replacement = resolved.get(fragment);

            if (!replacement) {
               isComplete = false;
               return whole;
            }

            return replacement;
         });

         return isComplete ? compiled : null;
      }

      function compileRules(rules) {
         for (const rule of rules) {
            if (rule.cssRules && !rule.selectorText) {
               compileRules(rule.cssRules);
               continue;
            }

            const original = originalSelectors.get(rule) ?? rule.selectorText;
            const hasSubstring = Boolean(original) && original.includes("[class*=");

            if (!hasSubstring) {
               continue;
            }

            const compiled = compileSelector(original);
            originalSelectors.set(rule, original);
            rule.selectorText = compiled ?? original;

            if (compiled) {
               compiledRules.add(rule);
            } else {
               compiledRules.delete(rule);
            }
         }
      }

      function compileAll() {
         passQueued = false;

         if (isReleased) {
            return;
         }

         const hasNewClasses = refreshKnownClasses();
         const isFullPass = isFullPassDue || hasNewClasses;
         const sheets = isFullPass ? [...document.styleSheets].filter(isOwnSheet) : [...dirtySheets].map((node) => node.sheet).filter(Boolean);
         isFullPassDue = false;
         dirtySheets.clear();

         for (const sheet of sheets) {
            const rules = readRules(sheet);

            if (rules) {
               compileRules(rules);
            }
         }

         for (const rule of compiledRules) {
            if (!rule.parentStyleSheet) {
               compiledRules.delete(rule);
            }
         }

         stats.compiled = compiledRules.size;
         stats.passes++;
      }

      function queuePass() {
         if (passQueued) {
            return;
         }

         passQueued = true;
         setTimeout(compileAll, 0);
      }

      function isStyleNode(node) {
         return node.nodeName === "STYLE" || node.nodeName === "LINK";
      }

      function noteStyleChange(record) {
         const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
         const editsOwnStyle = target?.nodeName === "STYLE" && OWN_STYLE_IDS.has(target.id);
         let hasAddedStyle = false;

         if (editsOwnStyle) {
            dirtySheets.add(target);
         }

         for (const node of record.addedNodes) {
            if (!isStyleNode(node)) {
               continue;
            }

            hasAddedStyle = true;

            if (OWN_STYLE_IDS.has(node.id)) {
               dirtySheets.add(node);
            }
         }

         return editsOwnStyle || hasAddedStyle;
      }

      function watchStyles() {
         core.onHeadMutations((records) => {
            const changed = records.map(noteStyleChange).some(Boolean);

            if (changed) {
               queuePass();
            }
         });

         document.addEventListener("load", (event) => {
            const isStylesheet = event.target?.nodeName === "LINK";

            if (isStylesheet) {
               queuePass();
            }
         }, true);
      }

      function start() {
         watchStyles();
         compileAll();

         core.exports.styleEngine = {
            stats: () => ({ compiled: stats.compiled, skipped: [...stats.skipped], passes: stats.passes, knownClasses: knownClasses.size }),
            recompile: () => {
               isReleased = false;
               isFullPassDue = true;
               compileAll();
            },
            release: () => {
               isReleased = true;

               for (const rule of compiledRules) {
                  rule.selectorText = originalSelectors.get(rule);
               }

               compiledRules.clear();
            },
         };
      }

      core.whenReady("styleEngine", () => Boolean(document.head), start);
   }

   const modules = [albumAmbience, comfyTweaks, folderImages, libraryHider, libraryMoods, libraryOrder, libraryPicker, liquidGlass, playerGlass, searchGlass, spotifyMotion, styleEngine];

   modules.forEach((module) => core.runSafely(module.name, module, core));
   window.Arsked = core.exports;
})();
