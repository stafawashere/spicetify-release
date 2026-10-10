(function libraryMoods() {
   const LIBRARY_SELECTOR = "#Desktop_LeftSidebar_Id";
   const ENTRY_SELECTOR = "[aria-labelledby*='spotify:']";
   const COVER_FRAME_SELECTOR = ".main-cardImage-imageWrapper, [class*='imageContainer']";
   const CACHE_KEY = "library-moods:v1";
   const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
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
      return isFresh ? cached : null;
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
      setTimeout(tagAll, 250);
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
         return isPlaylist && !freshMoodFor(item.uri);
      });

      for (const item of pending) {
         try {
            const features = await fetchAverageFeatures(item.uri);

            if (features) {
               moodCache[item.uri] = { ...features, mood: moodFromFeatures(features.energy, features.valence), at: Date.now() };
               writeCache();
               scheduleTagging();
            }
         } catch (error) {
            continue;
         }

         await new Promise((resolve) => setTimeout(resolve, ANALYSIS_GAP_MS));
      }

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
            transition: opacity 0.3s ease;
         }

         ${LIBRARY_SELECTOR} li[data-library-stale] img {
            filter: grayscale(0.65);
            transition: filter 0.3s ease;
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
      const spicetifyReady = window.Spicetify?.Platform?.LibraryAPI && Spicetify.Platform.PlaylistAPI && Spicetify.Platform.AuthorizationAPI && document.body;

      if (!spicetifyReady) {
         setTimeout(start, 300);
         return;
      }

      installStyles();

      const observer = new MutationObserver((mutations) => {
         const addedElement = mutations.some((mutation) => [...mutation.addedNodes].some((node) => node.nodeType === Node.ELEMENT_NODE));

         if (addedElement) {
            scheduleTagging();
         }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      refreshLibrary();
      setInterval(refreshLibrary, LIBRARY_REFRESH_MS);
   }

   start();
})();
