// => engine/services/stylesheets.mjs
// ===========================================================
// This module manages stylesheets for mods and themes,
// applying them to the browser and content as needed.
// ===========================================================

import utils from "../core/utils.mjs";
import ucAPI from "../utils/uc_api.sys.mjs";
import domUtils from "../utils/dom.mjs";

class StylesheetManager {
    #chromeURI;
    #stylesheetData = {};
    #modPrefs = {};

    async #rebuildStylesheets(writeStyles = true) {
        const installedMods = await utils.getMods();

        const data = {
            chrome: "",
            content: "",
        };
        this.#modPrefs = {};

        for (const id of Object.keys(installedMods).sort()) {
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
                    this.#modPrefs[mod.name] = await utils.getModPreferences(mod);
                }
            }
        }

        if (writeStyles) {
            await IOUtils.writeUTF8(utils.chromeFile, data.chrome);
            await IOUtils.writeUTF8(utils.contentFile, data.content);

            this.#stylesheetData = {
                chrome: data.chrome !== "",
                content: data.content !== "",
            };
        }
    }

    async #rebuildDOM(document) {
        if (document) {
            document.querySelectorAll(".sine-theme-strings, .sine-theme-styles").forEach((el) => el.remove());

            for (const name of Object.keys(this.#modPrefs)) {
                const modPrefs = this.#modPrefs[name];

                const themeSelector = "theme-" + name.replace(/\s/g, "-");

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
                            <style id="${themeSelector + "-style"}" class="sine-theme-styles">
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

    handleEvent(event) {
        this.#applyToChromeWindow(event.target.defaultView);
        this.#rebuildDOM(event.target);
    }

    async rebuildMods() {
        console.log("[Sine]: Rebuilding styles.");

        await this.#rebuildStylesheets();

        const ss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
        const io = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
        const ds = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);

        const chromeDir = ds.get("UChrm", Ci.nsIFile);

        const cssConfigs = ["chrome", "content"];

        for (const config of cssConfigs) {
            try {
                const cssPath = chromeDir.clone();
                cssPath.append("sine-mods");
                cssPath.append(`${config}.css`);

                if (config === "chrome") {
                    this.#chromeURI = io.newFileURI(cssPath);

                    const windows = Services.wm.getEnumerator(null);
                    while (windows.hasMoreElements()) {
                        const window = windows.getNext();

                        if (window.document.readyState === "complete") {
                            this.handleEvent({ target: window.document });
                        } else {
                            window.addEventListener("DOMContentLoaded", this, { once: true });
                        }

                        for (let i = 0; i < window.frames.length; i++) {
                            const frame = window[i];
                            if (frame.location.href.startsWith("chrome://")) {
                                if (frame.document.readyState === "complete") {
                                    this.handleEvent({ target: window.document });
                                } else {
                                    frame.addEventListener("DOMContentLoaded", this, { once: true });
                                }
                            }
                        }
                    }
                } else {
                    const cssURI = io.newFileURI(cssPath);

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

    onWindow(window) {
        if (this.#chromeURI && window.location.href.startsWith("chrome://")) {
            this.#rebuildStylesheets(false).then(() => this.#rebuildDOM(window.document));
            this.#applyToChromeWindow(window);
        }
    }
}

export default new StylesheetManager();
