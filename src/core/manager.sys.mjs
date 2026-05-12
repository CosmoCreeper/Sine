// => core/manager.sys.mjs
// ===========================================================
// This module manages mods and themes, allowing Sine to
// enable, disable, and remove them.
// ===========================================================

import utils from "./utils.sys.mjs";
import domUtils from "../utils/dom.mjs";
import ucAPI from "../utils/uc_api.sys.mjs";

class Manager {
  preferences = ChromeUtils.importESModule("chrome://userscripts/content/core/preferences.sys.mjs");
  marketplace = ChromeUtils.importESModule(
    "chrome://userscripts/content/services/marketplace.sys.mjs"
  ).default;
  #stylesheetManager = ChromeUtils.importESModule(
    "chrome://userscripts/content/services/stylesheets.sys.mjs"
  ).default;
  #unloadListeners = {};

  addUnloadListener(script, window, callback) {
    this.#unloadListeners[script] ??= new Map();
    const scriptListeners = this.#unloadListeners[script];
    scriptListeners.set(window, callback);
  }

  async triggerUnloadListener(chromePath, window) {
    const listeners = this.#unloadListeners[chromePath];
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
      delete this.#unloadListeners[chromePath];
    }

    // Script is no longer loaded, return false.
    return false;
  }

  async removeUnloadListeners(modId) {
    for (const [scriptName, listeners] of Object.entries(this.#unloadListeners)) {
      if (scriptName.startsWith(`chrome://sine/content/${modId}/`)) {
        for (const listener of listeners.values()) {
          if (listener) {
            await listener();
          }
        }
        delete this.#unloadListeners[scriptName];
      }
    }
  }

  removeListenersForDOM(window) {
    for (const listeners of Object.values(this.#unloadListeners)) {
      if (listeners.has(window)) {
        const windowListener = listeners.get(window);
        if (windowListener) {
          windowListener();
        }

        listeners.delete(window);
      }
    }
  }

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

  async #registerChromeManifest(manifestPath, modId) {
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
      this.#registerChromeManifest(mod.chromeManifest, mod.id);
    }

    // Inject background modules.
    for (const scriptPath of Object.keys(scripts)) {
      if (scriptPath.endsWith(".sys.mjs")) {
        const chromePath = `chrome://sine/content/${scriptPath}`;

        // TODO: Find a way to pass addUnloadListener to background scripts.
        try {
          if (scripts[scriptPath].enabled && !Object.hasOwn(this.#unloadListeners, chromePath)) {
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
    for (const process of processes) {
      this.appendInterfaceToDOM(process);

      ChromeUtils.compileScript("chrome://userscripts/content/services/module_loader.mjs")
        .then((script) => script.executeInGlobal(process))
        .catch((err) => console.warn("[Sine]: Failed to load module script:", err));

      for (const [scriptPath, scriptOptions] of Object.entries(scripts)) {
        if (scriptOptions.regex.test(process.location.href) && scriptPath.endsWith(".uc.js")) {
          const chromePath = `chrome://sine/content/${scriptPath}`;

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
        }
      }
    }
  }

  observe(subject, topic) {
    if (topic === "chrome-document-global-created" && subject) {
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
        ChromeUtils.compileScript("chrome://userscripts/content/services/module_loader.mjs").then(
          (script) => script.executeInGlobal(window)
        );

        for (const scriptPath of Object.keys(scripts)) {
          if (scriptPath.endsWith(".uc.js")) {
            Services.scriptloader.loadSubScriptWithOptions(`chrome://sine/content/${scriptPath}`, {
              target: window,
              ignoreCache: true,
            });
          }
        }

        this.#stylesheetManager.onWindow(window);
      });

      subject.addEventListener("beforeunload", (event) => {
        const window = event.target.defaultView;
        this.removeListenersForDOM(window);
      });
    }
  }

  initWinListener() {
    Services.obs.addObserver(this, "chrome-document-global-created");
  }

  async removeMod(id) {
    // Unload JS listeners first.
    await this.removeUnloadListeners(id);

    const installedMods = await utils.getMods();
    delete installedMods[id];
    await IOUtils.writeJSON(utils.modsDataFile, installedMods);

    await IOUtils.remove(utils.getModFolder(id), { recursive: true });

    this.rebuildMods(false);
  }

  #buildModXUL(document, modId, modData, modsChanged) {
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
      enableToggle.setAttribute("data-l10n-id", `${enableToggleLocale}-enabled`);
    } else {
      enableToggle.setAttribute("data-l10n-id", `${enableToggleLocale}-disabled`);
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
      configureBtn.setAttribute("data-l10n-id", "sine-settings-button");
      configureBtn.setAttribute("data-l10n-attrs", "title");

      const sineItemActions = item.querySelector(".sineItemActions");
      sineItemActions.insertBefore(configureBtn, sineItemActions.children[0]);
    }

    const updateToggle = item.querySelector(".auto-update-toggle");
    const updateToggleLocale = "sine-mod-update-disable";
    if (modData["no-updates"]) {
      updateToggle.setAttribute("enabled", "");
      updateToggle.setAttribute("data-l10n-id", `${updateToggleLocale}-enabled`);
    } else {
      updateToggle.setAttribute("data-l10n-id", `${updateToggleLocale}-disabled`);
    }

    return item;
  }

  async loadMods(specificWindow = null, modsChanged = null) {
    let installedMods = await utils.getMods();

    const pages = utils.getProcesses(specificWindow, ["settings", "preferences"]);
    for (const window of pages) {
      const document = window.document;

      document.querySelector("#sineModsList").innerHTML = "";

      if (!Services.prefs.getBoolPref("sine.mods.disable-all", false)) {
        const sortedArr = Object.values(installedMods).sort((a, b) => a.name.localeCompare(b.name));
        const ids = sortedArr.map((obj) => obj.id);
        for (const key of ids) {
          const modData = installedMods[key];
          // Create new item.
          const item = this.#buildModXUL(document, key, modData, modsChanged);

          const modVersion = modData.version ? ` (v${modData.version})` : "";
          item.querySelectorAll(".sineItemTitle").forEach((el) => {
            el.textContent = modData.name + modVersion;
          });

          const toggle = item.querySelector(".sineItemPreferenceToggle");
          toggle.addEventListener("toggle", async () => {
            installedMods = await utils.getMods();
            const theme = await this.toggleTheme(installedMods, modData.id);
            toggle.setAttribute(
              "data-l10n-id",
              `sine-mod-disable-${theme.enabled ? "enabled" : "disabled"}`
            );
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
                  item.querySelector(".sineItemPreferenceDialogContent").appendChild(prefEl);
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
            if (!updateButton.getAttribute("enabled")) {
              updateButton.setAttribute("enabled", true);
              updateButton.setAttribute("data-l10n-id", "sine-mod-update-disable-enabled");
            } else {
              updateButton.removeAttribute("enabled");
              updateButton.setAttribute("data-l10n-id", "sine-mod-update-disable-disabled");
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
      } else {
        domUtils.appendXUL(
          document.querySelector("#sineModsList"),
          `<description class="description-deemphasized" data-l10n-id="sine-mods-disabled-desc"/>`,
          null,
          window.MozXULElement
        );
      }
    }
  }

  async processModUpdate(currModData, currModsList, marketplaceData) {
    let newThemeData, githubAPI, originalData, homepage;

    if (currModData.homepage) {
      if (currModData.origin === "store") {
        marketplaceData ??= await ucAPI.fetch(
          `https://raw.githubusercontent.com/sineorg/store/main/marketplace.json`
        );
        newThemeData = marketplaceData[currModData.id];
        homepage = "{store}";
      } else {
        originalData = await ucAPI.fetch(`${utils.rawURL(currModData.homepage)}theme.json`);
        const minimalData = await this.createThemeJSON(
          currModData.homepage,
          currModsList,
          typeof originalData !== "object" ? {} : originalData,
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
        typeof newThemeData !== "object" ? {} : newThemeData,
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
    return { changed: true, modHasJS, marketplaceData };
  }

  async updateMods(source) {
    if (source === "auto" && !utils.autoUpdate) return false;

    const currModsList = await utils.getMods();
    const modsChanged = [];
    let changeMadeHasJS = false;
    let marketplaceData;

    for (const key in currModsList) {
      const currModData = currModsList[key];
      if (!currModData.enabled || currModData["no-updates"]) continue;

      const result = await this.processModUpdate(currModData, currModsList, marketplaceData);
      marketplaceData = result.marketplaceData;

      if (result.changed) {
        modsChanged.push(currModData.id);
        changeMadeHasJS ||= result.modHasJS;
      }
    }

    if (changeMadeHasJS) {
      ucAPI.showToast({
        id: "2",
      });
    }

    const modsHaveChanged = modsChanged.length !== 0;
    if (modsHaveChanged) {
      this.rebuildMods();
      this.loadMods(null, modsChanged);
    }
    return modsHaveChanged;
  }

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
            await this.createThemeJSON(repo, currModsList, typeof res !== "object" ? {} : res)
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

  parseGitHubUrl(url) {
    url = url.replace(/(\?.+)?(\/+)?$/, "");

    const regexes = [
      /^(?:https?:\/\/)?github\.com\/([^/]+)\/([^/]+)$/,
      /^(?:https?:\/\/)?github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)(\/.*)?$/,
      /^(?:https?:\/\/)?raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/refs\/heads\/([^/]+)(\/.*)?$/,
      /^(?:https?:\/\/)?raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)(\/.*)?$/,
      /^([^/]+)\/([^/]+)\/tree\/([^/]+)(\/.*)?$/,
      /^([^/]+)\/([^/]+)$/,
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
          folder: folder.replace(/^\/+/, ""),
        };
      }
    }

    throw new Error("[Sine]: Unknown GitHub repo format, unable to parse.");
  }

  findFile(modId, fileNames, modEntries, repo, customUrl) {
    const repoFolder = repo.folder ? `${repo.folder}/` : "";
    const fileEntries = modEntries.filter(
      (entry) =>
        (fileNames.filter((name) => entry.endsWith(name)).length !== 0 &&
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
    let repo = this.parseGitHubUrl(repoLink);

    const tmpFolder = PathUtils.join(utils.modsDir, `tmp-${currModData.id}`);
    if (currModData) {
      await IOUtils.copy(themeFolder, tmpFolder, { recursive: true });
      await IOUtils.remove(themeFolder, { recursive: true });
    }

    let zipUrl = `https://codeload.github.com/${repo.author}/${repo.name}/zip/refs/heads/${repo.branch}`;
    if (newThemeData.origin === "store") {
      repo = this.parseGitHubUrl(newThemeData.homepage);
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
        ? this.parseGitHubUrl(value).folder
        : value;

    customChrome = normalizePath(customChrome);
    customContent = normalizePath(customContent);
    const customPreferences = normalizePath(preferences);

    newThemeData.style = {};
    newThemeData.style.chrome = this.findFile(
      newThemeData.id,
      ["userChrome.css", "chrome.css"],
      zipEntries,
      repo,
      customChrome
    );
    newThemeData.style.content = this.findFile(
      newThemeData.id,
      ["userContent.css"],
      zipEntries,
      repo,
      customContent
    );

    newThemeData.preferences = this.findFile(
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

  async createThemeJSON(repo, themes, theme = {}, minimal = false, githubAPI = null) {
    const translateToAPI = (input) => {
      const trimmedInput = input.trim().replace(/\/+$/, "");
      const regex = /(?:https?:\/\/github\.com\/)?([\w\-.]+)\/([\w\-.]+)/i;
      const match = trimmedInput.match(regex);
      if (!match) {
        return null;
      }
      const user = match[1];
      const returnRepo = match[2];
      return `https://api.github.com/repos/${user}/${returnRepo}`;
    };
    const notNull = (data) => {
      return (
        typeof data === "object" ||
        (typeof data === "string" && data && data.toLowerCase() !== "404: not found")
      );
    };

    const apiRequiringProperties = minimal ? ["updatedAt"] : ["description", "updatedAt"];
    let needAPI = false;
    for (const property of apiRequiringProperties) {
      if (!Object.hasOwn(theme, property)) {
        needAPI = true;
      }
    }
    if (needAPI && !githubAPI) {
      githubAPI = ucAPI.fetch(translateToAPI(repo));
    }

    let promise;
    const setProperty = (property, value) => {
      if (notNull(value) && !Object.hasOwn(theme, property)) {
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

      const parsedRepo = this.parseGitHubUrl(repo);
      setProperty("name", parsedRepo.folder || parsedRepo.name);

      if (!Object.hasOwn(theme, "version")) {
        promise = (async () => {
          const releasesData = await ucAPI.fetch(`${translateToAPI(repo)}/releases/latest`);
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
