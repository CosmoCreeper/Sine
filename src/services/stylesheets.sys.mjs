/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// ===========================================================
// Loads and manages stylesheets in DOMs, as well as building
// a DOM for reading preferences.
// ===========================================================

import utils from "../core/utils.sys.mjs";
import ucAPI from "../utils/uc_api.sys.mjs";
import domUtils from "../utils/dom.mjs";

class StylesheetManager {
  #chromeURI;
  #stylesheetData = {};
  #modPrefs = {};

  constructor() {
    this.initContentListener();
  }

  async #rebuildStylesheets(writeStyles = true) {
    const installedMods = await utils.getMods();

    const data = {
      chrome: "",
      content: "",
    };
    this.#modPrefs = {};

    const promises = [];
    for (const id of Object.keys(installedMods).toSorted()) {
      const mod = installedMods[id];
      if (mod.enabled) {
        if (writeStyles && mod.style) {
          for (const [style, path] of Object.entries(mod.style)) {
            if (path) {
              const importPath = `@import "${PathUtils.toFileURI(ucAPI.utils.chromeDir)}/sine-mods/${id}/${path}";\n`;
              data[style] += importPath;
            }
          }
        }

        if (mod.preferences) {
          promises.push(
            (async () => {
              this.#modPrefs[mod.name] = await utils.getModPreferences(mod);
            })()
          );
        }
      }
    }
    await Promise.all(promises);

    if (writeStyles) {
      await IOUtils.writeUTF8(utils.chromeFile, data.chrome);
      await IOUtils.writeUTF8(utils.contentFile, data.content);

      this.#stylesheetData = {
        chrome: data.chrome !== "",
        content: data.content !== "",
      };
    }
  }

  #rebuildDOM(document) {
    if (document) {
      document.querySelectorAll(".sine-theme-strings, .sine-theme-styles").forEach((el) => {
        el.remove();
      });

      for (const name of Object.keys(this.#modPrefs)) {
        const modPrefs = this.#modPrefs[name];

        const themeSelector = `theme-${name.replace(/\s/g, "-")}`;

        const rootPrefs = Object.values(modPrefs).filter(
          (pref) =>
            pref.type === "dropdown" ||
            (pref.type === "string" && pref.processAs && pref.processAs === "root")
        );
        if (rootPrefs.length) {
          const themeEl = domUtils.appendXUL(
            document.body,
            `<div id="${themeSelector}" class="sine-theme-strings"></div>`
          );

          for (const pref of rootPrefs) {
            if (Services.prefs.getPrefType(pref.property) > 0) {
              const prefName = pref.property.replace(/\./g, "-");
              themeEl.setAttribute(prefName, ucAPI.prefs.get(pref.property));
            }
          }
        }

        const varPrefs = Object.values(modPrefs).filter(
          (pref) =>
            (pref.type === "dropdown" && pref.processAs && pref.processAs.includes("var")) ||
            pref.type === "string"
        );
        if (varPrefs.length) {
          const themeEl = domUtils.appendXUL(
            document.head,
            `
                            <style id="${themeSelector}-style" class="sine-theme-styles">
                                :root {
                            </style>
                        `
          );

          for (const pref of varPrefs) {
            if (Services.prefs.getPrefType(pref.property) > 0) {
              const prefName = pref.property.replace(/\./g, "-");
              themeEl.textContent += `--${prefName}: ${ucAPI.prefs.get(pref.property)};`;
            }
          }

          themeEl.textContent += "}";
        }
      }
    }
  }

  async #applyToChromeWindow(window) {
    if (window?.windowUtils) {
      try {
        await window.windowUtils.removeSheet(this.#chromeURI, window.windowUtils.USER_SHEET);
      } catch {}

      if (this.#stylesheetData.chrome) {
        try {
          window.windowUtils.loadSheet(this.#chromeURI, window.windowUtils.USER_SHEET);
        } catch (err) {
          console.warn(`Failed to apply chrome CSS in ${window.location.href}: ${err}`);
        }
      }
    }
  }

  handleEvent(event, reloadStyles) {
    if (reloadStyles) {
      this.#applyToChromeWindow(event.target.defaultView);
    }
    this.#rebuildDOM(event.target);
  }

  async rebuildMods(reloadStyles = true) {
    await this.#rebuildStylesheets(reloadStyles);

    try {
      this.#chromeURI = Services.io.newURI("chrome://sine/content/chrome.css");

      const windows = Services.wm.getEnumerator(null);
      while (windows.hasMoreElements()) {
        const window = windows.getNext();
        this.handleEvent({ target: window.document }, reloadStyles);
      }

      Services.ppmm.broadcastAsyncMessage("RebuildUserStyles", {});
    } catch (ex) {
      console.error(`Failed to reload styles:`, ex);
    }
  }

  onWindow(window) {
    if (this.#chromeURI && window.location.href.startsWith("chrome://")) {
      this.#rebuildStylesheets(false).then(() => this.#rebuildDOM(window.document));
      this.#applyToChromeWindow(window);
    }
  }

  initContentListener() {
    try {
      ChromeUtils.registerWindowActor("SineUserContent", {
        child: {
          esModuleURI: "chrome://userscripts/content/services/usercontent.sys.mjs",
          events: {
            DOMWindowCreated: {},
          },
        },
        allFrames: true,
        matchesTarget: "content",
      });
    } catch (err) {
      console.warn(`Failed to register JSWindowActor: ${err}`);
    }
  }
}

export default new StylesheetManager();
