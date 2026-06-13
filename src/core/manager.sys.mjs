/**
 * @file Manages mods, including basic Sine functionality.
 * @license
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import utils from "./utils.sys.mjs";
import * as domUtils from "../utils/dom.mjs";
import ucAPI from "../utils/uc_api.sys.mjs";

/**
 * Main mod manager class.
 *
 * @class
 */
class Manager {
  preferences = ChromeUtils.importESModule("chrome://userscripts/content/core/preferences.sys.mjs");
  marketplace = ChromeUtils.importESModule(
    "chrome://userscripts/content/services/marketplace.sys.mjs"
  ).default;
  #stylesheetManager = ChromeUtils.importESModule(
    "chrome://userscripts/content/services/stylesheets.sys.mjs"
  ).default;
  #unloadListeners = new Map();

  /**
   * Adds an unload listener to #unloadListeners.
   *
   * @param {string} script - Script path to assign an unload listener to.
   * @param {Window} window - Window to relate unload listener to.
   * @param {() => void} callback - Callback to execute when unload listener is triggered.
   */
  addUnloadListener(script, window, callback) {
    if (!this.#unloadListeners.has(script)) {
      this.#unloadListeners.set(script, new Map());
    }
    const scriptListeners = this.#unloadListeners.get(script);
    scriptListeners.set(window, callback);
  }

  /**
   * Triggers an unload listener from #unloadListeners.
   *
   * @param {string} chromePath - Path of script to unload.
   * @param {Window} window - Window to unload script from.
   * @returns {boolean} Whether script remains loaded or not.
   */
  async triggerUnloadListener(chromePath, window) {
    const listeners = this.#unloadListeners.get(chromePath);
    if (!listeners) return false;

    // If there is no match for the window, then the script was not loaded in this DOM.
    if (!listeners.has(window)) return false;

    const callback = listeners.get(window);
    // If the script was loaded but there is no registered callback for unloading, it will remain loaded.
    if (!callback) return true;

    try {
      await callback();
    } catch (err) {
      console.warn(`[Sine]: Failed to unload "${chromePath}":`, err);
    }

    listeners.delete(window);

    if (listeners.size === 0) {
      this.#unloadListeners.delete(chromePath);
    }

    // Script is no longer loaded, return false.
    return false;
  }

  /**
   * Removes all unload listeners related to a mod. Should be triggered when a mod is uninstalled or
   * disabled.
   *
   * @param {string} modId - Id of mod to remove unload listeners of.
   */
  async removeUnloadListeners(modId) {
    const allUnloadPromises = [];
    for (const [scriptName, listeners] of this.#unloadListeners) {
      if (scriptName.startsWith(`chrome://sine/content/${modId}/`)) {
        for (const listener of listeners.values()) {
          if (listener) {
            allUnloadPromises.push(listener());
          }
        }
        this.#unloadListeners.delete(scriptName);
      }
    }
    await Promise.all(allUnloadPromises);
  }

  /**
   * Removes all unload listeners related to a window. Should be executed when a window is closed or
   * unloaded.
   *
   * @param {Window} window - Window to remove unload listeners from.
   */
  removeListenersForDOM(window) {
    for (const listeners of this.#unloadListeners.values()) {
      if (listeners.has(window)) {
        const windowListener = listeners.get(window);
        if (windowListener) {
          windowListener();
        }

        listeners.delete(window);
      }
    }
  }

  /**
   * Appends Sine interfaces to a window object. Should be executed when a window that a mod may run
   * in is opened.
   *
   * @param {Window} window - Window to append interface to.
   */
  appendInterfaceToDOM(window) {
    const addUnloadListener = this.addUnloadListener.bind(this);
    window.addUnloadListener = (callback, scriptPath) => {
      let script;

      // Only allow custom script paths if it's from a trusted file.
      if (script === "chrome://userscripts/content/services/module_loader.mjs") {
        script = scriptPath;
      } else {
        script = Components.stack.caller?.filename.split("?")[0];
      }

      if (script) {
        addUnloadListener(script, window, callback);
      }
    };
    window.triggerUnloadListener = this.triggerUnloadListener.bind(this);
  }

  /**
   * Registers a mod's chrome manifest.
   *
   * @param {string} manifestPath - Chrome URI path to a manifest file.
   * @param {string} modId - Mod id to register manifest of.
   */
  static #registerChromeManifest(manifestPath, modId) {
    if (!manifestPath) return;

    const cmanifest = Services.dirsvc.get("UChrm", Ci.nsIFile);
    cmanifest.append("sine-mods");
    cmanifest.append(modId);

    const paths = manifestPath.split("/");
    for (const path of paths) {
      cmanifest.append(path);
    }

    if (cmanifest.exists()) {
      Components.manager.QueryInterface(Ci.nsIComponentRegistrar).autoRegister(cmanifest);
    }
  }

  /**
   * Rebuilds all mods. If both parameters are disabled, function will rebuild mod-related DOM data.
   *
   * @param {boolean} rebuildJS - If true, will load/reload JavaScript.
   * @param {boolean} reloadStyles - If true, will load/reload styles.
   */
  async rebuildMods(rebuildJS = true, reloadStyles = true) {
    if (Services.prefs.getBoolPref("sine.mods.disable-all", false)) {
      return;
    }

    this.#stylesheetManager.rebuildMods(reloadStyles);

    if (!rebuildJS) {
      return;
    }

    const mods = await utils.getMods();

    const scripts = await utils.getScripts({ mods });

    // Load chrome uris.
    for (const mod of Object.values(mods)) {
      this.constructor.#registerChromeManifest(mod.chromeManifest, mod.id);
    }

    // Inject background modules.
    for (const scriptPath of Object.keys(scripts)) {
      if (scriptPath.endsWith(".sys.mjs")) {
        const chromePath = `chrome://sine/content/${scriptPath}`;

        // TODO: Find a way to pass Sine interface to background scripts. Sandboxing execution?
        try {
          if (scripts[scriptPath].enabled && !this.#unloadListeners.has(chromePath)) {
            // Null is being passed as window until a reference for such is found.
            this.addUnloadListener(chromePath, null, null);
            ChromeUtils.importESModule(chromePath);
          }
        } catch (err) {
          console.warn("[Sine]: Failed to load background script:", err);
        }
      }
    }

    // TODO: Only refresh scripts that must be refreshed.
    const processes = utils.getProcesses();
    const promises = [];
    for (const process of processes) {
      this.appendInterfaceToDOM(process);

      ChromeUtils.compileScript("chrome://userscripts/content/services/module_loader.mjs")
        .then((script) => script.executeInGlobal(process))
        .catch((err) => console.warn("[Sine]: Failed to load module script:", err));

      for (const [scriptPath, scriptOptions] of Object.entries(scripts)) {
        if (scriptOptions.regex.test(process.location.href) && scriptPath.endsWith(".uc.js")) {
          const chromePath = `chrome://sine/content/${scriptPath}`;

          promises.push(
            (async () => {
              const scriptLoaded = await this.triggerUnloadListener(chromePath, process);
              if (scriptOptions.enabled && !scriptLoaded) {
                try {
                  this.addUnloadListener(chromePath, process, null);
                  Services.scriptloader.loadSubScriptWithOptions(chromePath, {
                    target: process,
                    ignoreCache: true,
                  });
                } catch (err) {
                  console.warn("[Sine]: Failed to load script:", err);
                }
              }
            })()
          );
        }
      }
    }
    await Promise.all(promises);
  }

  /**
   * Observes new chrome window events.
   *
   * @param {Window} subject - Window that is being observed.
   * @param {string} topic - Topic specifying what the function is called for.
   */
  observe(subject, topic) {
    if (topic === "chrome-document-global-created" && subject) {
      this.#stylesheetManager.onWindow(subject);

      subject.addEventListener("load", async (event) => {
        const window = event.target.defaultView;

        const scripts = await utils.getScripts({
          removeBgModules: true,
          href: window.location.href,
          onlyEnabled: true,
        });

        window.manager = this;

        this.appendInterfaceToDOM(window);

        window.newDOM = true;
        ChromeUtils.compileScript("chrome://userscripts/content/services/module_loader.mjs")
          .then((script) => script.executeInGlobal(window))
          .catch((err) =>
            console.error(`[Sine:Manager]: Failed to compile module loader.\n${err}`)
          );

        for (const scriptPath of Object.keys(scripts)) {
          if (scriptPath.endsWith(".uc.js")) {
            Services.scriptloader.loadSubScriptWithOptions(`chrome://sine/content/${scriptPath}`, {
              target: window,
              ignoreCache: true,
            });
          }
        }
      });

      subject.addEventListener("beforeunload", (event) => {
        const window = event.target.defaultView;
        this.removeListenersForDOM(window);
      });
    }
  }

  /** Initializes window listener, calling this.observe when a new chrome window is initialized. */
  initWinListener() {
    Services.obs.addObserver(this, "chrome-document-global-created");
  }

  /**
   * Uninstalls a mod.
   *
   * @param {string} id - Id of mod to uninstall.
   */
  async removeMod(id) {
    // Unload JS listeners first.
    await this.removeUnloadListeners(id);

    const installedMods = await utils.getMods();
    // TODO: Possibly optimize.
    // oxlint-disable-next-line typescript/no-dynamic-delete
    delete installedMods[id];
    await IOUtils.writeJSON(utils.modsDataFile, installedMods);

    await IOUtils.remove(utils.getModFolder(id), { recursive: true });

    this.rebuildMods(false);
  }

  /**
   * Appends a mod interface to the DOM. (specifically the settings page)
   *
   * @param {HTMLDocument} document - Document to append mod XUL to.
   * @param {string} modId - Id of mod to append to DOM.
   * @param {object} modData - Mod data to append to DOM.
   * @param {string[] | null} modsChanged - List of changed mod ids.
   * @returns {HTMLElement} Element that was appended.
   */
  static #buildModXUL(document, modId, modData, modsChanged) {
    const item = domUtils.appendXUL(
      document.querySelector("#sineModsList"),
      `
        <vbox class="sineItem" mod-id="${modId}">
          <vbox class="sineItemContent">
            <hbox id="sineItemContentHeader">
              <label>
                <h3 class="sineItemTitle"></h3>
                ${
                  modsChanged?.includes(modData.id)
                    ? `
                    <div class="sineItemUpdateIndicator"
                      data-l10n-id="sine-mod-indicator-updated" data-l10n-attrs="title"></div>
                  `
                    : ""
                }
              </label>
              <moz-toggle class="sineItemPreferenceToggle" data-l10n-attrs="title"/>
            </hbox>
            <description class="description-deemphasized sineItemDescription">
              ${utils.formatLabel(modData.description ?? "")}
            </description>
          </vbox>
          <hbox class="sineItemActions">
            ${
              modData.homepage && modData.homepage !== ""
                ? `<button class="sineItemHomepageButton" data-l10n-id="sine-mod-homepage-button"
                    data-l10n-attrs="title"></button>`
                : ""
            }
            <button class="auto-update-toggle" data-l10n-attrs="title"></button>
            <button class="sineItemUninstallButton">
              <hbox class="box-inherit button-box">
                <label class="button-box" data-l10n-id="sine-mod-remove-button"></label>
              </hbox>
            </button>
          </hbox>
        </vbox>
      `
    );

    const enableToggle = item.querySelector(".sineItemPreferenceToggle");
    const enableToggleLocale = "sine-mod-disable";
    if (modData.enabled) {
      enableToggle.setAttribute("pressed", "");
      enableToggle.dataset.l10nId = `${enableToggleLocale}-enabled`;
    } else {
      enableToggle.dataset.l10nId = `${enableToggleLocale}-disabled`;
    }

    if (modData.preferences) {
      domUtils.appendXUL(
        item,
        `
        <dialog class="sineItemPreferenceDialog">
          <div class="sineItemPreferenceDialogTopBar">
            <h3 class="sineItemTitle"></h3>
            <button data-l10n-id="sine-dialog-close"></button>
          </div>
          <div class="sineItemPreferenceDialogContent"></div>
        </dialog>
      `
      );

      const configureBtn = document.createElement("button");
      configureBtn.className = "sineItemConfigureButton";
      configureBtn.dataset.l10nId = "sine-settings-button";
      configureBtn.dataset.l10nAttrs = "title";

      const sineItemActions = item.querySelector(".sineItemActions");
      sineItemActions.insertBefore(configureBtn, sineItemActions.children[0]);
    }

    const updateToggle = item.querySelector(".auto-update-toggle");
    const updateToggleLocale = "sine-mod-update-disable";
    if (modData["no-updates"]) {
      updateToggle.setAttribute("enabled", "");
      updateToggle.dataset.l10nId = `${updateToggleLocale}-enabled`;
    } else {
      updateToggle.dataset.l10nId = `${updateToggleLocale}-disabled`;
    }

    return item;
  }

  /**
   * Loads all mods into the settings page DOM.
   *
   * @param {Window | null} specificWindow - Specific window to load mods into.
   * @param {string[] | null} modsChanged - List of changed/updated mod ids.
   */
  async loadMods(specificWindow = null, modsChanged = null) {
    const installedMods = await utils.getMods();

    const pages = utils.getProcesses(specificWindow, ["settings", "preferences"]);
    for (const window of pages) {
      const document = window.document;

      document.querySelector("#sineModsList").innerHTML = "";

      if (Services.prefs.getBoolPref("sine.mods.disable-all", false)) {
        domUtils.appendXUL(
          document.querySelector("#sineModsList"),
          `<description class="description-deemphasized" data-l10n-id="sine-mods-disabled-desc"/>`,
          null,
          window.MozXULElement
        );
      } else {
        const sortedArr = Object.values(installedMods).toSorted((a, b) =>
          a.name.localeCompare(b.name)
        );
        const ids = sortedArr.map((obj) => obj.id);
        for (const key of ids) {
          const modData = installedMods[key];
          // Create new item.
          const item = this.constructor.#buildModXUL(document, key, modData, modsChanged);

          const modVersion = modData.version ? ` (v${modData.version})` : "";
          for (const el of item.querySelectorAll(".sineItemTitle")) {
            el.textContent = modData.name + modVersion;
          }

          const toggle = item.querySelector(".sineItemPreferenceToggle");
          toggle.addEventListener("toggle", async () => {
            const currMods = await utils.getMods();
            const theme = await this.toggleTheme(currMods, modData.id);
            toggle.dataset.l10nId = `sine-mod-disable-${theme.enabled ? "enabled" : "disabled"}`;
          });

          if (Object.hasOwn(modData, "preferences") && modData.preferences !== "") {
            const dialog = item.querySelector("dialog");

            item
              .querySelector(".sineItemPreferenceDialogTopBar button")
              .addEventListener("click", () => dialog.close());

            const loadPrefs = async () => {
              const modPrefs = await utils.getModPreferences(modData);
              for (const pref of modPrefs) {
                const prefEl = this.preferences.parsePref(pref, this, window);
                if (prefEl) {
                  item.querySelector(".sineItemPreferenceDialogContent").append(prefEl);
                }
              }
            };

            if (modData.enabled) {
              loadPrefs();
            } else {
              // If the mod is not enabled, load preferences when the toggle is clicked.
              toggle.addEventListener("toggle", loadPrefs, { once: true });
            }

            // Add the click event to the settings button.
            item
              .querySelector(".sineItemConfigureButton")
              .addEventListener("click", () => dialog.showModal());
          }

          // Add homepage button click event.
          if (modData.homepage && modData.homepage !== "") {
            item
              .querySelector(".sineItemHomepageButton")
              .addEventListener("click", () => window.open(modData.homepage, "_blank"));
          }

          // Add update button click event.
          const updateButton = item.querySelector(".auto-update-toggle");
          updateButton.addEventListener("click", async () => {
            const latestMods = await utils.getMods();
            latestMods[key]["no-updates"] = !latestMods[key]["no-updates"];
            if (updateButton.getAttribute("enabled")) {
              updateButton.removeAttribute("enabled");
              updateButton.dataset.l10nId = "sine-mod-update-disable-disabled";
            } else {
              updateButton.setAttribute("enabled", true);
              updateButton.dataset.l10nId = "sine-mod-update-disable-enabled";
            }
            await IOUtils.writeJSON(utils.modsDataFile, latestMods);
          });

          // Add remove button click event.
          const remove = item.querySelector(".sineItemUninstallButton");
          remove.addEventListener("click", async () => {
            const [msg] = await document.l10n.formatValues([
              { id: "sine-mod-remove-confirmation" },
            ]);

            if (window.confirm(msg)) {
              remove.disabled = true;
              await this.removeMod(modData.id);
              this.marketplace.loadPage(null, this);
              this.loadMods();
              if (Object.hasOwn(modData, "scripts") && !modData.supportsUnload) {
                ucAPI.showToast({
                  id: "1",
                });
              }
            }
          });
        }

        if (document.querySelector("#sineModsList").children.length === 0) {
          domUtils.appendXUL(
            document.querySelector("#sineModsList"),
            `
              <description class="description-deemphasized" data-l10n-id="sine-no-mods-installed">
                <html:a data-l10n-name="sine-marketplace-link"
                  target="_blank"
                  href="https://sineorg.github.io/store/"></html:a>
              </description>
            `,
            null,
            window.MozXULElement
          );
        }
      }
    }
  }

  /**
   * Processes an update for a specific mod.
   *
   * @param {object} currModData - Current data of mod to process.
   * @param {object} currModsList - Current list of mod data.
   * @param {object} marketplaceData - Current marketplace data.
   * @returns {object} Mod update details.
   */
  async processModUpdate(currModData, currModsList, marketplaceData) {
    let newThemeData, githubAPI, originalData, homepage;

    if (currModData.homepage) {
      if (currModData.origin === "store") {
        newThemeData = marketplaceData[currModData.id];
        homepage = "{store}";
      } else {
        originalData = await ucAPI.fetch(`${utils.rawURL(currModData.homepage)}theme.json`);
        const minimalData = await this.createThemeJSON(
          currModData.homepage,
          currModsList,
          typeof originalData === "object" ? originalData : {},
          true
        );
        newThemeData = minimalData.theme;
        githubAPI = minimalData.githubAPI;
      }
    } else {
      newThemeData = await ucAPI.fetch(
        `https://raw.githubusercontent.com/zen-browser/theme-store/main/themes/${currModData.id}/theme.json`
      );
      homepage = newThemeData.homepage;
    }

    const shouldUpdate =
      newThemeData &&
      typeof newThemeData === "object" &&
      new Date(currModData.updatedAt) < new Date(newThemeData.updatedAt);

    if (!shouldUpdate) return { changed: false, marketplaceData };

    if (currModData.homepage && currModData.origin !== "store") {
      const customData = await this.createThemeJSON(
        currModData.homepage,
        currModsList,
        typeof newThemeData === "object" ? newThemeData : {},
        false,
        githubAPI
      );
      if (Object.hasOwn(currModData, "version") && customData.version === "1.0.0") {
        customData.version = currModData.version;
      }
      customData.id = currModData.id;
      for (const property of ["name", "description"]) {
        const originalMissing =
          (typeof originalData !== "object" && originalData.toLowerCase() === "404: not found") ||
          !originalData[property];
        if (originalMissing && currModData[property]) {
          customData[property] = currModData[property];
        }
      }
      newThemeData = customData;
      homepage = newThemeData.homepage;
    }

    const modHasJS = await this.syncModData(homepage, currModsList, newThemeData, currModData);
    return { changed: true, modHasJS, id: currModData.id };
  }

  /**
   * Checks for updates on all mods.
   *
   * @param {string | null} source - "auto" or null. If source is auto, will check if automatic
   *   updates are enabled.
   * @returns {boolean} True if any mods have been updated.
   */
  async updateMods(source) {
    if (source === "auto" && !utils.autoUpdate) return false;

    const currModsList = await utils.getMods();
    const modsChanged = [];
    let changeMadeHasJS = false;

    let marketplacePromise = null;
    const getMarketplaceData = () => {
      marketplacePromise ??= ucAPI.fetch(
        `https://raw.githubusercontent.com/sineorg/store/main/marketplace.json`
      );
      return marketplacePromise;
    };

    const promises = [];
    const processedMods = [];
    for (const currModData of Object.values(currModsList)) {
      if (!currModData.enabled || currModData["no-updates"]) {
        continue;
      }

      processedMods.push(currModData.id);

      promises.push(
        (async () => {
          let marketplaceData = null;
          if (currModData.homepage && currModData.origin === "store") {
            marketplaceData = await getMarketplaceData();
          }
          return this.processModUpdate(currModData, currModsList, marketplaceData);
        })()
      );
    }
    const results = await Promise.all(promises);

    for (const result of results) {
      if (result.changed) {
        modsChanged.push(result.id);
        changeMadeHasJS ||= result.modHasJS;
      }
    }

    if (changeMadeHasJS) {
      ucAPI.showToast({
        id: "2",
      });
    }

    if (modsChanged.length === 0) {
      return false;
    }
    this.rebuildMods();
    this.loadMods(null, modsChanged);
    return true;
  }

  /**
   * Installs a mod from a repository.
   *
   * @param {string} repo - GitHub repository to install from.
   * @param {string | null} origin - Origin of mod, "store," or none.
   * @param {boolean} reload - If true, will reload mods after installing.
   */
  async installMod(repo, origin, reload = true) {
    const currModsList = await utils.getMods();

    let newThemeData;
    if (origin === "store") {
      newThemeData = await ucAPI.fetch(
        `https://raw.githubusercontent.com/sineorg/store/main/marketplace.json`
      );
      newThemeData = newThemeData[repo];
    } else {
      newThemeData = await ucAPI
        .fetch(`${utils.rawURL(repo)}theme.json`)
        .then(
          async (res) =>
            await this.createThemeJSON(repo, currModsList, typeof res === "object" ? res : {})
        );
    }

    if (newThemeData) {
      if (typeof newThemeData.style === "object" && Object.keys(newThemeData.style).length === 0) {
        delete newThemeData.style;
      }

      let homepage = repo;
      if (origin === "store") {
        homepage = "{store}";
      }
      await this.syncModData(homepage, currModsList, newThemeData);

      if (reload) {
        this.rebuildMods();
        this.loadMods();
      }
    }
  }

  /**
   * Parses a GitHub URL into an object of data.
   *
   * @param {string} url - GitHub URL.
   * @returns {object} Object of GitHub URL metadata.
   */
  static parseGitHubUrl(url) {
    url = url.replace(/(\?.+)?(\/+)?$/u, "");

    const regexes = [
      /^(?:https?:\/\/)?github\.com\/([^/]+)\/([^/]+)$/u,
      /^(?:https?:\/\/)?github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)(\/.*)?$/u,
      /^(?:https?:\/\/)?raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/refs\/heads\/([^/]+)(\/.*)?$/u,
      /^(?:https?:\/\/)?raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)(\/.*)?$/u,
      /^([^/]+)\/([^/]+)\/tree\/([^/]+)(\/.*)?$/u,
      /^([^/]+)\/([^/]+)$/u,
    ];

    for (const regex of regexes) {
      const match = url.match(regex);
      if (match) {
        const author = match[1];
        const repo = match[2];

        let branch = "main";
        let folder = "";
        if (match.length > 3) {
          branch = match[3];
          folder = match[4] || "";
        }

        return {
          name: repo,
          author,
          branch,
          folder: folder.replace(/^\/+/u, ""),
        };
      }
    }

    throw new Error("[Sine]: Unknown GitHub repo format, unable to parse.");
  }

  /**
   * Finds a singular file entrypoint from a list of possible matches.
   *
   * @param {string} modId - Id of mod to filter with.
   * @param {string[]} fileNames - List of file names to search for.
   * @param {string[]} modEntries - List of item entries.
   * @param {object} repo - Repository metadata. (fetched from this.parseGitHubUrl)
   * @param {string | null} customUrl - Custom file name to search for.
   * @returns {string} Valid and matching file path to use.
   */
  static findFile(modId, fileNames, modEntries, repo, customUrl) {
    const repoFolder = repo.folder ? `${repo.folder}/` : "";
    const fileEntries = modEntries.filter(
      (entry) =>
        (fileNames.some((name) => entry.endsWith(name)) &&
          entry.startsWith(`${modId}/${repoFolder}`)) ||
        entry === `${modId}/${repoFolder}${customUrl}`
    );
    const customFiles = fileEntries.filter(
      (entry) => entry === `${modId}/${repoFolder}${customUrl}`
    );

    let relativePath = "";

    if (fileEntries.length === 1) {
      relativePath = fileEntries[0];
    } else if (customFiles.length === 1) {
      relativePath = customFiles[0];
    } else if (fileEntries.length > 1) {
      const withDepth = fileEntries.map((p) => ({
        path: p,
        depth: p.split("/").filter(Boolean).length,
      }));

      const minDepth = Math.min(...withDepth.map((p) => p.depth));
      const shallowest = withDepth.filter((p) => p.depth === minDepth);

      if (shallowest.length === 1) {
        relativePath = shallowest[0].path;
      }
    }

    return relativePath.replace(`${modId}/`, "");
  }

  /**
   * Syncs a mod data (updates or installs), given mod metadata.
   *
   * @param {string} repoLink - Link to repository to fetch from.
   * @param {object} currModsList - List of currently installed mods and their metadata.
   * @param {object} newThemeData - New mod metadata to apply. (fetched via repoLink)
   * @param {object | null} currModData - Previous metadata. (applicable in updates)
   * @returns {boolean} Returns whether the installed mod has JS.
   */
  async syncModData(repoLink, currModsList, newThemeData, currModData = false) {
    const themeFolder = utils.getModFolder(newThemeData.id);
    const nestedPath = `main/mods/${newThemeData.id}`;
    if (repoLink === "{store}") {
      repoLink = `sineorg/store/tree/${nestedPath}`;
      newThemeData.origin = "store";
    } else if (newThemeData.origin) {
      // Prevent mods from pretending to be verified and from the store.
      delete newThemeData.origin;
    }
    let repo = this.constructor.parseGitHubUrl(repoLink);

    const tmpFolder = PathUtils.join(utils.modsDir, `tmp-${currModData.id}`);
    if (currModData) {
      await IOUtils.copy(themeFolder, tmpFolder, { recursive: true });
      await IOUtils.remove(themeFolder, { recursive: true });
    }

    let zipUrl = `https://codeload.github.com/${repo.author}/${repo.name}/zip/refs/heads/${repo.branch}`;
    if (newThemeData.origin === "store") {
      repo = this.constructor.parseGitHubUrl(newThemeData.homepage);
      zipUrl = `https://raw.githubusercontent.com/sineorg/store/${nestedPath}/mod.zip`;
    }
    const zipEntries = await ucAPI.unpackRemoteArchive({
      url: zipUrl,
      id: newThemeData.id,
      zipPath: PathUtils.join(utils.modsDir, `${newThemeData.id}.zip`),
      extractDir: utils.modsDir,
      applyName: true,
    });

    if (currModData) {
      if (!(await IOUtils.exists(PathUtils.join(themeFolder, repo.folder)))) {
        await IOUtils.remove(themeFolder, { recursive: true });
        await IOUtils.copy(tmpFolder, themeFolder, { recursive: true });
        await IOUtils.remove(tmpFolder, { recursive: true });
        return false;
      }

      await IOUtils.remove(tmpFolder, { recursive: true });
    }

    const promises = [];

    const { style, preferences } = newThemeData;
    let customChrome, customContent;
    if (typeof style === "string") {
      customChrome = style;
    } else if (style && typeof style === "object") {
      customChrome = style.chrome;
      customContent = style.content;
    }

    const normalizePath = (value) =>
      typeof value === "string" && value.startsWith("https://")
        ? this.constructor.parseGitHubUrl(value).folder
        : value;

    customChrome = normalizePath(customChrome);
    customContent = normalizePath(customContent);
    const customPreferences = normalizePath(preferences);

    newThemeData.style = {};
    newThemeData.style.chrome = this.constructor.findFile(
      newThemeData.id,
      ["userChrome.css", "chrome.css"],
      zipEntries,
      repo,
      customChrome
    );
    newThemeData.style.content = this.constructor.findFile(
      newThemeData.id,
      ["userContent.css"],
      zipEntries,
      repo,
      customContent
    );

    newThemeData.preferences = this.constructor.findFile(
      newThemeData.id,
      ["preferences.json"],
      zipEntries,
      repo,
      customPreferences
    );
    // TODO: Apply default preferences.

    // If repository is potentially a host repo for more mods, delete the parent dir and leave the selected one.
    const isHostRepo = zipEntries.filter((entry) => entry.endsWith("theme.json")).length > 1;
    if (isHostRepo && repo.folder !== "") {
      const tempFolder = PathUtils.join(utils.modsDir, "temp");
      await IOUtils.move(PathUtils.join(themeFolder, ...repo.folder.split("/")), tempFolder);
      await IOUtils.remove(themeFolder, { recursive: true });
      await IOUtils.move(tempFolder, themeFolder);

      const keys = ["chrome", "content"];
      for (const key of keys) {
        newThemeData.style[key] = newThemeData.style[key].replace(`${repo.folder}/`, "");
      }

      newThemeData.preferences = newThemeData.preferences.replace(`${repo.folder}/`, "");
    }

    const modHasModules = Object.hasOwn(newThemeData, "modules");
    if (modHasModules) {
      for (const modModule of newThemeData.modules) {
        if (!Object.values(currModsList).some((item) => item.homepage === modModule)) {
          promises.push(this.installMod(modModule, null, false));
        }
      }
    }

    await Promise.all(promises);
    newThemeData["no-updates"] = false;
    newThemeData.enabled = true;

    if (modHasModules) {
      currModsList = await utils.getMods();
    }
    currModsList[newThemeData.id] = newThemeData;

    await IOUtils.writeJSON(utils.modsDataFile, currModsList);
    if (currModData) {
      return Object.hasOwn(newThemeData, "scripts");
    }

    return false;
  }

  /**
   * Toggles a mod to be enabled or disabled.
   *
   * @param {object} installedMods - Current list of installed mod metadata.
   * @param {string} id - Id of mod to toggle.
   * @returns {object} New mod metadata.
   */
  async toggleTheme(installedMods, id) {
    const themeData = installedMods[id];

    themeData.enabled = !themeData.enabled;
    await IOUtils.writeJSON(utils.modsDataFile, installedMods);

    if (Object.hasOwn(themeData, "scripts")) {
      if (!themeData.supportsUnload && !themeData.enabled) {
        ucAPI.showToast({
          id: "6-disabled",
        });
      }

      this.removeUnloadListeners(id);
    }

    this.rebuildMods();

    return themeData;
  }

  /**
   * Parses a standard GitHub link into an API link.
   *
   * @param {string} input - GitHub link to parse.
   * @returns {string} API version of link.
   */
  static translateToAPI(input) {
    const trimmedInput = input.trim().replace(/\/+$/u, "");
    const regex = /(?:https?:\/\/github\.com\/)?([\w\-.]+)\/([\w\-.]+)/iu;
    const match = trimmedInput.match(regex);
    if (!match) {
      return null;
    }
    const user = match[1];
    const returnRepo = match[2];
    return `https://api.github.com/repos/${user}/${returnRepo}`;
  }

  /**
   * Generates a list of mod metadata based on specified parameters from a repo and defaults.
   *
   * @param {string} repo - Repo link which data was fetched from.
   * @param {object} themes - List of currently installed mod data.
   * @param {object} theme - Specified mod data. (defaults to an empty object)
   * @param {boolean} minimal - Whether generated data should be minimal.
   * @param {object | null} githubAPI - Optional GitHub API fetched from a previous minimal call.
   * @returns {object} If minimal is true, an object of theme data and the GitHub API, or just theme
   *   data.
   */
  async createThemeJSON(repo, themes, theme = {}, minimal = false, githubAPI = null) {
    const apiRequiringProperties = minimal ? ["updatedAt"] : ["description", "updatedAt"];
    let needAPI = false;
    for (const property of apiRequiringProperties) {
      if (!Object.hasOwn(theme, property)) {
        needAPI = true;
      }
    }
    if (needAPI && !githubAPI) {
      githubAPI = ucAPI.fetch(this.constructor.translateToAPI(repo));
    }

    let promise;
    const setProperty = (property, value) => {
      const notNull =
        typeof value === "object" ||
        (typeof value === "string" && value && value !== "404: Not Found");
      if (notNull && !Object.hasOwn(theme, property)) {
        theme[property] = value;
      }
    };

    if (!minimal) {
      let randomID;
      do {
        randomID = ucAPI.utils.generateUUID();
      } while (Object.hasOwn(themes, randomID));
      setProperty("id", randomID);

      setProperty("homepage", repo);

      const parsedRepo = this.constructor.parseGitHubUrl(repo);
      setProperty("name", parsedRepo.folder || parsedRepo.name);

      if (!Object.hasOwn(theme, "version")) {
        promise = (async () => {
          const releasesData = await ucAPI.fetch(
            `${this.constructor.translateToAPI(repo)}/releases/latest`
          );
          setProperty(
            "version",
            Object.hasOwn(releasesData, "tag_name")
              ? releasesData.tag_name.toLowerCase().replace("v", "")
              : "1.0.0"
          );
        })();
      }
    }
    if (needAPI) {
      githubAPI = await githubAPI;
      if (!minimal) {
        setProperty("description", githubAPI.description);
      }
      setProperty("updatedAt", githubAPI.updated_at);
    }

    await promise;
    return minimal ? { theme, githubAPI } : theme;
  }
}

export default new Manager();
