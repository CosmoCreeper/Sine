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
  #scriptFailures = new Map();
  #updateOperation = null;
  #rebuildOperation = Promise.resolve();

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
   * @param {boolean} reportFailure - Whether failed non-unloadable initialization blocks loading.
   * @returns {boolean} Whether script remains loaded or not.
   */
  async triggerUnloadListener(chromePath, window, reportFailure = true) {
    const listeners = this.#unloadListeners.get(chromePath);
    if (!listeners) return false;

    // If there is no match for the window, then the script was not loaded in this DOM.
    if (!listeners.has(window)) return false;

    const callback = listeners.get(window);
    // If the script was loaded but there is no registered callback for unloading, it will remain loaded.
    if (!callback) {
      const failure = this.#scriptFailures.get(chromePath)?.get(window);
      if (failure && reportFailure)
        throw new Error(`Restart required after failed initialization: ${chromePath}`, {
          cause: failure,
        });
      return true;
    }

    try {
      await callback();
    } catch (err) {
      console.warn(`[Sine]: Failed to unload "${chromePath}":`, err);
      throw err;
    }

    listeners.delete(window);
    this.#scriptFailures.get(chromePath)?.delete(window);

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
        for (const window of listeners.keys()) {
          allUnloadPromises.push(this.triggerUnloadListener(scriptName, window, false));
        }
      }
    }
    const results = await Promise.allSettled(allUnloadPromises);
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length)
      throw new AggregateError(
        failures.map((result) => result.reason),
        "Mod cleanup failed"
      );
  }

  /**
   * Retains failed partial initialization until cleanup succeeds or the window closes.
   *
   * @param {string} path - Script URI.
   * @param {Window | null} window - Owning window, or null for background modules.
   * @param {Error} error - Initialization failure.
   */
  scriptLoadFailed(path, window, error) {
    if (!this.#scriptFailures.has(path)) this.#scriptFailures.set(path, new Map());
    this.#scriptFailures.get(path).set(window, error);
  }

  /**
   * Removes all unload listeners related to a window. Should be executed when a window is closed or
   * unloaded.
   *
   * @param {Window} window - Window to remove unload listeners from.
   */
  removeListenersForDOM(window) {
    for (const [path, listeners] of this.#unloadListeners) {
      if (listeners.has(window)) {
        const windowListener = listeners.get(window);
        if (windowListener) {
          Promise.resolve()
            .then(windowListener)
            .catch((error) => console.warn("[Sine]: Window cleanup failed:", error));
        }

        listeners.delete(window);
        this.#scriptFailures.get(path)?.delete(window);
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
      let script = Components.stack.caller?.filename.split("?")[0];

      // Only allow custom script paths if it's from a trusted file.
      if (script === "chrome://userscripts/content/services/module_loader.mjs") {
        script = scriptPath;
      }

      if (script) {
        addUnloadListener(script, window, callback);
      }
    };
    window.triggerUnloadListener = this.triggerUnloadListener.bind(this);
    window.sineScriptLoadFailed = (path, error) => {
      if (
        Components.stack.caller?.filename.split("?")[0] ===
        "chrome://userscripts/content/services/module_loader.mjs"
      ) {
        this.scriptLoadFailed(path, window, error);
      }
    };
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
   * @returns {Promise<void>} Completion of the requested rebuild.
   */
  rebuildMods(rebuildJS = true, reloadStyles = true) {
    const operation = this.#rebuildOperation.then(() => this.#rebuildMods(rebuildJS, reloadStyles));
    this.#rebuildOperation = operation.catch(() => null);
    return operation;
  }

  /**
   * Waits for the loader, whose compiled-script completion value Gecko discards.
   *
   * @param {Window} process - Window receiving the scripts.
   * @returns {Promise<void>} Completion after module initialization.
   */
  static async #loadModuleScripts(process) {
    const script = await ChromeUtils.compileScript(
      "chrome://userscripts/content/services/module_loader.mjs"
    );
    script.executeInGlobal(process);
    const initialization = process.sineModuleInitialization;
    try {
      await initialization;
    } finally {
      if (process.sineModuleInitialization === initialization) {
        delete process.sineModuleInitialization;
      }
    }
  }

  /**
   * Performs a serialized rebuild, including module initialization.
   *
   * @param {boolean} rebuildJS - Whether to reload scripts.
   * @param {boolean} reloadStyles - Whether to reload styles.
   * @returns {Promise<void>} Completion of the rebuild.
   */
  async #rebuildMods(rebuildJS, reloadStyles) {
    if (Services.prefs.getBoolPref("sine.mods.disable-all", false)) {
      return;
    }

    await this.#stylesheetManager.rebuildMods(reloadStyles);

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
    const promises = [];
    for (const scriptPath of Object.keys(scripts)) {
      if (scriptPath.endsWith(".sys.mjs")) {
        const chromePath = `chrome://sine/content/${scriptPath}`;

        // TODO: Find a way to pass Sine interface to background scripts. Sandboxing execution?
        try {
          const failure = this.#scriptFailures.get(chromePath)?.get(null);
          if (scripts[scriptPath].enabled && failure) throw failure;
          if (scripts[scriptPath].enabled && !this.#unloadListeners.has(chromePath)) {
            // Null is being passed as window until a reference for such is found.
            this.addUnloadListener(chromePath, null, null);
            ChromeUtils.importESModule(chromePath);
          }
        } catch (err) {
          console.warn("[Sine]: Failed to load background script:", err);
          this.scriptLoadFailed(chromePath, null, err);
          promises.push(Promise.reject(err));
        }
      }
    }

    // TODO: Only refresh scripts that must be refreshed.
    const processes = utils.getProcesses();
    for (const process of processes) {
      this.appendInterfaceToDOM(process);

      promises.push(this.constructor.#loadModuleScripts(process));

      for (const [scriptPath, scriptOptions] of Object.entries(scripts)) {
        if (scriptOptions.regex.test(process.location.href) && scriptPath.endsWith(".uc.js")) {
          const chromePath = `chrome://sine/content/${scriptPath}`;

          promises.push(
            (async () => {
              const scriptLoaded = await this.triggerUnloadListener(
                chromePath,
                process,
                scriptOptions.enabled
              );
              if (scriptOptions.enabled && !scriptLoaded) {
                try {
                  this.addUnloadListener(chromePath, process, null);
                  Services.scriptloader.loadSubScriptWithOptions(chromePath, {
                    target: process,
                    ignoreCache: true,
                  });
                } catch (err) {
                  console.warn("[Sine]: Failed to load script:", err);
                  this.scriptLoadFailed(chromePath, process, err);
                  throw err;
                }
              }
            })()
          );
        }
      }
    }
    const results = await Promise.allSettled(promises);
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length)
      throw new AggregateError(
        failures.map((result) => result.reason),
        "Mod reload failed"
      );
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
        this.constructor.#loadModuleScripts(window).catch((err) =>
          console.error(`[Sine:Manager]: Failed to compile module loader.\n${err}`)
        );

        for (const scriptPath of Object.keys(scripts)) {
          if (scriptPath.endsWith(".uc.js")) {
            const chromePath = `chrome://sine/content/${scriptPath}`;
            // Preserve initial script load order while waiting for prior cleanup.
            // oxlint-disable-next-line eslint/no-await-in-loop
            if (await this.triggerUnloadListener(chromePath, window)) continue;
            this.addUnloadListener(chromePath, window, null);
            try {
              Services.scriptloader.loadSubScriptWithOptions(chromePath, {
                target: window,
                ignoreCache: true,
              });
            } catch (error) {
              this.scriptLoadFailed(chromePath, window, error);
              console.error("[Sine]: Initial script load failed:", error);
            }
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

    const folder = utils.getModFolder(id);
    const stage = PathUtils.join(utils.modsDir, `.sine-remove-${Services.uuid.generateUUID()}`);
    const backup = PathUtils.join(stage, "previous");
    let moved = false;
    let keepStage = false;
    await IOUtils.makeDirectory(stage);
    try {
      await utils.mutateMods(
        async (installedMods) => {
          await IOUtils.writeJSON(PathUtils.join(stage, "transaction.json"), {
            id,
            previous: installedMods[id] ?? null,
            next: null,
          });
          // oxlint-disable-next-line typescript/no-dynamic-delete
          delete installedMods[id];
          if (await IOUtils.exists(folder)) {
            await IOUtils.move(folder, backup);
            moved = true;
          }
        },
        async () => {
          if (moved) {
            try {
              await IOUtils.move(backup, folder);
            } catch (error) {
              keepStage = true;
              throw new Error(`Uninstall rollback retained in ${stage}`, { cause: error });
            }
          }
        }
      );
    } finally {
      if (!keepStage) await IOUtils.remove(stage, { recursive: true, ignoreAbsent: true });
    }
    await this.rebuildMods(false);
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
            await utils.mutateMods((latest) => {
              if (latest[key]) latest[key]["no-updates"] = !latest[key]["no-updates"];
            });
            if (updateButton.getAttribute("enabled")) {
              updateButton.removeAttribute("enabled");
              updateButton.dataset.l10nId = "sine-mod-update-disable-disabled";
            } else {
              updateButton.setAttribute("enabled", true);
              updateButton.dataset.l10nId = "sine-mod-update-disable-enabled";
            }
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

    if (currModData.origin === "store") {
      newThemeData = marketplaceData?.[currModData.id];
      homepage = "{store}";
    } else if (currModData.homepage) {
      originalData = await ucAPI.fetch(`${utils.rawURL(currModData.homepage)}theme.json`);
      if (
        !originalData ||
        (typeof originalData !== "object" && !/^404: not found$/iu.test(originalData))
      ) {
        throw new Error(`Failed to read update metadata for ${currModData.id}`);
      }
      const minimalData = await this.createThemeJSON(
        currModData.homepage,
        currModsList,
        typeof originalData === "object" ? Object.assign({}, originalData) : {},
        true
      );
      newThemeData = minimalData.theme;
      githubAPI = minimalData.githubAPI;
    } else {
      newThemeData = await ucAPI.fetch(
        `https://raw.githubusercontent.com/zen-browser/theme-store/main/themes/${currModData.id}/theme.json`
      );
      homepage = newThemeData?.homepage;
    }

    if (!newThemeData || typeof newThemeData !== "object" || Array.isArray(newThemeData)) {
      throw new Error(`Update source unavailable for ${currModData.id}`);
    }
    if (!this.constructor.#hasUpdate(currModData, newThemeData)) return { changed: false };

    if (currModData.homepage && currModData.origin !== "store") {
      newThemeData.id = currModData.id;
      const customData = await this.createThemeJSON(
        currModData.homepage,
        currModsList,
        newThemeData,
        false,
        githubAPI
      );
      customData.id = currModData.id;
      this.constructor.#restoreOptionalFields(customData, originalData, currModData);
      newThemeData = customData;
      homepage = newThemeData.homepage;
    }

    const modHasJS = await this.syncModData(homepage, currModsList, newThemeData, currModData);
    return { changed: true, modHasJS, id: currModData.id };
  }

  /**
   * Preserves installed labels when author metadata omits them.
   *
   * @param {object} candidate - Generated candidate metadata.
   * @param {object | string} original - Author metadata or the optional-file 404 response.
   * @param {object} current - Installed metadata.
   */
  static #restoreOptionalFields(candidate, original, current) {
    for (const property of ["name", "description"]) {
      if ((typeof original !== "object" || !original[property]) && current[property]) {
        candidate[property] = current[property];
      }
    }
  }

  /**
   * Compares immutable store commits or usable author-provided metadata.
   *
   * @param {object} current - Installed metadata.
   * @param {object} next - Candidate metadata.
   * @returns {boolean} Whether a replacement is available.
   */
  static #hasUpdate(current, next) {
    const oldDate = Date.parse(current.updatedAt);
    const newDate = Date.parse(next.updatedAt);
    const numericVersion = /^\d+(?:\.\d+)*$/u;
    const versionChanged =
      numericVersion.test(current.version) &&
      numericVersion.test(next.version) &&
      Services.vc.compare(next.version, current.version) > 0;
    if (current.origin === "store" && next.commit) {
      if (!/^[a-f0-9]{40}$/iu.test(next.commit)) {
        throw new Error(`Invalid store commit for ${current.id}`);
      }
      return current.commit !== next.commit;
    }
    if (Number.isFinite(newDate)) {
      return !Number.isFinite(oldDate) || oldDate < newDate || versionChanged;
    }
    if (versionChanged) return true;
    throw new Error(`No usable update identity for ${current.id}`);
  }

  /**
   * Checks for updates on all mods.
   *
   * @param {string | null} source - "auto" or null. If source is auto, will check if automatic
   *   updates are enabled.
   * @returns {Promise<object>} Updated mod IDs and individual failures, after reload.
   */
  updateMods(source) {
    if (source === "auto" && !utils.autoUpdate) {
      return Promise.resolve({ updated: [], failed: [], skipped: true });
    }
    if (this.#updateOperation) return this.#updateOperation;
    this.#updateOperation = this.#updateMods().finally(() => {
      this.#updateOperation = null;
    });
    return this.#updateOperation;
  }

  /**
   * Runs one update batch; failures do not suppress independent successes.
   *
   * @returns {Promise<object>} Updated IDs and individual failures.
   */
  async #updateMods() {
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
    for (const currModData of Object.values(currModsList)) {
      if (!currModData.enabled || currModData["no-updates"]) {
        continue;
      }

      promises.push(
        (async () => {
          try {
            const marketplaceData =
              currModData.origin === "store" ? await getMarketplaceData() : null;
            return await this.processModUpdate(currModData, currModsList, marketplaceData);
          } catch (error) {
            console.warn(`[Sine]: Failed to update ${currModData.id}:`, error);
            return { changed: false, id: currModData.id, error };
          }
        })()
      );
    }
    const results = await Promise.allSettled(promises);
    const failed = [];

    for (const settled of results) {
      if (settled.status === "rejected") {
        failed.push({ id: "marketplace", error: String(settled.reason) });
        continue;
      }
      const result = settled.value;
      if (result.error) failed.push({ id: result.id, error: String(result.error) });
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
      return { updated: [], failed };
    }
    try {
      await this.rebuildMods();
    } catch (error) {
      console.error("[Sine]: Updated files could not be activated:", error);
      failed.push({ id: "reload", error: String(error) });
    }
    try {
      await this.loadMods(null, modsChanged);
    } catch (error) {
      console.error("[Sine]: Could not refresh the installed mod list:", error);
      failed.push({ id: "settings", error: String(error) });
    }
    return { updated: modsChanged, failed };
  }

  /**
   * Installs a mod from a repository.
   *
   * @param {string} repo - GitHub repository to install from.
   * @param {string | null} origin - Origin of mod, "store," or none.
   * @param {boolean} reload - If true, will reload mods after installing.
   * @returns {Promise<string>} Installed mod ID.
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
        await this.rebuildMods();
        await this.loadMods();
      }
      return newThemeData.id;
    }
    throw new Error(`Mod metadata unavailable: ${repo}`);
  }

  /**
   * Reinstalls exported sources; imported metadata is not trusted as the installed payload.
   *
   * @param {object[] | object} exported - Exported mod entries.
   * @returns {Promise<void>} Completion including the final reload.
   */
  async importMods(exported) {
    const results = await Promise.allSettled(
      Object.values(exported).map(async (mod) => {
        const id = await this.installMod(
          mod.origin === "store" ? mod.id : mod.homepage,
          mod.origin === "store" ? "store" : null,
          false
        );
        await utils.mutateMods((latest) => {
          if (!latest[id]) throw new Error(`Imported mod no longer installed: ${id}`);
          if (typeof mod.enabled === "boolean") latest[id].enabled = mod.enabled;
          if (typeof mod["no-updates"] === "boolean") latest[id]["no-updates"] = mod["no-updates"];
        });
      })
    );
    const errors = results
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason);
    try {
      await this.rebuildMods();
    } catch (error) {
      errors.push(error);
    }
    try {
      await this.loadMods();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length)
      throw new AggregateError(errors, "Some mods could not be imported or activated");
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
      /^(?:https?:\/\/)?github\.com\/([^/]+)\/([^/]+)\/commit\/([^/]+)(\/.*)?$/u,
      /^(?:https?:\/\/)?raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/refs\/heads\/([^/]+)(\/.*)?$/u,
      /^(?:https?:\/\/)?raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)(\/.*)?$/u,
      /^([^/]+)\/([^/]+)\/tree\/([^/]+)(\/.*)?$/u,
      /^([^/]+)\/([^/]+)\/commit\/([^/]+)(\/.*)?$/u,
      /^([^/]+)\/([^/]+)$/u,
    ];

    for (const [idx, regex] of regexes.entries()) {
      const match = url.match(regex);
      if (match) {
        const author = match[1];
        const repo = match[2];

        let branch = "main";
        let folder = "";
        if (match.length > 3) {
          if (idx === 2 || idx === 6) {
            branch = match[3];
          } else {
            branch = `refs/heads/${match[3]}`;
          }
          folder = match[4] || "";
        }

        return {
          name: repo,
          author,
          branch,
          folder: decodeURIComponent(folder.replace(/^\/+/u, "")),
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
    if (repoLink === "{store}") {
      const repoData = this.constructor.parseGitHubUrl(newThemeData.homepage);
      repoLink = `${repoData.author}/${repoData.name}/commit/${newThemeData.commit}/${repoData.folder}`;
      newThemeData.origin = "store";
    } else if (newThemeData.origin) {
      // Prevent mods from pretending to be verified and from the store.
      delete newThemeData.origin;
    }
    let repo = this.constructor.parseGitHubUrl(repoLink);

    const stage = PathUtils.join(utils.modsDir, `.sine-update-${Services.uuid.generateUUID()}`);
    await IOUtils.makeDirectory(stage);
    // Keep archive paths short on Windows and independent of the public mod ID.
    const candidate = PathUtils.join(stage, "payload");
    const backup = PathUtils.join(stage, "previous");
    let previousMoved = false;
    let candidateMoved = false;
    let keepStage = false;
    try {
      let zipUrl = `https://codeload.github.com/${repo.author}/${repo.name}/zip/${repo.branch}`;
      const extractedEntries = await ucAPI.unpackRemoteArchive({
        url: zipUrl,
        id: "payload",
        zipPath: PathUtils.join(stage, "download.zip"),
        extractDir: stage,
        applyName: true,
      });
      const zipEntries = extractedEntries.map((entry) =>
        entry.replace(/^payload\//u, `${newThemeData.id}/`)
      );

      if (!(await IOUtils.exists(PathUtils.join(candidate, repo.folder)))) {
        throw new Error(`Mod folder missing from archive: ${newThemeData.id}`);
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

      const normalizePath = (value) => {
        const path =
          typeof value === "string" && value.startsWith("https://")
            ? this.constructor.parseGitHubUrl(value).folder
            : value;
        const prefix = `${repo.folder}/`;
        return path?.startsWith(prefix) ? path.slice(prefix.length) : path;
      };

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
      if (repo.folder !== "") {
        const tempFolder = PathUtils.join(stage, "selected");
        await IOUtils.move(PathUtils.join(candidate, ...repo.folder.split("/")), tempFolder);
        await IOUtils.remove(candidate, { recursive: true });
        await IOUtils.move(tempFolder, candidate);

        const keys = ["chrome", "content"];
        for (const key of keys) {
          newThemeData.style[key] = newThemeData.style[key].replace(`${repo.folder}/`, "");
        }

        newThemeData.preferences = newThemeData.preferences.replace(`${repo.folder}/`, "");
      }

      if (!(await this.constructor.#hasEntrypoints(newThemeData, candidate))) {
        throw new Error(`Archive contains no mod entrypoints: ${newThemeData.id}`);
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
      await utils.mutateMods(
        async (latest) => {
          const current = latest[newThemeData.id];
          if (currModData && !current)
            throw new Error(`Mod removed during update: ${newThemeData.id}`);
          newThemeData["no-updates"] = current?.["no-updates"] ?? false;
          newThemeData.enabled = current?.enabled ?? true;
          await IOUtils.writeJSON(PathUtils.join(stage, "transaction.json"), {
            id: newThemeData.id,
            previous: current ?? null,
            next: newThemeData,
          });
          if (await IOUtils.exists(themeFolder)) {
            await IOUtils.move(themeFolder, backup);
            previousMoved = true;
          }
          await IOUtils.move(candidate, themeFolder);
          candidateMoved = true;
          latest[newThemeData.id] = newThemeData;
        },
        async () => {
          try {
            if (candidateMoved) await IOUtils.remove(themeFolder, { recursive: true });
            if (previousMoved) await IOUtils.move(backup, themeFolder);
          } catch (error) {
            keepStage = true;
            throw new Error(`Rollback failed; previous mod retained in ${stage}`, { cause: error });
          }
        }
      );
      if (currModData) {
        return Object.hasOwn(newThemeData, "scripts");
      }

      return false;
    } finally {
      if (!keepStage) await IOUtils.remove(stage, { recursive: true, ignoreAbsent: true });
    }
  }

  /**
   * Accepts style, script, manifest, preference-only and module-container mods.
   *
   * @param {object} mod - Resolved mod metadata.
   * @param {string} folder - Staged mod directory.
   * @returns {boolean} Whether there is a loadable or configurable entrypoint.
   */
  static async #hasEntrypoints(mod, folder) {
    const paths = [mod.style.chrome, mod.style.content, mod.preferences, mod.chromeManifest].filter(
      Boolean
    );
    const visit = (scripts, parent = "") => {
      for (const [name, value] of Object.entries(scripts || {})) {
        const path = parent ? `${parent}/${name}` : name;
        if (/\.(?:uc\.js|uc\.mjs|sys\.mjs)$/u.test(path)) paths.push(path);
        else if (value && typeof value === "object") visit(value, path);
      }
    };
    visit(mod.scripts);
    await Promise.all(
      paths.map(async (path) => {
        const segments = path.split("/");
        if (
          segments.some(
            (segment) => !segment || segment === "." || segment === ".." || /[\\:\0]/u.test(segment)
          ) ||
          !(await IOUtils.exists(PathUtils.join(folder, ...segments)))
        ) {
          throw new Error(`Missing or invalid mod entrypoint: ${path}`);
        }
      })
    );
    return Boolean(paths.length || mod.modules?.length);
  }

  /**
   * Toggles a mod to be enabled or disabled.
   *
   * @param {object} installedMods - Current list of installed mod metadata.
   * @param {string} id - Id of mod to toggle.
   * @returns {object} New mod metadata.
   */
  async toggleTheme(installedMods, id) {
    const themeData = await utils.mutateMods((latest) => {
      if (!latest[id]) throw new Error(`Mod no longer installed: ${id}`);
      latest[id].enabled = !latest[id].enabled;
      return latest[id];
    });

    if (Object.hasOwn(themeData, "scripts")) {
      if (!themeData.supportsUnload && !themeData.enabled) {
        ucAPI.showToast({
          id: "6-disabled",
        });
      }

      if (!themeData.enabled) await this.removeUnloadListeners(id);
    }

    await this.rebuildMods();

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
            releasesData?.tag_name
              ? releasesData.tag_name.toLowerCase().replace("v", "")
              : (themes[theme.id]?.version ?? "1.0.0")
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
