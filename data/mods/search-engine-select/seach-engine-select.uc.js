// ==UserScript==
// @author         Bibek Bhusal
// @name           Search Engine Select
// @description    Adds a floating UI to switch search engines on a search results page.
// ==/UserScript==

(function() {
  "use strict";

  const PREF_ENABLED = "extension.search-engine-select.enabled";
  const PREF_REMEMBER_POSITION = "extension.search-engine-select.remember-position";
  const PREF_Y_COOR = "extension.search-engine-select.y-coor";
  const PREF_DEBUG_MODE = "extension.search-engine-select.debug-mode";

  const getPref = (key, defaultValue) => {
    try {
      const pref = UC_API.Prefs.get(key);
      if (!pref) return defaultValue;
      if (!pref.exists()) return defaultValue;
      return pref.value;
    } catch {
      return defaultValue;
    }
  };

  const debugLog = (...args) => {
    if (getPref(PREF_DEBUG_MODE, false)) {
      console.log("extension.search-engine-select:", ...args);
    }
  };

  const debugError = (...args) => {
    if (getPref(PREF_DEBUG_MODE, false)) {
      console.error("extension.search-engine-select:", ...args);
    }
  };

  const SearchEngineSwitcher = {
    // --- Internal State ---
    _container: null,
    _engineSelect: null,
    _engineOptions: null,
    _dragHandle: null,
    _engineCache: [],
    _currentSearchInfo: null,
    _isDragging: false,
    _startY: 0,
    _initialTop: 0,
    _boundListeners: {},
    _progressListener: null,

    // --- Preference Management ---
    get enabled() {
      return getPref(PREF_ENABLED, true);
    },
    set enabled(value) {
      UC_API.Prefs.set(PREF_ENABLED, value);
    },
    get rememberPosition() {
      return getPref(PREF_REMEMBER_POSITION, true);
    },
    set rememberPosition(value) {
      UC_API.Prefs.set(PREF_REMEMBER_POSITION, value);
    },
    get Y_COOR() {
      return getPref(PREF_Y_COOR, "60%");
    },
    set Y_COOR(value) {
      UC_API.Prefs.set(PREF_Y_COOR, value);
    },

    // --- Core Methods ---
    async init() {
      if (!this.enabled) {
        debugLog("Initialization aborted: feature is disabled.");
        return;
      }
      debugLog("Initializing...");
      await this.buildEngineRegexCache();
      this.createUI();
      this.attachEventListeners();
      this.updateSwitcherVisibility();
    },

    destroy() {
      this._container?.remove();
      this.removeEventListeners();
      this._container = null;
      this._engineSelect = null;
      this._engineOptions = null;
      this._dragHandle = null;
      debugLog("Destroyed successfully.");
    },

    googleFaviconAPI: (url) => {
      try {
        const hostName = new URL(url).hostname;
        return `https://s2.googleusercontent.com/s2/favicons?domain_url=https://${hostName}&sz=32`;
      } catch (e) {
        return null;
      }
    },

    getFaviconImg(engine) {
      const img = document.createElement("img");
      const fallbackIcon = "chrome://branding/content/icon32.png";
      const submissionUrl = engine.getSubmission("test_query").uri.spec;
      img.src = engine.iconURI?.spec || this.googleFaviconAPI(submissionUrl) || fallbackIcon;
      img.onerror = () => (img.src = fallbackIcon);
      return img;
    },

    async buildEngineRegexCache() {
      debugLog("Building engine regex cache...");
      this._engineCache = [];
      const engines = await Services.search.getVisibleEngines();
      const PLACEHOLDER = "SEARCH_TERM_PLACEHOLDER_E6A8D";

      for (const engine of engines) {
        try {
          const submission = engine.getSubmission(PLACEHOLDER);
          if (!submission) continue;

          let regexString = submission.uri.spec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const placeholderRegex = PLACEHOLDER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          regexString = regexString.replace(placeholderRegex, "([^&]*)");

          this._engineCache.push({
            engine,
            regex: new RegExp(`^${regexString}`),
          });
        } catch (e) {
          debugError(`Failed to process engine ${engine.name}`, e);
        }
      }
    },

    matchUrl(url) {
      if (!url) return null;
      for (const item of this._engineCache) {
        const match = url.match(item.regex);
        if (match && match[1]) {
          try {
            const term = decodeURIComponent(match[1].replace(/\+/g, " "));
            debugLog(`Matched: Engine='${item.engine.name}', Term='${term}'`);
            return { engine: item.engine, term };
          } catch (e) {
            continue;
          }
        }
      }
      return null;
    },

    updateSwitcherVisibility() {
      const url = gBrowser.selectedBrowser.currentURI.spec;
      const newSearchInfo = this.matchUrl(url);

      if (newSearchInfo) {
        this._currentSearchInfo = newSearchInfo;
        this._show();
      }
    },

    _show() {
      if (!this._container) return;
      this._container.style.display = "flex";
      this.updateSelectedEngineDisplay();
    },

    _hide() {
      if (!this._container) return;
      this._container.style.display = "none";
      if (this._engineOptions) {
        this._engineOptions.style.display = "none";
        this._container.classList.remove("options-visible");
      }
    },

    updateSelectedEngineDisplay() {
      if (!this._currentSearchInfo || !this._engineSelect) return;
      this._engineSelect.innerHTML = "";
      const { engine } = this._currentSearchInfo;
      this._engineSelect.append(this.getFaviconImg(engine));
      const nameSpan = document.createElement("span");
      nameSpan.textContent = engine.name;
      this._engineSelect.append(nameSpan);
    },

    // --- Event Handlers ---
    handleEnabledChange(pref) {
      if (pref.value) this.init();
      else this.destroy();
    },

    handleTabSelect() {
      this._hide();
      this.updateSwitcherVisibility();
    },

    onLocationChange(browser) {
      if (browser === gBrowser.selectedBrowser) {
        this.updateSwitcherVisibility();
      }
    },

    async handleURLBarKey(event) {
      if (event.key !== "Enter") return;

      let engine;
      const term = gURLBar.value.trim();
      if (!term) return;

      try {
        const engineName = document
          .getElementById("urlbar-search-mode-indicator-title")
          .innerText.trim();
        engine = await Services.search.getEngineByName(engineName);
      } catch (e) {
        debugLog("Search indicator not found. Using default engine.");
        engine = await Services.search.getDefault();
      }

      if (engine && term) {
        debugLog(`URL bar search detected. Engine: ${engine.name}, Term: ${term}`);
        this._currentSearchInfo = { engine, term };
        this._show();
      }
    },

    async handleEngineClick(event, newEngine) {
      event.preventDefault();
      event.stopPropagation();

      // If clicking the same engine, just close the menu.
      if (newEngine.name === this._currentSearchInfo?.engine.name) {
        debugLog(`Clicked on same engine ('${newEngine.name}'). Closing menu.`);
        this._engineOptions.style.display = "none";
        this._container.classList.remove("options-visible");
        return;
      }

      if (!this._currentSearchInfo?.term) return;

      const term = this._currentSearchInfo.term;
      const newUrl = newEngine.getSubmission(term).uri.spec;
      let actionTaken = false;

      // Ctrl+Click (no other modifiers) -> Split View
      if (event.button === 0 && event.ctrlKey && !event.altKey && !event.shiftKey) {
        debugLog("Action: Split View");
        if (window.gZenViewSplitter) {
          const previousTab = gBrowser.selectedTab;
          await openTrustedLinkIn(newUrl, "tab");
          const currentTab = gBrowser.selectedTab;
          gZenViewSplitter.splitTabs([currentTab, previousTab], "vsep", 1);
        } else {
          openTrustedLinkIn(newUrl, "tab"); // Fallback
        }
        actionTaken = true;

        // Alt+Click -> Glance
      } else if (event.button === 0 && event.altKey) {
        debugLog("Action: Glance");
        if (window.gZenGlanceManager) {
          const rect = gBrowser.selectedBrowser.getBoundingClientRect();
          window.gZenGlanceManager.openGlance({
            url: newUrl,
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            width: 10,
            height: 10,
          });
        } else {
          openTrustedLinkIn(newUrl, "tab"); // Fallback
        }
        actionTaken = true;

        // Middle Click -> Background Tab
      } else if (event.button === 1) {
        debugLog("Action: Background Tab");
        openTrustedLinkIn(newUrl, "tab", {
          inBackground: true,
          relatedToCurrent: true,
        });
        /// action take but in background tab no need to update here

        // Left Click -> Current Tab
      } else if (event.button === 0) {
        debugLog("Action: Current Tab");
        openTrustedLinkIn(newUrl, "current");
        actionTaken = true;
      }

      if (actionTaken) {
        this._currentSearchInfo.engine = newEngine;
        this.updateSelectedEngineDisplay();
      }

      this._engineOptions.style.display = "none";
      this._container.classList.remove("options-visible");
    },

    toggleOptions(event) {
      event.stopPropagation();
      const shouldOpen = this._engineOptions.style.display !== "block";
      if (shouldOpen) {
        const containerRect = this._container.getBoundingClientRect();
        this._engineOptions.classList.toggle("popup-below", containerRect.top < 220);
        this._engineOptions.classList.toggle("popup-above", containerRect.top >= 220);
        this._engineOptions.style.display = "block";
        this._container.classList.add("options-visible");
      } else {
        this._engineOptions.style.display = "none";
        this._container.classList.remove("options-visible");
      }
    },

    hideOptionsOnClickOutside() {
      this._engineOptions.style.display = "none";
      this._container.classList.remove("options-visible");
    },

    // --- UI Creation ---
    createUI() {
      this._container = document.createElement("div");
      this._container.id = "search-engine-switcher-container";
      this._container.style.top = this.Y_COOR;

      this._engineSelect = document.createElement("div");
      this._engineSelect.id = "ses-engine-select";

      this._engineOptions = document.createElement("div");
      this._engineOptions.id = "ses-engine-options";

      this._dragHandle = document.createElement("div");
      this._dragHandle.id = "ses-drag-handle";

      this._container.append(this._engineSelect, this._dragHandle, this._engineOptions);
      document.documentElement.append(this._container);
      this.populateEngineList();
    },

    async populateEngineList() {
      this._engineOptions.innerHTML = "";
      const engines = await Services.search.getVisibleEngines();
      engines.forEach((engine) => {
        const option = document.createElement("div");
        option.className = "ses-engine-option";
        option.title = `Search with ${engine.name}`;
        option.append(this.getFaviconImg(engine));
        const name = document.createElement("span");
        name.textContent = engine.name;
        option.append(name);
        option.addEventListener("mousedown", (e) => this.handleEngineClick(e, engine));
        this._engineOptions.append(option);
      });
    },

    // --- Drag Functionality ---
    startDrag(e) {
      if (e.button !== 0) return;
      e.preventDefault();
      this._isDragging = true;
      this._container.classList.add("is-dragging");
      this._dragHandle.style.cursor = "grabbing";
      this._startY = e.clientY;
      this._initialTop = this._container.offsetTop;
      document.addEventListener("mousemove", this._boundListeners.doDrag);
      document.addEventListener("mouseup", this._boundListeners.stopDrag);
    },

    doDrag(e) {
      if (!this._isDragging) return;
      e.preventDefault();
      let newTop = this._initialTop + (e.clientY - this._startY);
      const maxTop = window.innerHeight - this._container.offsetHeight - 10;
      newTop = Math.max(10, Math.min(newTop, maxTop));
      this._container.style.top = `${newTop}px`;
    },

    stopDrag() {
      if (!this._isDragging) return;
      this._isDragging = false;
      this._container.classList.remove("is-dragging");
      this._dragHandle.style.cursor = "grab";
      if (this.rememberPosition) {
        this.Y_COOR = this._container.style.top;
      }
      document.removeEventListener("mousemove", this._boundListeners.doDrag);
      document.removeEventListener("mouseup", this._boundListeners.stopDrag);
    },

    // --- Event Listener Management ---
    attachEventListeners() {
      // Create a specific listener object for the progress listener
      this._progressListener = {
        onLocationChange: this.onLocationChange.bind(this),
        QueryInterface: ChromeUtils.generateQI([
          "nsIWebProgressListener",
          "nsISupportsWeakReference",
        ]),
      };

      // Bind all other listeners
      this._boundListeners.handleTabSelect = this.handleTabSelect.bind(this);
      this._boundListeners.handleURLBarKey = this.handleURLBarKey.bind(this);
      this._boundListeners.toggleOptions = this.toggleOptions.bind(this);
      this._boundListeners.hideOptionsOnClickOutside =
        this.hideOptionsOnClickOutside.bind(this);
      this._boundListeners.startDrag = this.startDrag.bind(this);
      this._boundListeners.doDrag = this.doDrag.bind(this);
      this._boundListeners.stopDrag = this.stopDrag.bind(this);

      gBrowser.tabContainer.addEventListener(
        "TabSelect",
        this._boundListeners.handleTabSelect
      );
      gBrowser.addTabsProgressListener(this._progressListener);
      gURLBar.inputField.addEventListener("keydown", this._boundListeners.handleURLBarKey);
      this._engineSelect.addEventListener("click", this._boundListeners.toggleOptions);
      document.addEventListener("click", this._boundListeners.hideOptionsOnClickOutside);
      this._dragHandle.addEventListener("mousedown", this._boundListeners.startDrag);
    },

    removeEventListeners() {
      gBrowser.tabContainer.removeEventListener(
        "TabSelect",
        this._boundListeners.handleTabSelect
      );
      if (this._progressListener) {
        gBrowser.removeTabsProgressListener(this._progressListener);
        this._progressListener = null;
      }
      gURLBar.inputField.removeEventListener("keydown", this._boundListeners.handleURLBarKey);
      this._engineSelect?.removeEventListener("click", this._boundListeners.toggleOptions);
      document.removeEventListener("click", this._boundListeners.hideOptionsOnClickOutside);
      this._dragHandle?.removeEventListener("mousedown", this._boundListeners.startDrag);
      document.removeEventListener("mousemove", this._boundListeners.doDrag);
      document.removeEventListener("mouseup", this._boundListeners.stopDrag);
      this._boundListeners = {};
    },
  };

  // --- Initialization and Teardown ---
  const handleEnabledChange = (pref) => {
    SearchEngineSwitcher.handleEnabledChange(pref);
  };

  // Initial check on load
  if (getPref(PREF_ENABLED, true)) SearchEngineSwitcher.init();

  // Listen for real-time changes
  UC_API.Prefs.addListener(PREF_ENABLED, handleEnabledChange);
})();
