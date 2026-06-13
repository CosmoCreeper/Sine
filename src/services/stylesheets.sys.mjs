/**
 * @file Loads and manages stylesheets in DOMs. This Source Code Form is subject to the terms of the
 *   Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You
 *   can obtain one at http://mozilla.org/MPL/2.0/.
 */

import utils from "../core/utils.sys.mjs";
import ucAPI from "../utils/uc_api.sys.mjs";
import * as domUtils from "../utils/dom.mjs";

/**
 * Main class for managing stylesheets.
 *
 * @class
 */
class StylesheetManager {
  #chromeURI;
  #stylesheetData = {};
  #modPrefs = {};

  /**
   * Rebuilds entrypoint stylesheets (optionally), and updates stored preferences for mods.
   *
   * @param {boolean} writeStyles - If true, will write to entrypoint stylesheets.
   */
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

  /**
   * Rebuilds the DOM as it pertains to mods. This includes custom CSS variables and elements that
   * store string-based mod pref values.
   *
   * @param {HTMLDocument} document - Document to rebuild mod DOM in.
   */
  #rebuildDOM(document) {
    if (!document) {
      return;
    }

    for (const el of document.querySelectorAll(".sine-theme-strings, .sine-theme-styles")) {
      el.remove();
    }

    for (const name of Object.keys(this.#modPrefs)) {
      const modPrefs = this.#modPrefs[name];

      const themeSelector = `theme-${name.replaceAll(" ", "-")}`;

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
            const prefName = pref.property.replaceAll(".", "-");
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
            const prefName = pref.property.replaceAll(".", "-");
            themeEl.textContent += `--${prefName}: ${ucAPI.prefs.get(pref.property)};`;
          }
        }

        themeEl.textContent += "}";
      }
    }
  }

  /**
   * Applies the main userChrome stylesheet in a window.
   *
   * @param {Window} window - Window to apply stylesheet to.
   */
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

  /**
   * Handles new chrome windows by building the mod DOM and applying styles to it.
   *
   * @param {Event} event - Event containing the window.
   * @param {boolean} reloadStyles - If true, will load styles into window.
   */
  handleEvent(event, reloadStyles) {
    if (reloadStyles) {
      this.#applyToChromeWindow(event.target.defaultView);
    }
    this.#rebuildDOM(event.target);
  }

  /**
   * Listens for a window to fully load if not loaded, before loading stylesheets.
   *
   * @param {Window} win - Window to listen for.
   * @param {boolean} reloadStyles - If true, will load styles into window.
   */
  listen(win, reloadStyles) {
    if (win.document.readyState === "complete") {
      this.handleEvent({ target: win.document }, reloadStyles);
    } else {
      win.addEventListener("DOMContentLoaded", (e) => this.handleEvent(e, reloadStyles), {
        once: true,
      });
    }
  }

  /**
   * Reloads all mod stylesheets (optionally) and DOMs.
   *
   * @param {boolean} reloadStyles - If true, will reload styles.
   */
  async rebuildMods(reloadStyles = true) {
    await this.#rebuildStylesheets(reloadStyles);

    const ss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);

    const chromeDir = Services.dirsvc.get("UChrm", Ci.nsIFile);

    const cssConfigs = ["chrome", "content"];

    for (const config of cssConfigs) {
      try {
        const cssPath = chromeDir.clone();
        cssPath.append("sine-mods");
        cssPath.append(`${config}.css`);

        if (config === "chrome") {
          this.#chromeURI = Services.io.newFileURI(cssPath);

          const windows = Services.wm.getEnumerator(null);
          while (windows.hasMoreElements()) {
            const window = windows.getNext();
            this.listen(window, reloadStyles);

            for (let i = 0; i < window.frames.length; i++) {
              const frame = window[i];
              if (frame.location.href.startsWith("chrome://")) {
                this.listen(frame, reloadStyles);
              }
            }
          }
        } else if (reloadStyles) {
          const cssURI = Services.io.newFileURI(cssPath);

          if (ss.sheetRegistered(cssURI, ss.USER_SHEET)) {
            ss.unregisterSheet(cssURI, ss.USER_SHEET);
          }

          if (this.#stylesheetData.content) {
            ss.loadAndRegisterSheet(cssURI, ss.USER_SHEET);
          }
        }
      } catch (ex) {
        console.error(`Failed to reload ${config}:`, ex);
      }
    }
  }

  /**
   * Handles new chrome windows directly, applying styles and DOMs to it.
   *
   * @param {Window} window - Window to listen on.
   */
  onWindow(window) {
    if (this.#chromeURI && window.location.href.startsWith("chrome://")) {
      this.#rebuildStylesheets(false)
        .then(() => this.#rebuildDOM(window.document))
        .catch((err) => console.error(err));
      this.#applyToChromeWindow(window);
    }
  }
}

export default new StylesheetManager();
