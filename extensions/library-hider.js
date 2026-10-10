(function libraryHider() {
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
      const spicetifyReady = window.Spicetify && document.head && document.body;

      if (!spicetifyReady) {
         setTimeout(start, 300);
         return;
      }

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

      const observer = new MutationObserver(() => {
         const menu = document.querySelector("#context-menu [role='menu']");

         if (menu) {
            decorateMenu(menu);
         }
      });
      observer.observe(document.body, { childList: true, subtree: true });
   }

   start();
})();
