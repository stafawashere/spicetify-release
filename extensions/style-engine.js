(function styleEngine() {
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
      const addedStyles = [...record.addedNodes].filter(isStyleNode);

      if (editsOwnStyle) {
         dirtySheets.add(target);
      }

      for (const node of addedStyles) {
         if (OWN_STYLE_IDS.has(node.id)) {
            dirtySheets.add(node);
         }
      }

      return editsOwnStyle || addedStyles.length > 0;
   }

   function watchStyles() {
      new MutationObserver((records) => {
         const changed = records.map(noteStyleChange).some(Boolean);

         if (changed) {
            queuePass();
         }
      }).observe(document.head, { childList: true, subtree: true, characterData: true });

      document.addEventListener("load", (event) => {
         const isStylesheet = event.target?.nodeName === "LINK";

         if (isStylesheet) {
            queuePass();
         }
      }, true);
   }

   function start() {
      if (!document.head) {
         setTimeout(start, 50);
         return;
      }

      watchStyles();
      compileAll();

      window.StyleEngine = {
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

   start();
})();
