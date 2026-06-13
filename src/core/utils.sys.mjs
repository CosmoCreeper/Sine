/**
 * @file Mod-related utilities designed for other scripts. This Source Code Form is subject to the
 *   terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this
 *   file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import ucAPI from "../utils/uc_api.sys.mjs";

export default {
  /**
   * Returns the current installation branch status.
   *
   * @returns {boolean} True if the update branch is Cosine, false if Sine.
   */
  get cosine() {
    return Services.prefs.getBoolPref("sine.is-cosine", false);
  },

  /**
   * Returns the brand to use based on current branch.
   *
   * @returns {string} "cosine" if branch is Cosine, "sine" if Sine.
   */
  get brand() {
    return this.cosine ? "cosine" : "sine";
  },

  /**
   * Returns git branch to fetch based on update branch.
   *
   * @returns {string} "cosine" if branch is Cosine, "main" if Sine.
   */
  get sineBranch() {
    return Services.prefs.getBoolPref("sine.is-cosine", false) ? "cosine" : "main";
  },

  /**
   * Returns the path to the JS directory.
   *
   * @returns {string} Path to JS directory.
   */
  get jsDir() {
    return PathUtils.join(ucAPI.utils.chromeDir, "JS");
  },

  /**
   * Returns the path to the mods directory.
   *
   * @returns {string} Path to mods directory.
   */
  get modsDir() {
    return PathUtils.join(ucAPI.utils.chromeDir, "sine-mods");
  },

  /**
   * Returns the path to the main userChrome style entrypoint.
   *
   * @returns {string} Path to userChrome entrypoint.
   */
  get chromeFile() {
    return PathUtils.join(this.modsDir, "chrome.css");
  },

  /**
   * Returns the path to the main userContent style entrypoint.
   *
   * @returns {string} Path to userContent entrypoint.
   */
  get contentFile() {
    return PathUtils.join(this.modsDir, "content.css");
  },

  /**
   * Returns the path to the installed mods metadata JSON file.
   *
   * @returns {string} Path to metadata JSON file.
   */
  get modsDataFile() {
    return PathUtils.join(this.modsDir, "mods.json");
  },

  /**
   * Returns the path to a mod's folder based on it's id.
   *
   * @param {string} id - Mod id to get the folder of.
   * @returns {string} Path to mod folder.
   */
  getModFolder(id) {
    return PathUtils.join(this.modsDir, id);
  },

  /**
   * Returns the installed mods metadata JSON.
   *
   * @returns {object} Installed mods metadata.
   */
  async getMods() {
    return await IOUtils.readJSON(this.modsDataFile);
  },

  /**
   * Returns the JSON preferences for a mod.
   *
   * @param {object} mod - Mod metadata, including the name and id.
   * @returns {object[]} The list of mod preferences.
   */
  async getModPreferences(mod) {
    try {
      return await IOUtils.readJSON(
        PathUtils.join(this.getModFolder(mod.id), ...mod.preferences.split("/"))
      );
    } catch (err) {
      ucAPI.showToast({
        id: "4",
        name: mod.name,
      });
      console.warn(`[Sine]: Failed to read preferences for mod ${mod.id}:`, err);
      return {};
    }
  },

  /**
   * Returns a raw GitHub user content link when given a repo link.
   *
   * @param {string} repo - GitHub repository link.
   * @returns {string} Raw asset version of the repository link.
   */
  rawURL(repo) {
    if (repo.startsWith("[") && repo.endsWith(")") && repo.includes("](")) {
      repo = repo.replace(/^\[[a-z]+\]\(/iu, "").replace(/\)$/u, "");
    }
    repo = repo.replace(/^https:\/\/github.com\//u, "");
    let repoName;
    let branch;
    let folders = [];

    if (repo.includes("/tree/")) {
      const parts = repo.split("/tree/");
      repoName = parts[0];
      const branchAndPath = parts[1].split("/");
      branch = branchAndPath[0];

      // Get all folder parts after the branch
      if (branchAndPath.length > 1) {
        folders = branchAndPath.slice(1).filter((folder) => folder !== "");

        // Remove trailing slash from last folder if present
        const lastFolder = folders.at(folders.length - 1);
        if (folders.length !== 0 && lastFolder.endsWith("/")) {
          folders[folders.length - 1] = lastFolder.slice(0, -1);
        }
      }
    } else {
      branch = "main"; // Default branch if not specified
      // If there is no folder, use the whole repo name
      if (repo.endsWith("/")) {
        repoName = repo.slice(0, repo.length - 1);
      } else {
        repoName = repo;
      }
    }

    // Construct the folder path
    const folderPath = folders.length === 0 ? "" : `/${folders.join("/")}`;

    return `https://raw.githubusercontent.com/${repoName}/${branch}${folderPath}/`;
  },

  /**
   * Returns an array of processes that match required pathnames.
   *
   * @param {Window} window - Optional window to return.
   * @param {string[]} processes - Array of process pathnames that must be matched.
   * @returns {Array} Array of matching prcoesses.
   */
  getProcesses(window = null, processes = null) {
    if (window) {
      return [window];
    }

    const pages = [];

    const windows = Services.wm.getEnumerator(null);
    while (windows.hasMoreElements()) {
      const win = windows.getNext();

      if (win && (!processes || processes.some((process) => process === win.location.pathname))) {
        pages.push(win);
      }

      if (win.location.pathname === "/content/browser.xhtml" && win.gBrowser?.tabs) {
        for (const tab of win.gBrowser.tabs) {
          const contentWindow = tab.linkedBrowser.contentWindow;
          const urlPathname = contentWindow?.location?.pathname;
          if (
            contentWindow &&
            (!processes || processes.some((process) => process === urlPathname))
          ) {
            pages.push(contentWindow);
          }
        }
      }
    }
    return pages;
  },

  /**
   * Returns auto-update enabled status.
   *
   * @returns {boolean} Auto-update status. If true, enabled. If false, disabled.
   */
  get autoUpdate() {
    return Services.prefs.getBoolPref("sine.auto-updates", true);
  },

  /**
   * Setter function for auto-update enabled status.
   *
   * @param {boolean} value - If true, will enable auto-updates, and vice-versa if false.
   */
  set autoUpdate(value) {
    Services.prefs.setBoolPref("sine.auto-updates", value);
  },

  /**
   * Returns the enabled status of the unsafe JS preference.
   *
   * @returns {boolean} Status of unsafe JS preference.
   */
  get allowUnsafeJS() {
    return Services.prefs.getBoolPref("sine.allow-unsafe-js", false);
  },

  /**
   * Escapes/sanitizes insecure HTML.
   *
   * @param {string} html - HTML to sanitize.
   * @returns {string} Sanitized HTML.
   */
  escapeHTML(html) {
    return html
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#x27;");
  },

  /**
   * Returns an escaped version of a markdown character. Used in formatLabel function.
   *
   * @param {string} char - Markdown character to escape.
   * @returns {string} Escaped version of the markdown character.
   */
  escapeMarkdownChar(char) {
    if (char === "**") return "\uE001";
    if (char === "*") return "\uE002";
    return "\uE003";
  },

  /**
   * Sanitizes and formats a preference label or other insecure labels.
   *
   * @param {string} label - Label to format and sanitize.
   * @returns {string} Sanitized and formatted label HTML.
   */
  formatLabel(label) {
    return this.escapeHTML(label)
      .replaceAll(/\\(\*\*|\*|~)/gu, (_, c) => this.escapeMarkdownChar(c))
      .replaceAll(/\*\*([^*]+)\*\*/gu, "<b>$1</b>")
      .replaceAll(/\*([^*]+)\*/gu, "<i>$1</i>")
      .replaceAll(/~([^~]+)~/gu, "<u>$1</u>")
      .replaceAll("\uE001", "**")
      .replaceAll("\uE002", "*")
      .replaceAll("\uE003", "~")
      .replaceAll("\n", "<br/>");
  },

  /**
   * Returns a list of valid and existing scripts that can be injected into the DOM.
   *
   * @param {object} options - Options of what to fetch.
   * @param {object} options.mods - Optional mods metadata, skips the mod fetching process if
   *   passed.
   * @param {boolean} options.onlyEnabled - If enabled, will only return enabled scripts. (currently
   *   only checks mod enabled status)
   * @param {boolean} options.removeBgModules - If enabled, will exclude background modules
   *   (.sys.mjs) from results.
   * @param {string} options.href - Optional href that scripts must be loadable in to be returned.
   * @returns {object} Object of scripts, with the key being the path to it from the mods folder,
   *   and the value being the properties of it.
   */
  async getScripts(options = {}) {
    const flattenPathStructure = (scripts, parentKey = "", modId = "", result = {}) => {
      for (const key in scripts) {
        const newKey = parentKey ? `${parentKey}/${key}` : key;

        const script = scripts[key];

        // Potential edge case where folder name ends with a script suffix.
        if (
          (options.removeBgModules ? false : newKey.endsWith(".sys.mjs")) ||
          newKey.endsWith(".uc.mjs") ||
          newKey.endsWith(".uc.js")
        ) {
          script.include = (script.include?.length ? script.include : [".*"]).map((p) =>
            p.replaceAll("*", ".*?")
          );

          let exclude = "";
          if (script.exclude?.length) {
            script.exclude = script.exclude.map((p) => p.replaceAll("*", ".*?"));
            exclude = `(?!${script.exclude.join("$|")}$)`;
          } else {
            script.exclude = [];
          }

          const locationRegex = new RegExp(
            `^${exclude}(${script.include.join("|") || ".*"})$`,
            "iu"
          );

          if (!options.href || locationRegex.test(options.href)) {
            script.regex = locationRegex;
            script.enabled = options.mods[modId].enabled;
            result[newKey] = script;
          }
        } else if (typeof script === "object" && script !== null) {
          flattenPathStructure(script, newKey, modId, result);
        }
      }
      return result;
    };

    if (!options.mods) {
      options.mods = await this.getMods();
    }

    let scripts = {};
    for (const mod of Object.values(options.mods)) {
      if ((mod.enabled || !options.onlyEnabled) && (this.allowUnsafeJS || mod.origin === "store")) {
        Object.assign(scripts, flattenPathStructure(mod.scripts, mod.id, mod.id));
      }
    }

    scripts = Object.fromEntries(
      Object.entries(scripts).toSorted(
        ([, optionsA], [, optionsB]) => (optionsA.loadOrder || 10) - (optionsB.loadOrder || 10)
      )
    );

    return scripts;
  },
};
