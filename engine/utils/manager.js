// => engine/utils/manager.js
// ===========================================================
// This module manages mods and themes, allowing Sine to
// enable, disable, and remove them.
// ===========================================================

import ucAPI from "chrome://userscripts/content/engine/utils/uc_api.js";
import utils from "chrome://userscripts/content/engine/utils/utils.js";
import appendXUL from "chrome://userscripts/content/engine/utils/XULManager.js";

const manager = {
    async rebuildStylesheets() {
        let chromeData = "";
        let contentData = "";
    
        if (!UC_API.Prefs.get("sine.mods.disable-all").value) {
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
                                if (UC_API.Prefs.get(pref.property).exists()) {
                                    const prefName = pref.property.replace(/\./g, "-");
                                    themeEl.setAttribute(prefName, UC_API.Prefs.get(pref.property).value);
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
                                if (UC_API.Prefs.get(pref.property).exists()) {
                                    const prefName = pref.property.replace(/\./g, "-");
                                    themeEl.textContent +=
                                        `--${prefName}: ${UC_API.Prefs.get(pref.property).value};`;
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
    
    async rebuildMods() {
        console.log("[Sine]: Rebuilding styles.");
        const stylesheetData = await this.rebuildStylesheets();
    
        const ss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
        const io = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
        const ds = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);
    
        // Consolidated CSS reload loop with window listener for new windows
        const cssConfigs = ["chrome", "content"];
    
        for (const config of cssConfigs) {
            try {
                // Get chrome directory
                const chromeDir = ds.get("UChrm", Ci.nsIFile);
                    
                const cssPath = chromeDir.clone();
                cssPath.append("sine-mods");
                cssPath.append(`${config}.css`);
                    
                const cssURI = io.newFileURI(cssPath);
            
                if (config === "chrome") {
                    // Store the cssURI.
                    this.cssURI = cssURI;
                
                    // Apply to all existing windows
                    const windowMediator = Cc["@mozilla.org/appshell/window-mediator;1"]
                        .getService(Ci.nsIWindowMediator);
                
                    // Get all browser windows including PiP
                    const windows = windowMediator.getEnumerator(null);
                
                    while (windows.hasMoreElements()) {
                        const domWindow = windows.getNext();
                    
                        try {
                            const windowUtils = domWindow.windowUtils ||
                                domWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                                .getInterface(Ci.nsIDOMWindowUtils);
                        
                            // Try to unregister existing sheet first
                            try {
                                windowUtils.removeSheet(cssURI, windowUtils.USER_SHEET);
                            } catch {}
                        
                            // Load the sheet
                            if (stylesheetData.chrome) {
                                windowUtils.loadSheet(cssURI, windowUtils.USER_SHEET);
                            }
                        } catch (ex) {
                            console.warn(`Failed to apply CSS to existing window: ${ex}`);
                        }
                    }
                } else {
                    // Content-specific handling (global)
                    // Unregister existing sheets if they exist
                    if (ss.sheetRegistered(cssURI, ss.USER_SHEET)) {
                        ss.unregisterSheet(cssURI, ss.USER_SHEET);
                    }
                    if (ss.sheetRegistered(cssURI, ss.AUTHOR_SHEET)) {
                        ss.unregisterSheet(cssURI, ss.AUTHOR_SHEET);
                    }
                
                    // Register the sheet
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
        // Window listener to handle newly created windows (including PiP)
        const windowListener = {
            onOpenWindow: (xulWindow) => {
                const domWindow = xulWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                    .getInterface(Ci.nsIDOMWindow);

                const loadHandler = () => {
                    // Remove the event listener to prevent memory leaks
                    domWindow.removeEventListener("load", loadHandler);

                    if (this.cssURI) {
                        try {
                            const windowUtils = domWindow.windowUtils ||
                                domWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                                .getInterface(Ci.nsIDOMWindowUtils);

                            // Apply chrome CSS to new window
                            windowUtils.loadSheet(this.cssURI, windowUtils.USER_SHEET);
                            console.log("Applied chrome CSS to new window");
                        } catch (ex) {
                            console.warn("Failed to apply CSS to new window:", ex);
                        }
                    }
                }

                // Wait for window to be fully loaded
                domWindow.addEventListener("load", loadHandler);
            }
        };

        // Register the window listener
        const windowMediator = Cc["@mozilla.org/appshell/window-mediator;1"]
            .getService(Ci.nsIWindowMediator);

        windowMediator.addListener(windowListener);

        // Clean up on shutdown
        window.addEventListener("beforeunload", () => {
            windowMediator.removeListener(windowListener);
        });
    },
};

export default manager;