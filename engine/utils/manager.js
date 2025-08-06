// => engine/utils/manager.js
// ===========================================================
// This module manages mods and themes, allowing Sine to
// enable, disable, and remove them.
// ===========================================================

import utils from "chrome://userscripts/content/engine/utils/utils.js";
import appendXUL from "chrome://userscripts/content/engine/utils/XULManager.js";

const manager = {
    async rebuildStylesheets() {
        let chromeData = "";
        let contentData = "";
    
        if (!Services.prefs.getBoolPref("sine.mods.disable-all", false)) {
            ucAPI.globalDoc.querySelectorAll(".sine-theme-strings, .sine-theme-styles").forEach(el => el.remove());
        
            const installedMods = await utils.getMods();
            for (const id of Object.keys(installedMods).sort()) {
                const mod = installedMods[id];
                if (mod.enabled) {
                    if (mod.style) {
                        const translatedStyle = typeof mod.style === "string" ? { "chrome": mod.style } : mod.style;
                        for (const style of Object.keys(translatedStyle)) {
                            let file;
                            if (style === "content") {
                                file = "userContent";
                            } else {
                                file = typeof mod.style === "string" ? "chrome" : "userChrome";
                            }

                            const importPath =
                                `@import "${ucAPI.chromeDir}sine-mods/${id}/${file}.css";\n`;
                        
                            if (style === "chrome") {
                                chromeData += importPath;
                            } else {
                                contentData += importPath;
                            }
                        }
                    }
                
                    if (mod.preferences) {
                        const modPrefs = await utils.getModPreferences(mod);
                    
                        const rootPrefs = Object.values(modPrefs).filter(pref =>
                            pref.type === "dropdown" ||
                            (pref.type === "string" && pref.processAs && pref.processAs === "root")
                        );
                        if (rootPrefs.length) {
                            const themeSelector = "theme-" + mod.name.replace(/\s/g, "-");
                        
                            const themeEl = appendXUL(ucAPI.globalDoc.body, `
                                <div id="${themeSelector}" class="sine-theme-strings"></div>
                            `);
                            
                            for (const pref of rootPrefs) {
                                if (Services.prefs.getPrefType(pref.property) > 0) {
                                    const prefName = pref.property.replace(/\./g, "-");
                                    themeEl.setAttribute(prefName, ucAPI.prefs.get(pref.property));
                                }
                            }
                        }
                    
                        const varPrefs = Object.values(modPrefs).filter(pref =>
                            (pref.type === "dropdown" && pref.processAs && pref.processAs.includes("var")) ||
                            pref.type === "string"
                        );
                        if (varPrefs.length) {
                            const themeSelector = "theme-" + mod.name.replace(/\s/g, "-") + "-style";
                            const themeEl = appendXUL(ucAPI.globalDoc.head, `
                                <style id="${themeSelector}" class="sine-theme-styles">
                                    :root {
                                </style>
                            `);
                            
                            for (const pref of varPrefs) {
                                if (Services.prefs.getPrefType(pref.property) > 0) {
                                    const prefName = pref.property.replace(/\./g, "-");
                                    themeEl.textContent +=
                                        `--${prefName}: ${ucAPI.prefs.get(pref.property)};`;
                                }
                            }
                        
                            themeEl.textContent += "}";
                        }
                    }
                }
            }
        }
    
        await IOUtils.writeUTF8(utils.chromeFile, chromeData);
        await IOUtils.writeUTF8(utils.contentFile, contentData);
    
        return {
            chrome: chromeData,
            content: contentData
        };
    },

    applyToChromeWindow(win, stylesheetData) {
        try {
            if (win?.windowUtils) {
                try {
                    win.windowUtils.removeSheet(this.cssURI, windowUtils.USER_SHEET);
                } catch {}

                if (stylesheetData?.chrome) {
                    win.windowUtils.loadSheet(this.cssURI, windowUtils.USER_SHEET);
                }
            }
        } catch (err) {
            console.warn(`Failed to apply chrome CSS: ${err}`);
        }
    },
    
    async rebuildMods() {
        console.log("[Sine]: Rebuilding styles.");
        const stylesheetData = await this.rebuildStylesheets();
    
        const ss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
        const io = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
        const ds = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);
    
        const cssConfigs = ["chrome", "content"];
    
        for (const config of cssConfigs) {
            try {
                const chromeDir = ds.get("UChrm", Ci.nsIFile);
                    
                const cssPath = chromeDir.clone();
                cssPath.append("sine-mods");
                cssPath.append(`${config}.css`);
                    
                const cssURI = io.newFileURI(cssPath);
            
                if (config === "chrome") {
                    this.cssURI = cssURI;
                
                    const windowMediator = Cc["@mozilla.org/appshell/window-mediator;1"]
                        .getService(Ci.nsIWindowMediator);
                
                    const windows = windowMediator.getEnumerator(null);
                
                    while (windows.hasMoreElements()) {
                        const domWindow = windows.getNext();

                        this.applyToChromeWindow(domWindow, stylesheetData);

                        if (domWindow) {
                            for (let i = 0; i < domWindow.frames.length; i++) {
                                const frame = domWindow[i];
                                if (frame.document?.documentURI?.startsWith("chrome://")) {
                                    this.applyToChromeWindow(frame, stylesheetData);
                                }
                            }
                        }
                    }
                } else {
                    if (ss.sheetRegistered(cssURI, ss.USER_SHEET)) {
                        ss.unregisterSheet(cssURI, ss.USER_SHEET);
                    }
                    if (ss.sheetRegistered(cssURI, ss.AUTHOR_SHEET)) {
                        ss.unregisterSheet(cssURI, ss.AUTHOR_SHEET);
                    }
                
                    if (stylesheetData.content) {
                        ss.loadAndRegisterSheet(cssURI, ss.USER_SHEET);
                    }
                }
            } catch (ex) {
                console.error(`Failed to reload ${config}:`, ex);
            }
        }
    },
    
    async disableMod(id) {
        const installedMods = await utils.getMods();
        installedMods[id].enabled = false;
        await IOUtils.writeJSON(utils.modsDataFile, installedMods);
    },
    
    async enableMod(id) {
        const installedMods = await utils.getMods();
        installedMods[id].enabled = true;
        await IOUtils.writeJSON(utils.modsDataFile, installedMods);
    },
    
    async removeMod(id) {
        const installedMods = await utils.getMods();
        delete installedMods[id];
        await IOUtils.writeJSON(utils.modsDataFile, installedMods);
        
        await IOUtils.remove(utils.getModFolder(id), { recursive: true });
    },

    async initWinListener() {
        const observerService = Cc["@mozilla.org/observer-service;1"]
            .getService(Ci.nsIObserverService);
        
        const chromeObserver = {
            async observe(subject, topic) {
                if (topic === "chrome-document-global-created" && subject) {
                    const stylesheetData = await manager.rebuildStylesheets();
                    manager.applyToChromeWindow(subject, stylesheetData);
                }
            }
        };
        
        observerService.addObserver(chromeObserver, "chrome-document-global-created", false);
    },
};

export default manager;