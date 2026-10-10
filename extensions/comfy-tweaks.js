(function comfyTweaks() {
   const style = document.createElement("style");
   style.id = "comfy-tweaks";
   style.textContent = `
      :root .global-nav .Root__top-container {
         grid-template-rows: auto max(48px, var(--comfy-topbar-height, 64px) / var(--zoom, 1) - 16px) minmax(0, 1fr) auto !important;
      }

      :root #main .Root {
         height: calc(100% + 16px) !important;
      }

      :root #main .Root__now-playing-bar,
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

      :root #main .Root__now-playing-bar .main-addButton-button.control-button-heart {
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

      :root #main .Root__now-playing-bar .main-addButton-button.control-button-heart[aria-checked="false"] :not([fill="none"]) {
         fill: currentColor !important;
      }
      :root #main .Root__globalNav {
         --topbar-control: 36px;
         --topbar-surface: rgba(var(--spice-rgb-text), 0.06);
         --topbar-surface-hover: rgba(var(--spice-rgb-text), 0.11);
         --topbar-hairline: rgba(var(--spice-rgb-text), 0.08);
         background: transparent !important;
         padding: 0 14px !important;
         align-items: center !important;
      }

      :root #main .Root__globalNav button {
         transition: background-color 160ms ease, color 160ms ease, transform 120ms ease, opacity 160ms ease !important;
      }

      :root #main .Root__globalNav button:active {
         transform: scale(0.94);
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

      :root #main .Root__globalNav button[aria-label="Marketplace"],
      :root #main .Root__globalNav button[aria-label="Home"],
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

      :root #main .Root__globalNav button[aria-label="Marketplace"]:hover,
      :root #main .Root__globalNav button[aria-label="Home"]:hover,
      :root #main .main-globalNav-contentRight button[aria-label]:hover {
         background: var(--topbar-surface-hover) !important;
         color: var(--spice-text) !important;
      }

      :root #main .Root__globalNav button[aria-label="Marketplace"] svg,
      :root #main .Root__globalNav button[aria-label="Home"] svg,
      :root #main .main-globalNav-contentRight button[aria-label] svg {
         width: 20px !important;
         height: 20px !important;
      }

      :root #main .main-globalNav-searchContainer {
         align-items: center !important;
         gap: 8px;
      }

      :root #main .Root__globalNav button[aria-label="Home"] {
         width: 40px !important;
         height: 40px !important;
         background: var(--topbar-surface) !important;
         box-shadow: inset 0 0 0 1px var(--topbar-hairline) !important;
      }

      :root #main .main-globalNav-searchInputSection {
         padding: 0 !important;
         align-items: center !important;
      }

      :root #main .main-globalNav-searchInputSection form {
         height: 40px !important;
         align-items: center !important;
      }

      :root #main .main-globalNav-searchInputSection input {
         height: 40px !important;
         border-radius: 999px !important;
         background: var(--topbar-surface) !important;
         box-shadow: inset 0 0 0 1px var(--topbar-hairline) !important;
         border: none !important;
         padding-left: 44px !important;
         font-size: 14px !important;
         transition: background-color 160ms ease, box-shadow 160ms ease !important;
      }

      :root #main .main-globalNav-searchInputSection input:hover {
         background: var(--topbar-surface-hover) !important;
      }

      :root #main .main-globalNav-searchInputSection input:focus {
         background: var(--topbar-surface-hover) !important;
         box-shadow: inset 0 0 0 1px rgba(var(--spice-rgb-button), 0.55), 0 0 0 3px rgba(var(--spice-rgb-button), 0.14) !important;
      }

      :root #main .main-globalNav-searchInputSection input::placeholder {
         color: var(--spice-subtext) !important;
         opacity: 0.75;
      }

      :root #main .main-globalNav-searchInputSection button[aria-label="Search"] {
         height: 40px !important;
         width: 44px !important;
         color: var(--spice-subtext) !important;
      }

      :root #main .main-globalNav-searchInputSection button[aria-label="Browse"] {
         color: var(--spice-subtext) !important;
      }

      :root #main .main-globalNav-searchInputSection button[aria-label="Browse"]:hover {
         color: var(--spice-text) !important;
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
         transition: filter 160ms ease, opacity 160ms ease;
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

      :root #main .main-globalNav-searchInputSection button svg,
      :root #main .main-globalNav-historyButtons button svg {
         width: 20px !important;
         height: 20px !important;
      }

      :root #main .main-globalNav-searchInputSection button[aria-label="Clear search field"] svg {
         width: 16px !important;
         height: 16px !important;
      }

      :root #main .main-globalNav-searchInputSection input {
         min-height: 40px !important;
         line-height: 40px !important;
         padding-top: 0 !important;
         padding-bottom: 0 !important;
      }

      :root #main .main-globalNav-searchInputWrapper {
         height: 40px !important;
      }

      :root #main .Root__globalNav button[aria-label="Marketplace"] {
         background: var(--topbar-surface) !important;
         box-shadow: inset 0 0 0 1px var(--topbar-hairline) !important;
      }

      :root #main .custom-navlinks-scrollable_container {
         display: flex;
         align-items: center;
      }

      :root #main .Root__now-playing-bar {
         --player-ease: cubic-bezier(0.22, 1, 0.36, 1);
         --player-hairline: rgba(var(--spice-rgb-text), 0.07);
         --player-subdued: rgba(var(--spice-rgb-subtext), 0.85);
      }

      :root #main .Root__now-playing-bar aside[aria-label="Now playing bar"] {
         height: 72px !important;
         border-radius: 14px !important;
         background: linear-gradient(to bottom,
            rgba(var(--spice-rgb-main), 0.62),
            rgba(var(--spice-rgb-main), 0.78)) !important;
         backdrop-filter: blur(28px) saturate(1.4) !important;
         box-shadow: inset 0 1px 0 var(--player-hairline), 0 -6px 24px rgba(0, 0, 0, 0.18) !important;
         overflow: hidden !important;
      }

      :root #main .Root__now-playing-bar .main-nowPlayingBar-nowPlayingBar {
         display: grid !important;
         grid-template-columns: minmax(180px, 1fr) minmax(360px, 1.6fr) minmax(180px, 1fr) !important;
         align-items: center !important;
         column-gap: 24px !important;
         height: 100% !important;
         padding: 0 16px 0 10px !important;
      }

      :root #main .Root__now-playing-bar .main-nowPlayingBar-left,
      :root #main .Root__now-playing-bar .main-nowPlayingBar-center,
      :root #main .Root__now-playing-bar .main-nowPlayingBar-right {
         width: auto !important;
         min-width: 0 !important;
         height: auto !important;
      }

      :root #main .Root__now-playing-bar .main-nowPlayingWidget-nowPlaying {
         height: 56px !important;
         gap: 12px !important;
         padding: 0 !important;
         align-items: center !important;
      }

      :root #main .Root__now-playing-bar .main-coverSlotCollapsed-container,
      :root #main .Root__now-playing-bar .main-coverSlotCollapsed-container > div,
      :root #main .Root__now-playing-bar .main-nowPlayingWidget-coverArtContainer,
      :root #main .Root__now-playing-bar .main-nowPlayingWidget-coverArt,
      :root #main .Root__now-playing-bar .main-nowPlayingWidget-coverArt .cover-art,
      :root #main .Root__now-playing-bar .main-nowPlayingWidget-coverArt .cover-art-image {
         width: 56px !important;
         height: 56px !important;
         min-width: 0 !important;
         min-height: 0 !important;
         margin: 0 !important;
         inset: auto !important;
      }

      :root #main .Root__now-playing-bar .main-nowPlayingWidget-coverArt .cover-art,
      :root #main .Root__now-playing-bar .main-nowPlayingWidget-coverArt .cover-art-image {
         inset: 0 !important;
      }

      :root #main .Root__now-playing-bar .main-nowPlayingWidget-coverArtContainer,
      :root #main .Root__now-playing-bar .main-nowPlayingWidget-coverArt {
         border-radius: 50% !important;
         overflow: visible !important;
         box-shadow: none !important;
      }

      :root #main .Root__now-playing-bar .main-nowPlayingWidget-coverArt {
         clip-path: circle(50%) !important;
      }

      :root #main .Root__now-playing-bar .main-nowPlayingWidget-coverArtContainer {
         filter: none !important;
      }

      :root #main .Root__now-playing-bar .main-nowPlayingWidget-coverArt .cover-art-icon {
         width: 18px !important;
         height: 18px !important;
      }

      :root #main .Root__now-playing-bar .main-nowPlayingWidget-trackInfo {
         gap: 1px !important;
         margin: 0 !important;
         padding: 0 !important;
         min-width: 0 !important;
         justify-content: center !important;
      }

      :root #main .Root__now-playing-bar .main-trackInfo-name,
      :root #main .Root__now-playing-bar .main-trackInfo-name * {
         font-size: 14px !important;
         font-weight: 600 !important;
         line-height: 18px !important;
         letter-spacing: -0.005em !important;
      }

      :root #main .Root__now-playing-bar .main-trackInfo-artists,
      :root #main .Root__now-playing-bar .main-trackInfo-artists * {
         font-size: 12px !important;
         line-height: 16px !important;
         color: var(--player-subdued) !important;
      }

      :root #main .Root__now-playing-bar .main-nowPlayingWidget-trackInfo > div:last-child:not(.main-trackInfo-artists),
      :root #main .Root__now-playing-bar .main-nowPlayingWidget-trackInfo > div:last-child:not(.main-trackInfo-artists) * {
         font-size: 10.5px !important;
         line-height: 14px !important;
         letter-spacing: 0.06em !important;
         text-transform: uppercase !important;
         color: rgba(var(--spice-rgb-subtext), 0.6) !important;
      }

      :root #main .Root__now-playing-bar .dj-info-now-playing {
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
         transition: opacity 600ms ease;
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
         transition: background-color 180ms var(--glass-ease), transform 220ms var(--glass-ease) !important;
      }

      :root #main .Root__right-sidebar aside [aria-label="Current device"] button:hover {
         background: rgba(var(--spice-rgb-text), 0.14) !important;
         transform: translateY(-1px);
      }

      :root #main .Root__right-sidebar aside [data-testid="system-audio-outputs-list"] > div > div,
      :root #main .Root__right-sidebar aside [data-testid="list-row-external-link"] {
         margin: 2px 0 !important;
         border-radius: 12px !important;
         transition: background-color 180ms var(--glass-ease), box-shadow 180ms var(--glass-ease) !important;
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
         transition: background-color 180ms var(--glass-ease), box-shadow 180ms var(--glass-ease) !important;
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

      :root #main .Root__now-playing-bar .main-nowPlayingWidget-actionButtonWrapper,
      :root #main .Root__now-playing-bar .main-nowPlayingWidget-nowPlaying > button {
         flex-shrink: 0 !important;
      }

      :root #main .Root__now-playing-bar .main-nowPlayingBar-center .player-controls {
         gap: 6px !important;
      }

      :root #main .Root__now-playing-bar .player-controls__buttons {
         gap: 14px !important;
         margin: 0 !important;
      }

      :root #main .Root__now-playing-bar .player-controls__left,
      :root #main .Root__now-playing-bar .player-controls__right {
         gap: 14px !important;
      }

      :root #main .Root__now-playing-bar button {
         transition: color 180ms var(--player-ease), background-color 180ms var(--player-ease), transform 220ms var(--player-ease), opacity 180ms var(--player-ease) !important;
      }

      :root #main .Root__now-playing-bar button:active {
         transform: scale(0.92) !important;
      }

      :root #main .Root__now-playing-bar .player-controls__buttons > button[aria-label="Play"],
      :root #main .Root__now-playing-bar .player-controls__buttons > button[aria-label="Pause"] {
         width: 36px !important;
         height: 36px !important;
         border-radius: 50% !important;
         box-shadow: 0 4px 14px rgba(var(--spice-rgb-button), 0.35) !important;
      }

      :root #main .Root__now-playing-bar .player-controls__buttons > button[aria-label="Play"]:hover,
      :root #main .Root__now-playing-bar .player-controls__buttons > button[aria-label="Pause"]:hover {
         transform: scale(1.06) !important;
      }

      :root #main .Root__now-playing-bar .player-controls__buttons > button[aria-label="Play"] > *,
      :root #main .Root__now-playing-bar .player-controls__buttons > button[aria-label="Pause"] > * {
         border-radius: 50% !important;
         width: 100% !important;
         height: 100% !important;
      }

      :root #main .Root__now-playing-bar .playback-bar {
         gap: 10px !important;
      }

      :root #main .Root__now-playing-bar .playback-bar > div:first-child,
      :root #main .Root__now-playing-bar .playback-bar > div:last-child {
         min-width: 36px !important;
         width: 36px !important;
         font-size: 11px !important;
         font-variant-numeric: tabular-nums !important;
         color: rgba(var(--spice-rgb-subtext), 0.7) !important;
      }

      :root #main .Root__now-playing-bar .playback-bar > div:first-child {
         text-align: right !important;
      }

      :root #main .Root__now-playing-bar .playback-bar > div:last-child {
         text-align: left !important;
      }

      :root #main .Root__now-playing-bar .playback-progressbar {
         --progress-bar-height: 4px !important;
         --progress-bar-radius: 999px !important;
      }

      :root #main .Root__now-playing-bar .playback-progressbar [data-testid="progress-bar-background"],
      :root #main .Root__now-playing-bar .playback-progressbar .x-progressBar-progressBarBg {
         transition: height 200ms var(--player-ease) !important;
      }

      :root #main .Root__now-playing-bar .main-nowPlayingBar-right,
      :root #main .Root__now-playing-bar .main-nowPlayingBar-extraControls {
         justify-content: flex-end !important;
         gap: 6px !important;
      }

      :root #main .Root__now-playing-bar .main-nowPlayingBar-volumeBar {
         flex: 0 1 132px !important;
         gap: 4px !important;
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

   function install() {
      if (!document.head) {
         setTimeout(install, 100);
         return;
      }

      document.head.appendChild(style);
   }

   install();
})();
