(function spotifyMotion() {
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
      const observer = new MutationObserver((mutations) => {
         for (const mutation of mutations) {
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
      });

      observer.observe(document.head, { childList: true });
      observer.observe(document.body, { childList: true });
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
      new MutationObserver(() => requestAnimationFrame(refreshPauseStates)).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
   }

   function tickSteppedLoops() {
      const now = performance.now();
      const elapsed = now - lastAmbientTick;
      lastAmbientTick = now;

      const advancing = [...tickedLoops].filter(([loop, state]) => !state.isPausedByCss && state.time !== null);

      for (const [loop, state] of advancing) {
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
      const hasAdvancingLoop = [...tickedLoops.values()].some((state) => !state.isPausedByCss && state.time !== null);

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

   function whenSpicetifyReady(callback) {
      const isReady = window.Spicetify && Spicetify.Player && Spicetify.Player.addEventListener && Spicetify.Platform && Spicetify.Platform.History;

      if (isReady) {
         callback();
         return;
      }

      setTimeout(() => whenSpicetifyReady(callback), 300);
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
      const reduced = reducedMotionQuery.matches;

      for (const mutation of mutations) {
         for (const node of mutation.addedNodes) {
            const isElement = node.nodeType === Node.ELEMENT_NODE;
            const hasRoom = revealCount < REVEAL_LIMIT;

            if (!isElement || !hasRoom) {
               continue;
            }

            const items = node.matches(REVEAL_TARGETS) ? [node] : [...node.querySelectorAll(REVEAL_TARGETS)];

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

      Spicetify.Platform.History.listen(() => {
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

      Spicetify.Player.addEventListener("songchange", () => {
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
      const root = document.documentElement;
      const readInline = () => PALETTE_PROPERTIES.map((property) => root.style.getPropertyValue(property).trim());
      let palette = readInline();
      let flowAnimation = null;

      new MutationObserver(() => {
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
      }).observe(root, { attributes: true, attributeFilter: ["style"] });
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
      whenSpicetifyReady(() => {
         watchWindowFocus();
         watchRouteReveal();
         watchCoverSettle();
      });
      reducedMotionQuery.addEventListener("change", retimeForMotionPreference);
      window.SpotifyMotion = { stats, processAllSheets, PRESETS, tickedLoops, releaseSteppedLoops };
   }

   start();
})();
