(function albumAmbience() {
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
   const RIPPLE_DURATION_MS = 1100;
   const BEAT_GLOW_MS = 380;
   const BAR_BREATH_MS = 900;
   // Stepped timing keeps these at 15 to 30 fps. Smooth easing recomposites the whole window every frame.
   const SPIN_STEPS = 180;
   const BEAT_GLOW_STEPS = 11;
   const BAR_BREATH_STEPS = 14;
   const BAR_MATCH_SECONDS = 0.05;
   const BACKDROP_OPACITY = 0.42;
   const PLAY_BUTTON_SELECTOR = ".player-controls [data-testid='control-button-playpause']";
   const BACKDROP_SIZE = 72;
   const BACKDROP_BLUR_PX = 5;
   const LYRICS_CONTAINER_SELECTOR = "[style*='--lyrics-color-active']";
   const LYRICS_SCOPE = `:root #main ${LYRICS_CONTAINER_SELECTOR}:not(.Root__right-sidebar *)`;
   const LYRIC_LINE_SELECTOR = "div[dir='auto']";
   const ACTIVE_LYRIC_TIMELINE = "--scroll-to-viewport-button-anim";
   const STICKY_BAR_SELECTOR = `:is(div[style*="--background-base:"]:not(.main-entityHeader-backgroundColor, .main-entityHeader-metaData, .playlist-playlist-actionBarBackground-background), main > div > div > div[style*="opacity"]:empty)`;
   const LYRICS_HOST_ATTRIBUTE = "data-ambience-lyrics-host";
   const LYRICS_PANEL_ATTRIBUTE = "data-ambience-lyrics-panel";
   const LYRICS_HOST_SELECTOR = ".main-actionBar-ActionBarContainer, .main-view-container__scroll-node";
   const CINEMA_CONTAINER_SELECTOR = "[style*='--cinema-mode-bg-color-from']";

   let schemeColors = null;
   let activeLyricClass = null;
   let hasRippled = false;
   let beatTrack = null;
   let beatTimer = null;

   const ripple = document.createElement("div");
   ripple.id = "ambience-ripple";
   let requestToken = 0;
   let visibleLayer = "a";

   const style = document.createElement("style");
   style.id = "album-ambience";
   style.textContent = `
      :root #main .Root__top-container {
         isolation: isolate;
      }

      :root #main .Root__top-container::before,
      :root #main .Root__top-container::after {
         content: "";
         position: absolute;
         inset: 0;
         z-index: -1;
         pointer-events: none;
         background-position: center;
         background-size: cover;
         background-repeat: no-repeat;
         opacity: 0;
         transition: opacity 1.4s ease;
         will-change: opacity;
      }

      :root #main .Root__top-container::before {
         background-image: var(--ambience-cover-a, none);
      }

      :root #main .Root__top-container::after {
         background-image: var(--ambience-cover-b, none);
      }

      :root[data-ambience-layer="a"] #main .Root__top-container::before,
      :root[data-ambience-layer="b"] #main .Root__top-container::after {
         opacity: ${BACKDROP_OPACITY};
      }

      :root #main .Root__top-container .Root__nav-bar,
      :root #main .Root__top-container .Root__main-view,
      :root #main .Root__top-container .Root__right-sidebar > * {
         background-color: rgba(var(--spice-rgb-main), 0.6) !important;
         box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.07),
            inset 0 0 0 1px rgba(255, 255, 255, 0.035);
      }

      :root #main .Root__top-container .Root__nav-bar {
         background-color: rgba(var(--spice-rgb-sidebar), 0.6) !important;
      }

      :root #main .main-view-container ${STICKY_BAR_SELECTOR} {
         background-color: rgba(var(--spice-rgb-main), 0.82) !important;
         box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.05);
      }

      :root #main .Root__nav-bar .main-yourLibraryX-entryPoints,
      :root #main .Root__nav-bar .main-yourLibraryX-libraryContainer,
      :root #main .Root__right-sidebar .NowPlayingView,
      :root #main .Root__right-sidebar .NowPlayingView::before {
         background-color: transparent !important;
      }

      :root #main .Root__right-sidebar {
         --background-elevated-base: rgba(var(--spice-rgb-main-elevated), 0.55);
      }

      :root #main .Root__right-sidebar .main-nowPlayingView-section:not([style*="background"]) {
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

      :root #main .Root__now-playing-bar {
         --cover-ambience-background: rgba(var(--spice-rgb-sidebar), 0.55);
      }

      :root #main .Root__top-container #Desktop_LeftSidebar_Id,
      :root #main .Root__top-container .Root__now-playing-bar {
         background-color: transparent !important;
      }

      :root #main .main-view-container main > div > div:first-child[style*="background-color"] {
         background-image: none !important;
         opacity: 0.55;
         -webkit-mask-image: linear-gradient(to bottom, #000 0%, transparent 100%);
         mask-image: linear-gradient(to bottom, #000 0%, transparent 100%);
      }

      :root #main .main-view-container .main-entityHeader-backgroundColor {
         -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 140px, #000 55%, transparent 100%);
         mask-image: linear-gradient(to bottom, transparent 0, #000 140px, #000 55%, transparent 100%);
      }

      :root #main .main-view-container .playlist-playlist-actionBarBackground-background {
         background: none !important;
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
         will-change: transform, opacity;
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
         transform-origin: left center;
         transition:
            opacity 0.5s ease,
            transform 0.5s cubic-bezier(0.2, 0.7, 0.2, 1),
            text-shadow 0.5s ease;
      }

      ${LYRICS_SCOPE} [data-ambience-lyric="past"] {
         opacity: 0.26 !important;
      }

      ${LYRICS_SCOPE} [data-ambience-lyric="active"] {
         opacity: 1 !important;
         transform: scale(1.04);
         text-shadow:
            0 0 22px rgba(var(--spice-rgb-button), 0.7),
            0 0 2px rgba(255, 255, 255, 0.35);
      }

      ${LYRICS_SCOPE} [data-ambience-lyric="next-1"] {
         opacity: 0.72 !important;
      }

      ${LYRICS_SCOPE} [data-ambience-lyric="next-2"] {
         opacity: 0.5 !important;
      }

      ${LYRICS_SCOPE} [data-ambience-lyric="future"] {
         opacity: 0.34 !important;
      }

      ${LYRICS_SCOPE} [data-ambience-lyric]:hover {
         opacity: 0.9 !important;
      }

      @keyframes ambience-spin {
         to {
            transform: rotate(360deg);
         }
      }

      @media (prefers-reduced-motion: reduce) {
         :root #main .main-nowPlayingWidget-coverArt .cover-art {
            animation: none;
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
            return { color, score: Math.sqrt(bucket.count) * averageSaturation * averageSaturation };
         })
         .sort((first, second) => second.score - first.score);

      const best = ranked[0];
      const isTooGray = !best || rgbToHsl(best.color)[1] < MIN_COVER_SATURATION;

      if (isTooGray) {
         return { primary: null, secondary: null };
      }

      const bestHue = rgbToHsl(best.color)[0];
      const secondary = ranked.find((candidate) => {
         const hueGap = Math.abs(rgbToHsl(candidate.color)[0] - bestHue);
         const wrappedGap = Math.min(hueGap, 360 - hueGap);
         const isDistinct = wrappedGap >= SECONDARY_MIN_HUE_GAP;
         const isProminent = candidate.score >= best.score * SECONDARY_MIN_SCORE_SHARE;
         return isDistinct && isProminent;
      });

      return { primary: best.color, secondary: secondary ? secondary.color : null };
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

   function writeSecondaryAccent(rgb) {
      const rootStyle = document.documentElement.style;
      rootStyle.setProperty("--ambience-accent-2", rgbToHex(rgb));
      rootStyle.setProperty("--ambience-rgb-accent-2", rgb.map(Math.round).join(","));
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
         rootStyle.setProperty("--spice-" + name, rgbToHex(rgb));
         rootStyle.setProperty("--spice-rgb-" + name, rgb.map(Math.round).join(","));
      });
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

   async function updateForCurrentTrack() {
      const metadata = Spicetify.Player.data?.item?.metadata;
      const sampleUrl = imageUrl(metadata?.image_url);
      const token = ++requestToken;
      refreshSchemeColors();

      loadBeatsFor(Spicetify.Player.data?.item?.uri);

      if (!sampleUrl) {
         writeColors(schemeColors);
         writeSecondaryAccent(schemeColors["button-active"]);
         return;
      }

      try {
         const sampleImage = await loadImage(sampleUrl);
         const isStale = token !== requestToken;

         if (isStale) {
            return;
         }

         const coverColors = dominantVibrantColor(sampleImage);
         const palette = paletteFrom(coverColors.primary);
         writeColors(palette);
         writeSecondaryAccent(secondaryAccentFrom(coverColors, palette));
         showBackdrop(blurredBackdrop(sampleImage));
         rippleFromDisc();
      } catch (error) {
         writeColors(schemeColors);
         writeSecondaryAccent(schemeColors["button-active"]);
      }
   }

   function prefersReducedMotion() {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
   }

   function rippleFromDisc() {
      const isFirstTrack = !hasRippled;
      hasRippled = true;

      if (isFirstTrack || document.hidden || prefersReducedMotion()) {
         return;
      }

      const disc = document.querySelector(".main-nowPlayingWidget-coverArt");
      const bounds = disc?.getBoundingClientRect();
      const originX = bounds ? bounds.left + bounds.width / 2 : 70;
      const originY = bounds ? bounds.top + bounds.height / 2 : window.innerHeight - 60;

      ripple.style.setProperty("--ripple-x", originX + "px");
      ripple.style.setProperty("--ripple-y", originY + "px");
      ripple.getAnimations().forEach((animation) => animation.cancel());
      ripple.animate([
         { opacity: 0, transform: "scale(0.25)" },
         { opacity: 1, transform: "scale(0.6)", offset: 0.25 },
         { opacity: 0, transform: "scale(1.5)" },
      ], { duration: RIPPLE_DURATION_MS, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" });
   }

   async function loadBeatsFor(trackUri) {
      beatTrack = null;
      clearTimeout(beatTimer);

      const trackId = trackUri?.startsWith("spotify:track:") ? trackUri.split(":")[2] : null;

      if (!trackId) {
         return;
      }

      try {
         const token = Spicetify.Platform.AuthorizationAPI.getState().token.accessToken;
         const response = await fetch(`https://spclient.wg.spotify.com/audio-attributes/v1/audio-analysis/${trackId}?format=json`, {
            headers: { Authorization: "Bearer " + token },
         });
         const analysis = await response.json();
         const isStale = Spicetify.Player.data?.item?.uri !== trackUri;

         if (isStale || !analysis.beats?.length) {
            return;
         }

         const barStarts = (analysis.bars || []).map((bar) => bar.start);
         let barIndex = 0;

         beatTrack = analysis.beats.map((beat) => {
            while (barIndex < barStarts.length && barStarts[barIndex] < beat.start - BAR_MATCH_SECONDS) {
               barIndex += 1;
            }

            const startsBar = barIndex < barStarts.length && Math.abs(barStarts[barIndex] - beat.start) <= BAR_MATCH_SECONDS;
            return { start: beat.start, confidence: beat.confidence, startsBar };
         });

         scheduleNextBeat();
      } catch (error) {
         beatTrack = null;
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

   function pulseBeat(beat) {
      const strength = 0.35 + 0.65 * clamp(beat.confidence, 0, 1);
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

      const backdropLayer = visibleLayer === "a" ? "::before" : "::after";
      const topContainer = document.querySelector(".Root__top-container");

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

      const observer = new MutationObserver((mutations) => {
         const touchesMarketplaceCss = mutations.some((mutation) => {
            const node = mutation.target.nodeType === Node.TEXT_NODE ? mutation.target.parentElement : mutation.target;
            const addedMarketplaceStyle = [...mutation.addedNodes].some((added) => added.classList?.contains("marketplaceCSS"));
            return addedMarketplaceStyle || node?.classList?.contains("marketplaceCSS");
         });

         if (!touchesMarketplaceCss) {
            return;
         }

         clearTimeout(pendingUpdate);
         pendingUpdate = setTimeout(updateForCurrentTrack, 200);
      });

      observer.observe(document.head, { childList: true, subtree: true, characterData: true });
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
            lines.forEach((line) => {
               line.dataset.ambienceLyric = "future";
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

   function watchLyrics() {
      const watchedContainers = new WeakSet();
      let scanScheduled = false;

      const lineObserver = new MutationObserver((mutations) => {
         const containers = new Set(mutations.map((mutation) => mutation.target.closest?.(LYRICS_CONTAINER_SELECTOR)).filter(Boolean));
         containers.forEach(tagLyrics);
      });

      function markLyricsHosts() {
         const backdropContainers = [...document.querySelectorAll(`${LYRICS_CONTAINER_SELECTOR}, ${CINEMA_CONTAINER_SELECTOR}`)].filter((container) => !container.closest(".Root__right-sidebar"));
         const currentHosts = new Set(backdropContainers.map((container) => container.closest(LYRICS_HOST_SELECTOR)).filter(Boolean));

         const currentPanels = new Set([...currentHosts].map((host) => host.closest(".Root__top-container > *")).filter((panel) => panel && !panel.classList.contains("Root__main-view")));

         document.querySelectorAll(`[${LYRICS_HOST_ATTRIBUTE}]`).forEach((host) => {
            if (!currentHosts.has(host)) {
               host.removeAttribute(LYRICS_HOST_ATTRIBUTE);
            }
         });

         document.querySelectorAll(`[${LYRICS_PANEL_ATTRIBUTE}]`).forEach((panel) => {
            if (!currentPanels.has(panel)) {
               panel.removeAttribute(LYRICS_PANEL_ATTRIBUTE);
            }
         });

         currentHosts.forEach((host) => host.setAttribute(LYRICS_HOST_ATTRIBUTE, ""));
         currentPanels.forEach((panel) => panel.setAttribute(LYRICS_PANEL_ATTRIBUTE, ""));
      }

      function scanForContainers() {
         scanScheduled = false;
         markLyricsHosts();

         document.querySelectorAll(LYRICS_CONTAINER_SELECTOR).forEach((container) => {
            const isNewContainer = !watchedContainers.has(container);

            if (isNewContainer) {
               watchedContainers.add(container);
               lineObserver.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
               tagLyrics(container);
            }
         });
      }

      const pageObserver = new MutationObserver((mutations) => {
         const changedElements = mutations.some((mutation) => {
            const touchedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
            return touchedNodes.some((node) => node.nodeType === Node.ELEMENT_NODE);
         });

         if (scanScheduled || !changedElements) {
            return;
         }

         scanScheduled = true;
         setTimeout(scanForContainers, 250);
      });

      pageObserver.observe(document.body, { childList: true, subtree: true });
      scanForContainers();
   }

   function syncPausedState() {
      const isPaused = !Spicetify.Player.isPlaying();
      document.documentElement.classList.toggle("ambience-paused", isPaused);
   }

   function start() {
      const playerReady = window.Spicetify?.Player?.addEventListener && Spicetify.Player.data && document.head;

      if (!playerReady) {
         setTimeout(start, 300);
         return;
      }

      refreshSchemeColors();

      if (!schemeColors) {
         setTimeout(start, 300);
         return;
      }

      document.head.appendChild(style);
      watchSchemeChanges();
      watchLyrics();

      Spicetify.Player.addEventListener("songchange", updateForCurrentTrack);
      Spicetify.Player.addEventListener("onplaypause", () => {
         syncPausedState();
         scheduleNextBeat();
      });

      document.addEventListener("visibilitychange", scheduleNextBeat);
      document.body.appendChild(ripple);

      syncPausedState();
      updateForCurrentTrack();
   }

   start();
})();
