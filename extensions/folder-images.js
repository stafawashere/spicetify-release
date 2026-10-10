(function folderImages() {
   const STORAGE_PREFIX = "folder-image:";
   const FOLDER_ENTRY_SELECTOR = "[aria-labelledby*=':folder:']";
   const PLACEHOLDER_SELECTOR = "[class*='imagePlaceholder'], [class*='imageContainer'] > div:has(> svg)";
   const ENTRY_ROOT_SELECTOR = "li, [data-encore-id='listRow']";
   const COVER_FRAME_SELECTOR = ".main-cardImage-imageWrapper, [class*='imageContainer']";
   const ART_CLASS = "folder-images-art";
   const TILT_CLASS = "folder-images-tilt";
   const MAX_TILT_DEGREES = 9;
   const MENU_ITEM_CLASS = "folder-images-menu-item";
   const MAX_EDGE = 320;
   const GRID_SIZE = 4;
   const ROOTLIST_REFRESH_DELAY_MS = 500;
   const PICTURE_ICON_PATH = "M1 3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2zm2-.5a.5.5 0 0 0-.5.5v7.4l2.7-2.7a1 1 0 0 1 1.4 0L9 10.1l1.3-1.3a1 1 0 0 1 1.4 0l1.8 1.8V3a.5.5 0 0 0-.5-.5zM11 6a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0";
   const REMOVE_ICON_PATH = "M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8m12 .75H4v-1.5h8z";

   let menuFolderId = null;
   let paintScheduled = false;
   let gridCoversByFolder = new Map();
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

      const hasFullGrid = covers.length >= GRID_SIZE;
      return hasFullGrid ? covers : covers.slice(0, 1);
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

         const collectFolders = (items) => {
            items?.forEach((item) => {
               if (item.type !== "folder") {
                  return;
               }

               const folderId = item.uri.split(":").pop();
               nextCovers.set(folderId, gridCoversFor(item));
               collectFolders(item.items);
            });
         };

         collectFolders(contents.items);
         gridCoversByFolder = nextCovers;
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

      sources.forEach((source) => {
         const tile = document.createElement("img");
         tile.src = source;
         tile.alt = "";
         tile.draggable = false;
         art.appendChild(tile);
      });
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

      const coverFrame = placeholder.closest(COVER_FRAME_SELECTOR) || placeholder;
      let art = coverFrame.querySelector("." + ART_CLASS);

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
         art.dataset.signature = signature;
         renderArt(art, sources);
      }
   }

   function paintAll() {
      paintScheduled = false;
      document.querySelectorAll(FOLDER_ENTRY_SELECTOR).forEach(paintEntry);
   }

   function schedulePaint() {
      if (paintScheduled) {
         return;
      }

      paintScheduled = true;
      requestAnimationFrame(paintAll);
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

         .${ART_CLASS}--grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: 1fr 1fr;
            gap: 0;
            transition: gap 0.35s cubic-bezier(0.2, 0.7, 0.2, 1), background-color 0.35s ease;
         }

         .${ART_CLASS}--grid img {
            border-radius: 0;
            transition:
               transform 0.35s cubic-bezier(0.2, 0.7, 0.2, 1),
               border-radius 0.35s ease,
               box-shadow 0.35s ease;
         }

         .${TILT_CLASS} {
            transform: perspective(520px) rotateX(var(--tilt-y, 0deg)) rotateY(var(--tilt-x, 0deg));
            transition: transform 0.2s ease-out;
         }

         .${TILT_CLASS}--active {
            will-change: transform;
         }

         .${TILT_CLASS}:not(.${TILT_CLASS}--active) {
            transition: transform 0.5s cubic-bezier(0.2, 0.7, 0.2, 1);
         }

         :is(li, [data-encore-id='listRow']):hover .${ART_CLASS}--grid {
            overflow: visible;
            gap: 4px;
            background-color: transparent;
         }

         :is(li, [data-encore-id='listRow']):hover .${ART_CLASS}--grid img {
            border-radius: 4px;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.45);
         }

         :is(li, [data-encore-id='listRow']):hover .${ART_CLASS}--grid img:nth-child(1) {
            transform: translate(-3px, -3px) rotate(-3deg);
         }

         :is(li, [data-encore-id='listRow']):hover .${ART_CLASS}--grid img:nth-child(2) {
            transform: translate(3px, -3px) rotate(2.5deg);
         }

         :is(li, [data-encore-id='listRow']):hover .${ART_CLASS}--grid img:nth-child(3) {
            transform: translate(-3px, 3px) rotate(2deg);
         }

         :is(li, [data-encore-id='listRow']):hover .${ART_CLASS}--grid img:nth-child(4) {
            transform: translate(3px, 3px) rotate(-2.5deg);
         }

         @media (prefers-reduced-motion: reduce) {
            .${TILT_CLASS},
            :is(li, [data-encore-id='listRow']):hover .${ART_CLASS}--grid img {
               transform: none;
            }
         }
      `;
      document.head.appendChild(style);
   }

   function tiltFrameFor(target) {
      const art = target.closest?.(ENTRY_ROOT_SELECTOR)?.querySelector("." + ART_CLASS);
      return art ? art.parentElement : null;
   }

   function resetTilt(frame) {
      frame.classList.remove(TILT_CLASS + "--active");
      frame.style.setProperty("--tilt-x", "0deg");
      frame.style.setProperty("--tilt-y", "0deg");
   }

   function watchTilt() {
      let tiltedFrame = null;
      let tiltedCardBounds = null;
      let latestPointer = null;
      let tiltScheduled = false;

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
            tiltedCardBounds = frame.closest("li").getBoundingClientRect();
         }

         const bounds = tiltedCardBounds;
         const horizontal = (event.clientX - bounds.left) / bounds.width - 0.5;
         const vertical = (event.clientY - bounds.top) / bounds.height - 0.5;

         frame.classList.add(TILT_CLASS, TILT_CLASS + "--active");
         frame.style.setProperty("--tilt-x", (horizontal * MAX_TILT_DEGREES * 2).toFixed(2) + "deg");
         frame.style.setProperty("--tilt-y", (-vertical * MAX_TILT_DEGREES * 2).toFixed(2) + "deg");
         tiltedFrame = frame;
      }

      document.addEventListener("mousemove", (event) => {
         latestPointer = event;

         if (tiltScheduled) {
            return;
         }

         tiltScheduled = true;
         requestAnimationFrame(applyTilt);
      }, { passive: true });

      document.addEventListener("scroll", () => {
         tiltedCardBounds = null;
      }, { capture: true, passive: true });

      document.addEventListener("mouseleave", () => {
         if (tiltedFrame) {
            resetTilt(tiltedFrame);
            tiltedFrame = null;
         }
      });
   }

   function start() {
      const spicetifyReady = window.Spicetify?.Platform?.RootlistAPI && document.body;

      if (!spicetifyReady) {
         setTimeout(start, 300);
         return;
      }

      installStyles();
      watchTilt();

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

      const observer = new MutationObserver((mutations) => {
         const addedElement = mutations.some((mutation) => [...mutation.addedNodes].some((node) => node.nodeType === Node.ELEMENT_NODE));

         if (!addedElement) {
            return;
         }

         const menu = document.querySelector("#context-menu [role='menu']");

         if (menu) {
            decorateMenu(menu);
         }

         schedulePaint();
      });
      observer.observe(document.body, { childList: true, subtree: true });

      Spicetify.Platform.RootlistAPI.getEvents?.()?.addListener?.("update", scheduleGridRefresh);
      refreshGridCovers();
   }

   start();
})();
