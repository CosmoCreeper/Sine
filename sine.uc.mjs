// ==UserScript==
// @include   main
// @include   about:preferences*
// @include   about:settings*
// @ignorecache
// ==/UserScript==

// API import.
import * as UC_API from "chrome://userchromejs/content/uc_api.sys.mjs";

// Engine imports.
import appendXUL from "chrome://userscripts/content/engine/XULManager.js";
import injectAPI from "chrome://userscripts/content/engine/injectAPI.js";
import { defineMarked } from "chrome://userscripts/content/engine/marked.js";
import initDev from "chrome://userscripts/content/engine/cmdPalette.js";

// Imports to execute at script startup.
import("chrome://userscripts/content/engine/prefs.js");
defineMarked();

const isCosine = UC_API.Prefs.get("sine.is-cosine").value;
console.log(`${isCosine ? "Cosine" : "Sine"} is active!`);

const Sine = {
    mainProcess: document.location.pathname === "/content/browser.xhtml",
    globalDoc: windowRoot.ownerGlobal.document,
    updatedAt: "2025-07-08 09:11",

    get versionBrand() {
        return isCosine ? "Cosine" : "Sine";
    },

    get engineURL() {
        // Use GitHub pages when the repository is transferred,
        // also switch to sineorg/sine instead of CosmoCreeper/Sine.
        return isCosine ?
            "https://raw.githubusercontent.com/CosmoCreeper/Sine/cosine/deployment/engine.json" :
            "https://raw.githubusercontent.com/CosmoCreeper/Sine/main/deployment/engine.json";
    },

    get marketURL() {
        const defaultURL = "https://sineorg.github.io/store/marketplace.json";
        if (UC_API.Prefs.get("sine.allow-external-marketplace").value) {
            return UC_API.Prefs.get("sine.marketplace-url").value || defaultURL;
        } else {
            return defaultURL;
        }
    },

    showToast(label="Unknown", priority="warning", restart=true) {
        const ifToastExists = Array.from(this.globalDoc.querySelectorAll("notification-message"))
            .some(notification => notification.__message === label);
        
        if (!ifToastExists) {
            const buttons = restart ? [{
              label: "Restart",
              callback: () => {
                  this.restartBrowser();
                  return true;
              }
            }] : [];

            UC_API.Notifications.show({
                priority,
                label,
                buttons
            });
        }
    },

    restartBrowser() {
        UC_API.Runtime.restart(true);
    },

    async fetch(url, forceText=false) {
        const parseJSON = response => {
            try {
                if (!forceText) response = JSON.parse(response);
            } catch {}
            return response;
        }
        if (this.mainProcess) {
            const response = await fetch(url).then(res => res.text()).catch(err => console.warn(err));
            return parseJSON(response);
        } else {
            const randomId = Math.floor(Math.random() * 100) + 1;
            const fetchId = `${url}-${randomId}`;
            UC_API.Prefs.set("sine.fetch-url", `fetch:${fetchId}`);
            return new Promise(resolve => {
                const listener = UC_API.Prefs.addListener("sine.fetch-url", async () => {
                    if (UC_API.Prefs.get("sine.fetch-url").value === `done:${fetchId}`) {
                        UC_API.Prefs.removeListener(listener);
                        const response = await UC_API.SharedStorage.widgetCallbacks.get("fetch-results");
                        // Save copy of response[url] so it can't be overwritten.
                        const temp = response[fetchId];
                        delete response[fetchId];
                        UC_API.SharedStorage.widgetCallbacks.set("fetch-results", response);
                        resolve(parseJSON(temp));
                    }
                });
            });
        }
    },

    get chromeDir() {
        const chromeDir = decodeURIComponent(
            UC_API.FileSystem.chromeDir().fileURI.replace("file:///", "").replace(/%20/g, " ")
        );
        return this.os.includes("win") ? chromeDir.replace(/\//g, "\\") : "/" + chromeDir;
    },

    utils: {
        get modsDir() {
            return PathUtils.join(Sine.chromeDir, "sine-mods");
        },

        get chromeFile() {
            return PathUtils.join(this.modsDir, "chrome.css");
        },

        get contentFile() {
            return PathUtils.join(this.modsDir, "content.css");
        },

        get modsDataFile() {
            return PathUtils.join(this.modsDir, "mods.json");
        },

        async getMods() {
            return JSON.parse(await IOUtils.readUTF8(this.modsDataFile));
        },

        getModFolder(id) {
            return PathUtils.join(this.modsDir, id);
        },

        async getModPreferences(mod) {
            return JSON.parse(await IOUtils.readUTF8(
                PathUtils.join(this.getModFolder(mod.id), "preferences.json")
            ));
        },
    },

    manager: {
        async rebuildStylesheets() {
            let chromeData = "";
            let contentData = "";

            if (!UC_API.Prefs.get("sine.mods.disable-all").value) {
                Sine.globalDoc.querySelectorAll(".sine-theme-strings, .sine-theme-styles").forEach(el => el.remove());

                const installedMods = await Sine.utils.getMods();
                for (const id of Object.keys(installedMods)) {
                    const mod = installedMods[id];
                    if (mod.enabled) {
                        if (mod.style) {
                            const translatedStyle = typeof mod.style === "string" ? { "chrome": mod.style } : mod.style;
                            for (const style of Object.keys(translatedStyle)) {
                                let file;
                                if (style === "content") file = "userContent";
                                else file = typeof mod.style === "string" ? "chrome" : "userChrome";
                                const importPath =
                                    `@import "${UC_API.FileSystem.chromeDir().fileURI}sine-mods/${id}/${file}.css";\n`;
                            
                                if (style === "chrome") chromeData += importPath;
                                else contentData += importPath;
                            }
                        }

                        if (mod.preferences) {
                            const modPrefs = await Sine.utils.getModPreferences(mod);

                            const rootPrefs = Object.values(modPrefs).filter(pref =>
                                pref.type === "dropdown" ||
                                (pref.type === "string" && pref.processAs && pref.processAs === "root")
                            );
                            if (rootPrefs.length) {
                                const themeSelector = "theme-" + mod.name.replace(/\s/g, "-");

                                const themeEl = appendXUL(Sine.globalDoc.body, `
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
                                const themeEl = appendXUL(Sine.globalDoc.head, `
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

            await IOUtils.writeUTF8(Sine.utils.chromeFile, chromeData);
            await IOUtils.writeUTF8(Sine.utils.contentFile, contentData);

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
                        Sine.cssURI = cssURI;

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
            const installedMods = await Sine.utils.getMods();
            installedMods[id].enabled = false;
            await IOUtils.writeJSON(Sine.utils.modsDataFile, installedMods);
        },

        async enableMod(id) {
            const installedMods = await Sine.utils.getMods();
            installedMods[id].enabled = true;
            await IOUtils.writeJSON(Sine.utils.modsDataFile, installedMods);
        },

        async removeMod(id) {
            const installedMods = await Sine.utils.getMods();
            delete installedMods[id];
            await IOUtils.writeJSON(Sine.utils.modsDataFile, installedMods);

            await IOUtils.remove(Sine.utils.getModFolder(id), { recursive: true });
        },
    },

    get os() {
        const os = Services.appinfo.OS;
        const osMap = {
            WINNT: "win",
            Darwin: "mac",
            Linux: "linux",
        }
        return osMap[os];
    },

    get autoUpdates() {
        return UC_API.Prefs.get("sine.auto-updates").value;
    },

    set autoUpdates(newValue) {
        UC_API.Prefs.set("sine.auto-updates", newValue);
    },

    get jsDir() {
        return PathUtils.join(this.chromeDir, "JS");
    },

    async updateEngine() {
        const engine = await this.fetch(this.engineURL).catch(err => console.warn(err));
        if (engine && new Date(engine.updatedAt) > new Date(this.updatedAt)) {
            // Delete the previous engine material.
            await IOUtils.remove(PathUtils.join(this.jsDir, "engine"), { recursive: true });

            // Define the JS directory.
            const scriptDir = Cc["@mozilla.org/file/local;1"]
                .createInstance(Ci.nsIFile);
            scriptDir.initWithPath(this.jsDir);
        
            // Make sure the directory exists
            if (!scriptDir.exists()) {
                console.error("Script directory doesn't exist: " + scriptDir.path);
                return;
            }
        
            try {
                // Download to your specified directory
                const targetFile = scriptDir.clone();
                targetFile.append("engine.zip");
            
                const download = await Downloads.createDownload({
                    source: engine.package,
                    target: targetFile.path
                });
            
                await download.start();
            
                // Extract in the same directory
                const zipReader = Cc["@mozilla.org/libjar/zip-reader;1"]
                  .createInstance(Ci.nsIZipReader);
            
                zipReader.open(targetFile);
            
                const extractDir = scriptDir.clone();
            
                if (!extractDir.exists()) {
                    extractDir.create(Ci.nsIFile.DIRECTORY_TYPE, -1);
                }
            
                // Extract all files
                const entries = zipReader.findEntries("*");
                let extractedCount = 0;

                while (entries.hasMore()) {
                    const entryName = entries.getNext();
                    const destFile = extractDir.clone();
                
                    const pathParts = entryName.split("/");
                    for (const part of pathParts) {
                        if (part) {
                            destFile.append(part);
                        }
                    }
                
                    if (destFile.parent && !destFile.parent.exists()) {
                        destFile.parent.create(Ci.nsIFile.DIRECTORY_TYPE, -1);
                    }
                
                    if (!entryName.endsWith("/")) {
                        zipReader.extract(entryName, destFile);
                        extractedCount++;
                    }
                }
            
                zipReader.close();
            
                // Delete the zip file
                targetFile.remove(false);
            } catch (error) {
                console.error("Download/Extract error: " + error);
                throw error;
            }

            if (this.mainProcess) {
                this.showToast(
                    `The Sine engine has been updated to v${engine.version}. ` +
                    "Please restart your browser for the changes to fully take effect.", "info"
                );
            }

            this.updatedAt = engine.updatedAt;
            return true;
        }
    },

    async initWindow() {
        this.updateMods("auto");
        if (UC_API.Prefs.get("sine.script.auto-update").value) {
            await this.updateEngine();
        }
    },

    rawURL(repo) {
        if (repo.startsWith("[") && repo.endsWith(")") && repo.includes("]("))
            repo = repo.replace(/^\[[a-z]+\]\(/i, "").replace(/\)$/, "");
        if (repo.startsWith("https://github.com/"))
            repo = repo.replace("https://github.com/", "");
        let repoName;
        let branch;
        let folder = false;
        if (repo.includes("/tree/")) {
            repoName = repo.split("/tree/")[0];
            const parts = repo.split("/tree/");
            const branchParts = parts[1].split("/");
            branch = branchParts[0];
            if (branchParts[1]) {
                if (branchParts[1].endsWith("/")) {
                    branchParts[1].substring(0, branchParts[1].length - 1);
                } else {
                    folder = branchParts[1];
                }
            }
        } else {
            branch = "main"; // Default branch if not specified
            // If there is no folder, use the whole repo name
            if (repo.endsWith("/")) {
                repoName = repo.substring(0, repo.length - 1);
            } else {
                repoName = repo;
            }
        }
        return `https://raw.githubusercontent.com/${repoName}/${branch}${folder ? "/" + folder : ""}/`;
    },

    async toggleTheme(themeData, remove) {
        let promise;
        if (remove) promise = this.manager.disableMod(themeData.id);
        else promise = this.manager.enableMod(themeData.id);

        const jsPromises = [];
        if (themeData.js) {
            const jsFileLoc = PathUtils.join(this.jsDir, themeData.id + "_");
            for (let file of themeData["editable-files"].find(item => item.directory === "js").contents) {
                const fileToReplace = remove ? file : file.replace(/[a-z]+\.m?js$/, "db");
                if (remove) file = file.replace(/[a-z]+\.m?js$/, "db");
                jsPromises.push((async () => {
                    await IOUtils.writeUTF8(jsFileLoc + file, await IOUtils.readUTF8(jsFileLoc + fileToReplace));
                    await IOUtils.remove(jsFileLoc + fileToReplace, { ignoreAbsent: true });
                })());
            }
        }

        await promise;
        this.manager.rebuildMods();

        if (themeData.js) {
            await Promise.all(jsPromises);
            this.showToast(
                `A mod utilizing JS has been ${remove ? "disabled" : "enabled"}. ` +
                "For usage of it to be fully restored, restart your browser."
            );
        }
    },

    formatMD(label) {
        // Sanitize input to prevent XSS.
        let formatted = label.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        
        formatted = formatted
            .replace(/\\(\*\*)/g, "\x01") // Replace \** with a placeholder
            .replace(/\\(\*)/g, "\x02")   // Replace \* with a placeholder
            .replace(/\\(~)/g, "\x05");   // Replace \~ with a placeholder
        
        const formatRules = [
            { pattern: /\*\*([^\*]+)\*\*/g, replacement: "<b>$1</b>" }, // Bold with **
            { pattern: /\*([^\*]+)\*/g, replacement: "<i>$1</i>" },     // Italic with *
            { pattern: /~([^~]+)~/g, replacement: "<u>$1</u>" }         // Underline with ~
        ];
      
        formatRules.forEach(rule => {
            formatted = formatted.replace(rule.pattern, rule.replacement);
        });
      
        formatted = formatted
            .replace(/\x01/g, "**")  // Restore **
            .replace(/\x02/g, "*")   // Restore *
            .replace(/\x05/g, "~")  // Restore ~
            .replace(/&\s/g, "&amp;")  // Replace ampersand with HTML entity for support.
            .replace(/\n/g, "<br></br>"); // Replace <br> with break.
      
        return formatted;
    },

    parsePrefs(pref) {
        if (pref.disabledOn && pref.disabledOn.some(os => os.includes(this.os))) {
            return;
        }

        const docName = {
            "separator": "div",
            "checkbox": "checkbox",
            "dropdown": "hbox",
            "text": "p",
            "string": "hbox"
        }

        let prefEl;
        if (docName[pref.type]) prefEl = document.createElement(docName[pref.type]);
        else prefEl = pref.type;

        if (pref.property) {
            prefEl.id = pref.property.replace(/\./g, "-");
        }
        
        if (pref.label) {
            pref.label = this.formatMD(pref.label);
        }
        
        if (pref.property && pref.type !== "separator") {
            prefEl.title = pref.property;
        }
        
        if (pref.hasOwnProperty("margin")) {
            prefEl.style.margin = pref.margin;
        }
        
        if (pref.hasOwnProperty("size")) {
            prefEl.style.fontSize = pref.size;
        }

        if ((pref.type === "string" || pref.type === "dropdown") && pref.hasOwnProperty("label")) {
            appendXUL(prefEl, `<label class="sineItemPreferenceLabel">${pref.label}</label>`);
        }

        const showRestartPrefToast = () => {
            this.showToast(
                "You changed a preference that requires a browser restart to take effect. " +
                "For it to function properly, please restart.",
                "warning"
            );
        }

        if (pref.type === "separator") {
            prefEl.innerHTML += `
                <hr style="${pref.hasOwnProperty("height") ? `border-width: ${pref.height};` : ""}">
                </hr>
            `;
            if (pref.hasOwnProperty("label")) {
                prefEl.innerHTML += 
                    `<label class="separator-label" 
                        ${pref.hasOwnProperty("property") ? `title="${pref.property}"`: ""}>
                            ${pref.label}
                     </label>`;
            }
        } else if (pref.type === "checkbox") {
            prefEl.className = "sineItemPreferenceCheckbox";
            appendXUL(prefEl, '<input type="checkbox"/>');
            if (pref.hasOwnProperty("label")) {
                appendXUL(prefEl, `<label class="checkbox-label">${pref.label}</label>`);
            }
        } else if (pref.type === "dropdown") {
            appendXUL(prefEl, `
                <menulist></menulist>
            `, null, true);

            const menulist = prefEl.querySelector("menulist");

            appendXUL(menulist, `
                <menupopup class="in-menulist"></menupopup>
            `, null, true);
            
            const menupopup = menulist.children[0];

            const defaultMatch = pref.options.find(item =>
                item.value === pref.defaultValue || item.value === pref.default
            );
            if (pref.placeholder !== false) {
                const value = defaultMatch ? "none" : pref.defaultValue ?? pref.default ?? "none";
                menulist.setAttribute("label", pref.placeholder ?? "None");
                menulist.setAttribute("value", value);
                const menuitem = document.createXULElement("menuitem");
                menuitem.setAttribute("value", value);
                menuitem.setAttribute("label", pref.placeholder ?? "None");
                menuitem.textContent = pref.placeholder ?? "None";
                menupopup.appendChild(menuitem);
            }

            pref.options.forEach(option => {
                appendXUL(menupopup, `
                    <menuitem label="${option.label}" value="${option.value}">
                        ${option.label}
                    </menuitem>
                `, null, true);
            });

            const placeholderSelected =
                UC_API.Prefs.get(pref.property).value === "" || UC_API.Prefs.get(pref.property).value === "none";
            const hasDefaultValue = pref.hasOwnProperty("defaultValue") || pref.hasOwnProperty("default");
            if (
                UC_API.Prefs.get(pref.property).exists() &&
                (!pref.force || !hasDefaultValue || UC_API.Prefs.get(pref.property).hasUserValue()) &&
                !placeholderSelected
            ) {
                const value = UC_API.Prefs.get(pref.property).value;
                menulist.setAttribute("label",
                    Array.from(menupopup.children).find(item =>
                        item.getAttribute("value") === value
                    )?.getAttribute("label") ?? pref.placeholder ?? "None"
                );
                menulist.setAttribute("value", value);
            } else if (hasDefaultValue && !placeholderSelected) {
                menulist.setAttribute("label", Array.from(menupopup.children).find(item =>
                    item.getAttribute("value") === pref.defaultValue ||
                    item.getAttribute("value") === pref.default
                )?.getAttribute("label") ?? pref.placeholder ?? "None");
                menulist.setAttribute("value", pref.defaultValue ?? pref.default);
                UC_API.Prefs.set(pref.property, pref.defaultValue ?? pref.default);
            } else if (Array.from(menupopup.children).length >= 1 && !placeholderSelected) {
                menulist.setAttribute("label", menupopup.children[0].getAttribute("label"));
                menulist.setAttribute("value", menupopup.children[0].getAttribute("value"));
                UC_API.Prefs.set(pref.property, menupopup.children[0].getAttribute("value"));
            }
            
            menulist.addEventListener("command", () => {
                let value = menulist.getAttribute("value");
                if (pref.value === "number" || pref.value === "num") value = Number(value);
                else if (pref.value === "boolean" || pref.value === "bool") value = Boolean(value);
                UC_API.Prefs.set(pref.property, value);
                if (pref.restart) showRestartPrefToast();
                this.manager.rebuildMods();
            });
        } else if (pref.type === "text" && pref.hasOwnProperty("label")) {
            prefEl.innerHTML = pref.label;
        } else if (pref.type === "string") {
            const input = document.createElement("input");
            input.type = "text";
            input.placeholder = pref.placeholder ?? "Type something...";
            const hasDefaultValue = pref.hasOwnProperty("defaultValue") || pref.hasOwnProperty("default");
            if (
                UC_API.Prefs.get(pref.property).exists() &&
                (!pref.force || !hasDefaultValue || UC_API.Prefs.get(pref.property).hasUserValue())
            ) {
                input.value = UC_API.Prefs.get(pref.property).value;
            } else {
                UC_API.Prefs.set(pref.property, pref.defaultValue ?? pref.default ?? "");
                input.value = pref.defaultValue ?? pref.default;
            }
            if (pref.hasOwnProperty("border") && pref.border === "value") input.style.borderColor = input.value;
            else if (pref.hasOwnProperty("border")) input.style.borderColor = pref.border;
            input.addEventListener("change", () => {
                let value;
                if (pref.value === "number" || pref.value === "num") value = Number(input.value);
                else if (pref.value === "boolean" || pref.value === "bool") value = Boolean(input.value);
                else value = input.value;
                UC_API.Prefs.set(pref.property, value);
                this.manager.rebuildMods();
                if (pref.hasOwnProperty("border") && pref.border === "value") input.style.borderColor = input.value;
                if (pref.restart) showRestartPrefToast();
            });
            prefEl.appendChild(input);
        }

        if (
            ((pref.type === "separator" && pref.hasOwnProperty("label")) || pref.type === "checkbox") &&
            pref.hasOwnProperty("property")
        ) {
            const clickable = pref.type === "checkbox" ? prefEl : prefEl.children[1];

            if ((pref.defaultValue ?? pref.default) && !UC_API.Prefs.get(pref.property).exists()) {
                UC_API.Prefs.set(pref.property, true);
            }

            if (UC_API.Prefs.get(pref.property).value) {
                clickable.setAttribute("checked", true);
            }

            if (pref.type === "checkbox" && clickable.getAttribute("checked")) {
                clickable.children[0].checked = true;
            }

            clickable.addEventListener("click", (e) => {
                UC_API.Prefs.set(pref.property, e.currentTarget.getAttribute("checked") ? false : true);
                if (pref.type === "checkbox" && e.target.type !== "checkbox") {
                    clickable.children[0].checked = e.currentTarget.getAttribute("checked") ? false : true;
                }

                if (e.currentTarget.getAttribute("checked")) {
                    e.currentTarget.removeAttribute("checked")
                } else {
                    e.currentTarget.setAttribute("checked", true);
                }

                if (pref.restart) {
                    showRestartPrefToast();
                }
            });
        }

        if (pref.hasOwnProperty("conditions")) this.injectDynamicCSS(pref);
        return prefEl;
    },

    waitForElm(selector) {
        return new Promise(resolve => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector));
            }
    
            const observer = new MutationObserver(() => {
                if (document.querySelector(selector)) {
                    observer.disconnect();
                    resolve(document.querySelector(selector));
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        });
    },

    generateSingleSelector(cond, isNot) {
        const propertySelector = cond.property.replace(/\./g, "-");
        const isBoolean = typeof cond.value === "boolean";
        if (isBoolean) {
            return isNot ?
                `:has(#${propertySelector}:not([checked])` :
                `:has(#${propertySelector}[checked])`;
        } else {
            return isNot ?
                `:not(:has(#${propertySelector} > *[value="${cond.value}"]))` :
                `:has(#${propertySelector} > *[value="${cond.value}"])`;
        }
    },

    generateSelector(conditions, operator, id) {
        const condArray = Array.isArray(conditions) ? conditions : [conditions];
        if (condArray.length === 0) {
            return "";
        }

        const selectors = condArray.map(cond => {
            if (cond.if) return this.generateSingleSelector(cond.if, false);
            else if (cond.not) return this.generateSingleSelector(cond.not, true);
            else if (cond.conditions) return this.generateSelector(cond.conditions, cond.operator || "AND");
            else throw new Error("Invalid condition");
        }).filter(s => s);

        if (selectors.length === 0) {
            return "";
        } else if (operator === "OR") {
            return selectors.map(s => `dialog[open] .sineItemPreferenceDialogContent${s} #${id}`).join(", ");
        }

        return `dialog[open] .sineItemPreferenceDialogContent${selectors.join("")} #${id}`;
    },

    injectDynamicCSS(pref) {
        const identifier = pref.id ?? pref.property;
        const targetId = identifier.replace(/\./g, "-");
        const selector = this.generateSelector(pref.conditions, pref.operator || "OR", targetId);

        appendXUL(document.head, `
            <style>
                #${targetId} {
                    display: none;
                }
                ${selector} {
                    display: flex;
                }
            </style>
        `);
    },

    async loadMods() {
        if (document.querySelector(".sineItem")) {
            document.querySelectorAll(".sineItem").forEach(el => el.remove());
        }

        if (!UC_API.Prefs.get("sine.mods.disable-all").value) {
            let installedMods = await this.utils.getMods();
            const sortedArr = Object.values(installedMods).sort((a, b) => a.name.localeCompare(b.name));
            const ids = sortedArr.map(obj => obj.id);
            for (const key of ids) {
                const modData = installedMods[key];
                // Create new item.
                const item = appendXUL(document.querySelector("#sineModsList"), `
                    <vbox class="sineItem">
                        ${modData.preferences ? `
                            <dialog class="sineItemPreferenceDialog">
                                <div class="sineItemPreferenceDialogTopBar">
                                    <h3 class="sineItemTitle">${modData.name} (v${modData.version})</h3>
                                    <button>Close</button>
                                </div>
                                <div class="sineItemPreferenceDialogContent"></div>
                            </dialog>
                        ` : ""}
                        <vbox class="sineItemContent">
                            <hbox id="sineItemContentHeader">
                                <label>
                                    <h3 class="sineItemTitle">${modData.name} (v${modData.version})</h3>
                                </label>
                                <moz-toggle class="sineItemPreferenceToggle"
                                    title="${modData.enabled ? "Disable" : "Enable"} mod"
                                    ${modData.enabled ? 'pressed=""' : ""}/>
                            </hbox>
                            <description class="description-deemphasized sineItemDescription">
                                ${modData.description}o
                            </description>
                        </vbox>
                        <hbox class="sineItemActions">
                            ${modData.preferences ? `
                                <button class="sineItemConfigureButton" title="Open settings"></button>
                            ` : ""}
                            <button class="sineItemHomepageButton" title="Visit homepage"></button>
                            <button class="auto-update-toggle" ${modData["no-updates"] ? 'enabled=""' : ""}
                                title="${modData["no-updates"] ? "Enable" : "Disable"} updating for this mod">
                            </button>
                            <button class="sineItemUninstallButton">
                                <hbox class="box-inherit button-box">
                                    <label class="button-box">Remove mod</label>
                                </hbox>
                            </button>
                        </hbox>
                    </vbox>
                `);

                const toggle = item.querySelector(".sineItemPreferenceToggle");
                toggle.addEventListener("toggle", async () => {
                    installedMods = await this.utils.getMods();
                    const theme = installedMods[modData.id];
                    await this.toggleTheme(theme, theme.enabled);
                    toggle.title = `${theme.enabled ? "Enable" : "Disable"} mod`;
                });

                if (modData.preferences) {
                    const dialog = item.querySelector("dialog");

                    item.querySelector(".sineItemPreferenceDialogTopBar button")
                        .addEventListener("click", () => dialog.close());
                    
                    const loadPrefs = async () => {
                        const modPrefs = await this.utils.getModPreferences(modData);
                        for (const pref of modPrefs) {
                            const prefEl = this.parsePrefs(pref);
                            if (prefEl && typeof prefEl !== "string") {
                                item.querySelector(".sineItemPreferenceDialogContent").appendChild(prefEl);
                            }
                        }
                    }
                    if (modData.enabled) {
                        loadPrefs();
                    } else {
                        // If the mod is not enabled, load preferences when the toggle is clicked.
                        const listener = () => {
                            loadPrefs();
                            toggle.removeEventListener("toggle", listener);
                        };
                        toggle.addEventListener("toggle", listener);
                    }

                    // Add the click event to the settings button.
                    item.querySelector(".sineItemConfigureButton")
                        .addEventListener("click", () => dialog.showModal());
                }

                // Add homepage button click event.
                item.querySelector(".sineItemHomepageButton")
                    .addEventListener("click", () => window.open(modData.homepage, "_blank"));

                // Add update button click event.
                const updateButton = item.querySelector(".auto-update-toggle");
                updateButton.addEventListener("click", async () => {
                    const installedMods = await this.utils.getMods();
                    installedMods[key]["no-updates"] = !installedMods[key]["no-updates"];
                    if (!updateButton.getAttribute("enabled")) {
                        updateButton.setAttribute("enabled", true);
                        updateButton.title = "Enable updating for this mod";
                    } else {
                        updateButton.removeAttribute("enabled");
                        updateButton.title = "Disable updating for this mod";
                    }
                    await IOUtils.writeJSON(this.utils.modsDataFile, installedMods);
                });
                
                // Add remove button click event.
                const remove = item.querySelector(".sineItemUninstallButton");
                remove.addEventListener("click", async () => {
                    if (window.confirm("Are you sure you want to remove this mod?")) {
                        remove.disabled = true;
                        const jsPromises = [];
                        if (modData.hasOwnProperty("js")) {
                            for (
                                const file of modData["editable-files"].find(item => item.directory === "js").contents
                            ) {
                                const jsPath = PathUtils.join(
                                    this.jsDir,
                                    `${modData.id}_${modData.enabled ? file : file.replace(/[a-z]+\.m?js$/, "db")}`
                                );
                                jsPromises.push(IOUtils.remove(jsPath));
                            }
                        }

                        await this.manager.removeMod(modData.id);
                        this.loadPage();
                        this.manager.rebuildMods();
                        item.remove();
                        if (modData.hasOwnProperty("js")) {
                            await Promise.all(jsPromises);
                            this.showToast(
                                "A mod utilizing JS has been removed. " +
                                "For usage of it to be fully halted, restart your browser."
                            );
                        }
                    }
                });
            }
        }
    },

    buildNestedStructure(rootDir, directoryMap, relatedPaths) {
        const contents = [];

        // Add direct files in the root directory
        if (directoryMap.has(rootDir)) {
            contents.push(...directoryMap.get(rootDir));
        }

        // Process subdirectories
        const subdirs = new Map();
        for (const path of relatedPaths) {
            if (path !== rootDir && path.startsWith(rootDir + "/")) {
                const relativePath = path.substring(rootDir.length + 1);
                const firstDir = relativePath.split("/")[0];

                if (!subdirs.has(firstDir)) {
                    subdirs.set(firstDir, []);
                }

                if (relativePath.includes("/")) {
                    // This is a nested subdirectory
                    subdirs.get(firstDir).push(rootDir + "/" + relativePath);
                } else {
                    // This is a direct subdirectory
                    subdirs.get(firstDir).push(...directoryMap.get(path));
                }
            }
        }

        // Build subdirectory structures
        for (const [subdir, items] of subdirs.entries()) {
            const hasNestedDirs = items.some(item => typeof item === "string" && item.includes("/"));

            if (hasNestedDirs) {
                // Recursively build nested structure
                const nestedPaths = items.filter(item => typeof item === "string" && item.includes("/"));
                const directFiles = items.filter(item => typeof item === "string" && !item.includes("/"));

                const nestedStructure = this.buildNestedStructure(rootDir + "/" + subdir, directoryMap, nestedPaths);
                if (directFiles.length > 0) {
                    nestedStructure.contents.unshift(...directFiles);
                }
                contents.push(nestedStructure);
            } else {
                // Simple subdirectory
                contents.push({
                    directory: subdir,
                    contents: items
                });
            }
        }

        return {
            directory: rootDir,
            contents: contents
        };
    },

    convertPathsToNestedStructure(paths) {
        const result = [];
        const directoryMap = new Map();

        // First pass: collect all files and organize by their immediate parent directory
        for (const path of paths) {
            const parts = path.split("/");

            if (parts.length === 1) {
                // Root level file
                result.push(path);
            } else {
                const fileName = parts[parts.length - 1];
                const dirPath = parts.slice(0, -1).join("/");

                if (!directoryMap.has(dirPath)) {
                    directoryMap.set(dirPath, []);
                }
                directoryMap.get(dirPath).push(fileName);
            }
        }

        // Second pass: build the nested structure, merging directories that appear multiple times
        const processedDirs = new Set();

        for (const [dirPath, files] of directoryMap.entries()) {
            const topLevelDir = dirPath.split("/")[0];

            if (processedDirs.has(topLevelDir)) {
                continue; // Skip if we've already processed this top-level directory
            }

            // Find all directories that start with this top-level directory
            const relatedPaths = Array.from(directoryMap.keys())
                .filter(path => path.startsWith(topLevelDir + "/") || path === topLevelDir);

            if (relatedPaths.length === 1 && relatedPaths[0].split("/").length === 1) {
                // Simple case: only one level deep
                result.push({
                    directory: topLevelDir,
                    contents: directoryMap.get(topLevelDir)
                });
            } else {
                // Complex case: build nested structure
                const nestedStructure = this.buildNestedStructure(topLevelDir, directoryMap, relatedPaths);
                result.push(nestedStructure);
            }

            processedDirs.add(topLevelDir);
        }

        return result;
    },

    doesPathGoBehind(initialRelativePath, newRelativePath) {
        const cleanInitial = initialRelativePath.replace(/\/+$/, "");
        const cleanNewPath = newRelativePath.replace(/\/+$/, "");
          
        const initialSegments = cleanInitial ? cleanInitial.split("/").filter(segment => segment !== "") : [];
        const newPathSegments = cleanNewPath ? cleanNewPath.split("/").filter(segment => segment !== "") : [];

        let initialDepth = 0;
        for (const segment of initialSegments) {
            if (segment === "..") initialDepth--;
            else if (segment !== ".") initialDepth++;
        }
    
        let newDepth = 0;
        for (const segment of newPathSegments) {
            if (segment === "..") newDepth--;
            else if (segment !== ".") newDepth++;
        }

        const totalDepth = initialDepth + newDepth;
        return totalDepth < 0;
    },

    async processCSS(currentPath, cssContent, originalURL, themeFolder) {
        originalURL = originalURL.split("/");
        originalURL.pop();
        const repoBaseUrl = originalURL.join("/") + "/";
        const importRegex = /@import\s+(?:url\(['"]?([^'")]+)['"]?\)|['"]([^'"]+)['"])\s*;/g;
        const urlRegex = /url\((['"])([^'"]+)\1\)/g;

        const matches = [];
        let match;
        while ((match = importRegex.exec(cssContent.replace(/\/\*[\s\S]*?\*\//g, ''))) || (match = urlRegex.exec(cssContent))) {
            matches.push(match);
        }
    
        const imports = [...new Set(matches.map(match => match[2] ?? match[1]))];
    
        let editableFiles = [];
        const promises = [];
        for (const importPath of imports) {
            // Add to this array as needed (if things with weird paths are being added in.)
            const regexArray = ["data:", "chrome://", "resource://", "https://", "http://"];
            if (
                !this.doesPathGoBehind(currentPath, importPath) &&
                regexArray.every(regex => !importPath.startsWith(regex))
            ) {
                const splicedPath = currentPath.split("/").slice(0, -1).join("/");
                const completePath = splicedPath ? splicedPath + "/" : splicedPath;
                const resolvedPath = completePath + importPath.replace(/(?<!\.)\.\//g, "");
                const fullUrl = new URL(resolvedPath, repoBaseUrl).href;
                promises.push((async () => {
                    const importedCss = await this.fetch(fullUrl);
                    if (importPath.endsWith(".css")) {
                        const filesToAdd = await this.processCSS(resolvedPath, importedCss, repoBaseUrl, themeFolder);
                        editableFiles = editableFiles.concat(filesToAdd);
                    } else {
                        await IOUtils.writeUTF8(
                            themeFolder +
                                (this.os.includes("win") ? "\\" + resolvedPath.replace(/\//g, "\\") : resolvedPath),
                            importedCss
                        );
                        editableFiles.push(resolvedPath);
                    }
                })());
            }
        }
    
        // Add the current file to the editableFiles structure before writing
        editableFiles.push(currentPath);
    
        if (this.os.includes("win")) currentPath = "\\" + currentPath.replace(/\//g, "\\");
        else currentPath = "/" + currentPath;
        await IOUtils.writeUTF8(themeFolder + currentPath, cssContent);
        await Promise.all(promises);
        return editableFiles;
    },

    async processRootCSS(rootFileName, repoBaseUrl, themeFolder) {
        const rootPath = `${rootFileName}.css`;
        const rootCss = await this.fetch(repoBaseUrl);
    
        return await this.processCSS(rootPath, rootCss, repoBaseUrl, themeFolder);
    },

    async removeOldFiles(themeFolder, oldFiles, newFiles, newThemeData, isRoot=true) {
        const promises = [];
        for (const file of oldFiles) {
            if (
                typeof file === "string" &&
                !newFiles.some(f => typeof f === "string" && f === file)
            ) {
                const filePath = PathUtils.join(themeFolder, file);
                promises.push(IOUtils.remove(filePath));
            } else if (typeof file === "object" && file.directory && file.contents) {
                if (isRoot && file.directory === "js") {
                    const oldJsFiles = Array.isArray(file.contents) ? file.contents : [];
                    const newJsFiles = newFiles.find(
                        f => typeof f === "object" && f.directory === "js"
                    )?.contents || [];

                    for (const oldJsFile of oldJsFiles) {
                        if (typeof oldJsFile === "string") {
                            const actualFileName = `${newThemeData.id}_${oldJsFile}`;
                            const finalFileName = newThemeData.enabled
                                ? actualFileName
                                : actualFileName.replace(/[a-z]+\.m?js$/g, "db");
                            if (!newJsFiles.includes(oldJsFile)) {
                                const filePath = PathUtils.join(this.jsDir, finalFileName);
                                promises.push(IOUtils.remove(filePath));
                            }
                        }
                    }
                } else {
                    const matchingDir = newFiles.find(f => 
                        typeof f === "object" && f.directory === file.directory
                    );

                    if (!matchingDir) {
                        const dirPath = PathUtils.join(themeFolder, file.directory);
                        promises.push(IOUtils.remove(dirPath, { recursive: true }));
                    } else {
                        const newDirPath = PathUtils.join(themeFolder, file.directory);
                        promises.push(
                            this.removeOldFiles(
                                newDirPath, file.contents,
                                matchingDir.contents, newThemeData, false
                            )
                        );
                    }
                }
            }
        }

        await Promise.all(promises);
    },

    async parseStyles(themeFolder, newThemeData) {
        const promises = [];
        let editableFiles = [];
        if (newThemeData.style.hasOwnProperty("chrome") || newThemeData.style.hasOwnProperty("content")) {
            const files = ["userChrome", "userContent"];
            for (const file of files) {
                const formattedFile = file.toLowerCase().replace("user", "");
                if (newThemeData.style.hasOwnProperty(formattedFile)) {
                    promises.push((async () => {
                        const fileContents = await this.processRootCSS(
                            file, newThemeData.style[formattedFile], themeFolder
                        );
                        editableFiles = editableFiles.concat(fileContents);
                    })());
                }
            }
            editableFiles.push("chrome.css");
        } else {
            const chromeFiles = await this.processRootCSS("chrome", newThemeData.style, themeFolder);
            editableFiles = editableFiles.concat(chromeFiles);
        }
        await Promise.all(promises);
        return this.convertPathsToNestedStructure(editableFiles);
    },

    generateRandomId() {
        const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
        const groupLength = 9;
        const numGroups = 3;
          
        const generateGroup = () => {
            let group = "";
            for (let i = 0; i < groupLength; i++) {
                const randomIndex = Math.floor(Math.random() * chars.length);
                group += chars[randomIndex];
            }
            return group;
        };
        
        const groups = [];
        for (let i = 0; i < numGroups; i++) {
            groups.push(generateGroup());
        }
        
        return groups.join("-");
    },

    async createThemeJSON(repo, themes, theme={}, minimal=false, githubAPI=null) {
        const translateToAPI = (input) => {
            const trimmedInput = input.trim().replace(/\/+$/, "");
            const regex = /(?:https?:\/\/github\.com\/)?([\w\-.]+)\/([\w\-.]+)/i;
            const match = trimmedInput.match(regex);
            if (!match) return null;
            const user = match[1];
            const returnRepo = match[2];
            return `https://api.github.com/repos/${user}/${returnRepo}`;
        }
        const notNull = (data) => typeof data === "object" || (typeof data === "string" && data && data.toLowerCase() !== "404: not found");
        const shouldApply = (property) => !theme.hasOwnProperty(property) ||
            ((property === "style" || property === "preferences" || property === "readme" || property === "image")
                && typeof theme[property] === "string" && theme[property].startsWith("https://raw.githubusercontent.com/zen-browser/theme-store"));

        const repoRoot = this.rawURL(repo);
        const apiRequiringProperties = minimal ? ["updatedAt"] : ["homepage", "name", "description", "createdAt", "updatedAt"];
        let needAPI = false;
        for (const property of apiRequiringProperties) {
            if (!theme.hasOwnProperty(property)) needAPI = true;
        }
        if (needAPI && !githubAPI) githubAPI = this.fetch(translateToAPI(repo));

        const promises = [];
        const setProperty = async (property, value, ifValue=null, nestedProperty=false, escapeNull=false) => {
            promises.push((async () => {
                if (notNull(value) && (shouldApply(property) || escapeNull)) {
                    if (ifValue) ifValue = await this.fetch(value).then(res => notNull(res));
                    if (ifValue ?? true) {
                        if (nestedProperty) theme[property][nestedProperty] = value;
                        else theme[property] = value;
                    }
                }
            })());
            await promises[promises.length - 1];
        }

        if (!minimal) {
            promises.push((async () => {
                theme.style = {};

                const directories = ["", "chrome/"]
                for (const dir of directories) {
                    const stylePromises = [];
                    stylePromises.push(setProperty("style", `${repoRoot + dir}userChrome.css`, true, "chrome", true));
                    stylePromises.push(setProperty("style", `${repoRoot + dir}userContent.css`, true, "content", true));
                    await Promise.all(stylePromises);
                }

                if (Object.keys(theme.style).length === 0) {
                    await setProperty("style", `${repoRoot}chrome.css`, true);
                }
            })());
            setProperty("preferences", `${repoRoot}preferences.json`, true);
            setProperty("readme", `${repoRoot}README.md`, true);
            if (!theme.hasOwnProperty("readme")) setProperty("readme", `${repoRoot}readme.md`, true);
            let randomID = this.generateRandomId();
            while (themes.hasOwnProperty(randomID)) {
                randomID = this.generateRandomId();
            }
            setProperty("id", randomID);
            promises.push((async () => {
                const silkthemesJSON = await this.fetch(`${repoRoot}bento.json`);
                if (notNull(silkthemesJSON) && silkthemesJSON.hasOwnProperty("package")) {
                    const silkPackage = silkthemesJSON.package;
                    setProperty("name", silkPackage.name);
                    setProperty("author", silkPackage.author);
                    setProperty("version", silkPackage.version);
                } else {
                    if (needAPI) {
                        githubAPI = await githubAPI;
                        setProperty("name", githubAPI.name);
                    }
                    const releasesData = await this.fetch(`${translateToAPI(repo)}/releases/latest`);
                    setProperty(
                        "version",
                        releasesData.hasOwnProperty("tag_name") ?
                            releasesData.tag_name.toLowerCase().replace("v", "") :
                            "1.0.0"
                    );
                }
            })());
        }
        if (needAPI) {
            githubAPI = await githubAPI;
            if (!minimal) {
                setProperty("homepage", githubAPI.html_url);
                setProperty("description", githubAPI.description);
                setProperty("createdAt", githubAPI.created_at);
            }
            setProperty("updatedAt", githubAPI.updated_at);
        }

        await Promise.all(promises);
        return minimal ? {theme, githubAPI} : theme;
    },

    async handleJS(newThemeData, forceAllowJS=false) {
        const editableFiles = [];
        const promises = [];
        if (typeof newThemeData.js === "string" || typeof newThemeData.js === "array") {
            if (UC_API.Prefs.get("sine.allow-unsafe-js").value || forceAllowJS) {
                const jsFiles = Array.isArray(newThemeData.js) ? newThemeData.js : [newThemeData.js];
                for (const file of jsFiles) {
                    promises.push((async () => {
                        const fileContents = await this.fetch(file).catch(err => console.error(err));
                        if (typeof fileContents === "string" && fileContents.toLowerCase() !== "404: not found") {
                            const fileName = file.split("/").pop();
                            await IOUtils.writeUTF8(
                                PathUtils.join(this.jsDir, newThemeData.id + "_" + fileName),
                                fileContents
                            );
                            editableFiles.push(`js/${fileName}`);
                        }
                    })());
                }
            } else {
                UC_API.Notifications.show({
                    priority: "warning",
                    label: "This mod uses unofficial JS. To install it, you must enable the option. (unsafe)",
                    buttons: [
                        {
                          label: "Enable",
                          callback: () => {
                              UC_API.Prefs.set("sine.allow-unsafe-js", true);
                              this.handleJS(newThemeData, true);
                              return true;
                          }
                        },
                        {
                          label: "Enable for this mod only",
                          callback: () => {
                              this.handleJS(newThemeData, true);
                              return true;
                          }
                        }
                    ]
                });
                return false;
            }
        } else {
            const dirLink = `https://api.github.com/repos/sineorg/store/contents/mods/${newThemeData.id}`;
            const newFiles = await this.fetch(dirLink).then(res => Object.values(res)).catch(err => console.warn(err));
            for (const file of newFiles) {
                promises.push((async () => {
                    const fileContents = await this.fetch(file.download_url).catch(err => console.error(err));
                    if (typeof fileContents === "string" && fileContents.toLowerCase() !== "404: not found") {
                        await IOUtils.writeUTF8(
                            PathUtils.join(this.jsDir, newThemeData.id + "_" + file.name),
                            fileContents
                        );
                        editableFiles.push(`js/${file.name}`);
                    }
                })());
            }
        }
        await Promise.all(promises);
        return this.convertPathsToNestedStructure(editableFiles);
    },

    async syncModData(currThemeData, newThemeData, currModData=false) {
        const themeFolder = this.utils.getModFolder(newThemeData.id);
        newThemeData["editable-files"] = [];
        
        const promises = [];

        let changeMadeHasJS = false;
        if (newThemeData.hasOwnProperty("js") || (currModData && currModData.hasOwnProperty("js"))) {
            changeMadeHasJS = true;
            if (newThemeData.hasOwnProperty("js")) {
                promises.push((async () => {
                    const jsReturn = await this.handleJS(newThemeData);
                    if (jsReturn) newThemeData["editable-files"] = newThemeData["editable-files"].concat(jsReturn);
                    else return "unsupported js installation";
                })());
            }
        } if (newThemeData.hasOwnProperty("style")) {
            promises.push((async () => {
                const styleFiles = await this.parseStyles(themeFolder, newThemeData);
                newThemeData["editable-files"] = newThemeData["editable-files"].concat(styleFiles);
            })());
        } if (newThemeData.hasOwnProperty("preferences")) {
            promises.push((async () => {
                let newPrefData;
                if (typeof newThemeData.preferences === "array") {
                    newPrefData = newThemeData.preferences;
                } else {
                    newPrefData = await this.fetch(newThemeData.preferences, true).catch(err => console.error(err));

                    try {
                        JSON.parse(newPrefData);
                    } catch (err) {
                        console.warn(err);
                        newPrefData = await this.fetch(
                            `https://raw.githubusercontent.com/zen-browser/theme-store/main/themes/${newThemeData.id}/preferences.json`,
                            true
                        ).catch(err => console.error(err));
                    }
                }
                await IOUtils.writeUTF8(PathUtils.join(themeFolder, "preferences.json"), newPrefData);
            })());
            newThemeData["editable-files"].push("preferences.json");
        } if (newThemeData.hasOwnProperty("readme")) {
            promises.push((async () => {
                const newREADMEData = await this.fetch(newThemeData.readme).catch(err => console.error(err));
                await IOUtils.writeUTF8(PathUtils.join(themeFolder, "readme.md"), newREADMEData);
            })());
            newThemeData["editable-files"].push("readme.md");
        } if (newThemeData.hasOwnProperty("modules")) {
            const modules = Array.isArray(newThemeData.modules) ? newThemeData.modules : [newThemeData.modules];
            for (const modModule of modules) {
                if (!Object.values(currThemeData).some(item => item.homepage === modModule)) {
                    promises.push(this.installMod(modModule, false));
                }
            }
        }

        await Promise.all(promises);
        if (
            currModData &&
            currModData.hasOwnProperty("editable-files") &&
            newThemeData.hasOwnProperty("editable-files")
        ) {
            await this.removeOldFiles(
                themeFolder,
                currModData["editable-files"],
                newThemeData["editable-files"],
                newThemeData
            );
        }

        newThemeData["no-updates"] = false;
        newThemeData.enabled = true;

        if (newThemeData.hasOwnProperty("modules")) currThemeData = await this.utils.getMods();
        currThemeData[newThemeData.id] = newThemeData;

        await IOUtils.writeJSON(this.utils.modsDataFile, currThemeData);
        if (currModData) return changeMadeHasJS;
    },

    async installMod(repo, reload=true) {
        const currThemeData = await this.utils.getMods();

        const newThemeData = await this.fetch(`${this.rawURL(repo)}theme.json`)
            .then(async res =>
                await this.createThemeJSON(repo, currThemeData, typeof res !== "object" ? {} : res)
            );
        if (typeof newThemeData.style === "object" && Object.keys(newThemeData.style).length === 0) {
            delete newThemeData.style;
        }
        if (newThemeData) {
            await this.syncModData(currThemeData, newThemeData);

            if (reload) {
                this.manager.rebuildMods();
                this.loadMods();
            }

            if (newThemeData.hasOwnProperty("js"))
                this.showToast(
                    "A mod utilizing JS has been installed. " +
                    "For it to work properly, restart your browser."
                );
        }
    },

    async updateMods(source) {
        if ((source === "auto" && this.autoUpdates) || source === "manual") {
            const currThemeData = await this.utils.getMods();
            let changeMade = false;
            let changeMadeHasJS = false;
            for (const key in currThemeData) {
                const currModData = currThemeData[key];
                if (currModData.enabled && !currModData["no-updates"]) {
                    let newThemeData, githubAPI, originalData;
                    if (currModData.homepage) {
                        originalData = await this.fetch(`${this.rawURL(currModData.homepage)}theme.json`);
                        const minimalData = await this.createThemeJSON(
                            currModData.homepage,
                            currThemeData,
                            typeof originalData !== "object" ? {} : originalData,
                            true
                        );
                        newThemeData = minimalData["theme"];
                        githubAPI = minimalData["githubAPI"];
                    } else {
                        newThemeData = await this.fetch(
                            `https://raw.githubusercontent.com/zen-browser/theme-store/main/themes/${currModData.id}/theme.json`
                        );
                    }

                    if (
                        newThemeData &&
                        typeof newThemeData === "object" &&
                        new Date(currModData.updatedAt) < new Date(newThemeData.updatedAt)
                    ) {
                        changeMade = true;
                        console.log("Auto-updating: " + currModData.name + "!");
                        if (currModData.homepage) {
                            let customData = await this.createThemeJSON(
                                currModData.homepage,
                                currThemeData,
                                typeof newThemeData !== "object" ? {} : newThemeData,
                                false,
                                githubAPI
                            );
                            if (currModData.hasOwnProperty("version") && customData.version === "1.0.0") {
                                customData.version = currModData.version;
                            }
                            customData.id = currModData.id;
                            if (typeof newThemeData.style === "object" && Object.keys(newThemeData.style).length === 0) {
                                delete newThemeData.style; 
                            }

                            const toAdd = ["style", "readme", "preferences", "image"];
                            for (const property of toAdd) {
                                if (!customData.hasOwnProperty(property) && currModData.hasOwnProperty(property))
                                    customData[property] = currModData[property];
                            }

                            const toReplace = ["name", "description"];
                            for (const property of toReplace) {
                                if (
                                    (
                                        (
                                            typeof originalData !== "object" &&
                                            originalData.toLowerCase() === "404: not found"
                                        ) || !originalData[property]
                                    ) && currModData[property]
                                ) {
                                    customData[property] = currModData[property];
                                }
                            }

                            newThemeData = customData;
                        }
                        changeMadeHasJS = await this.syncModData(currThemeData, newThemeData, currModData);
                    }
                }
            }

            if (changeMadeHasJS) {
                this.showToast("A mod utilizing JS has been updated. For it to work properly, restart your browser.");
            }

            if (changeMade) {
                this.manager.rebuildMods();
                this.loadMods();
            }
            return changeMade;
        }
    },

    parseMD(markdown, repoBaseUrl) {
        const renderer = new marked.Renderer();
        
        renderer.image = (href, title, text) => {
            if (!href.match(/^https?:\/\//) && !href.startsWith("//")) href = `${repoBaseUrl}/${href}`;
            const titleAttr = title ? `title="${title}"` : "";
            return `<img src="${href}" alt="${text}" ${titleAttr} />`;
        };

        renderer.link = (href, title, text) => {
            if (!href.match(/^https?:\/\//) && !href.startsWith("//")) {
                const isRelativePath = href.includes("/") || /\.(md|html|htm|png|jpg|jpeg|gif|svg|pdf)$/i.test(href);
                if (isRelativePath) href = `${repoBaseUrl}/${href}`;
                else href = `https://${href}`;
            }
            const titleAttr = title ? `title="${title}"` : "";
            return `<a href="${href}" ${titleAttr}>${text}</a>`;
        };

        marked.setOptions({
          gfm: true,
          renderer: renderer
        });

        let htmlContent = marked.parse(markdown);
        htmlContent = htmlContent.replace(/<img([^>]*?)(?<!\/)>/gi, "<img$1 />")
            .replace(/<hr([^>]*?)(?<!\/)>/gi, "<hr$1 />")
            .replace(/<br([^>]*?)(?<!\/)>/gi, "<br$1 />");
        return htmlContent;
    },

    currentPage: 0,

    // Load and render items for the current page
    async loadPage() {
        const newList = document.querySelector("#sineInstallationList");

        // Clear the list
        newList.innerHTML = "";

        // Calculate pagination
        const itemsPerPage = 6;
        const installedMods = await this.utils.getMods();
        const availableItems = Object.fromEntries(
            Object.entries(this.filteredItems).filter(([key, _value]) => !installedMods[key])
        );
        const totalItems = Object.entries(availableItems).length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        const currentPage = Math.max(0, Math.min(this.currentPage, totalPages - 1));
        const start = currentPage * itemsPerPage;
        const end = Math.min(start + itemsPerPage, totalItems);
        const currentItems = Object.fromEntries(Object.entries(availableItems).slice(start, end));

        // Render items for the current page
        for (const [key, data] of Object.entries(currentItems)) {
            (async () => {
                const githubLink = `
                    <a href="https://github.com/${data.homepage}" target="_blank">
                        <button class="github-link"></button>
                    </a>
                `;
                
                // Create item
                const newItem = appendXUL(newList, `
                    <hbox class="sineInstallationItem">
                        ${data.image ? `<img src="${data.image}"/>` : ""}
                        <hbox class="sineMarketplaceItemHeader">
                            <label>
                                <h3 class="sineMarketplaceItemTitle">${data.name} (v${data.version})</h3>
                            </label>
                        </hbox>
                        <description class="sineMarketplaceItemDescription">${data.description}</description>
                        ${data.readme ? `
                            <dialog class="sineItemPreferenceDialog">
                                <div class="sineItemPreferenceDialogTopBar">
                                    ${githubLink}
                                    <button>Close</button>
                                </div>
                                <div class="sineItemPreferenceDialogContent">
                                    <div class="markdown-body"></div>
                                </div>
                            </dialog>
                        ` : ""}
                        <vbox class="sineMarketplaceButtonContainer">
                            ${data.readme ? `
                                <button class="sineMarketplaceOpenButton"></button>
                            ` : githubLink}
                            <button class="sineMarketplaceItemButton">Install</button>
                        </vbox>
                    </hbox>
                `);
            
                // Add image
                if (data.image) {
                    const newItemImage = newItem.querySelector("img");
                    newItemImage.addEventListener("click", () => {
                        if (newItemImage.hasAttribute("zoomed")) newItemImage.removeAttribute("zoomed");
                        else newItemImage.setAttribute("zoomed", "true");
                    });
                }
                
                // Add readme dialog
                if (data.readme) {
                    const dialog = newItem.querySelector("dialog");
                    newItem.querySelector(".sineItemPreferenceDialogTopBar > button")
                        .addEventListener("click", () => dialog.close());
                
                    const newOpenButton = newItem.querySelector(".sineMarketplaceOpenButton");
                    newOpenButton.addEventListener("click", async () => {
                        const themeMD = await this.fetch(data.readme).catch((err) => console.error(err));
                        let relativeURL = data.readme.split("/");
                        relativeURL.pop();
                        relativeURL = relativeURL.join("/") + "/";
                        newItem.querySelector(".markdown-body").innerHTML = this.parseMD(themeMD, relativeURL);
                        dialog.showModal();
                    });
                }
            
                // Add install button
                const newItemButton = newItem.querySelector(".sineMarketplaceItemButton");
                newItemButton.addEventListener("click", async (e) => {
                    newItemButton.disabled = true;
                    await this.installMod(this.marketplace[key].homepage);
                    this.loadPage();
                });
            
                // Check if installed
                if (installedMods[key]) newItem.setAttribute("installed", "true");
            })();
        }

        // Update navigation controls
        const navContainer = document.querySelector("#navigation-container");
        if (navContainer) {
            navContainer.remove();
        }
        if (totalPages > 1) {
            const navContainer = appendXUL(document.querySelector("#sineInstallationGroup"), `
                <hbox id="navigation-container">
                    <button ${currentPage === 0 ? 'disabled=""' : ""}>Previous</button>
                    <button ${currentPage >= totalPages - 1 ? 'disabled=""' : ""}>Next</button>
                </hbox>
            `, document.querySelectorAll("#sineInstallationGroup .description-deemphasized")[1]);


            navContainer.children[0].addEventListener("click", () => {
                if (this.currentPage > 0) {
                    this.currentPage--;
                    this.loadPage();
                }
            });

            navContainer.children[1].addEventListener("click", () => {
                if (this.currentPage < totalPages - 1) {
                    this.currentPage++;
                    this.loadPage();
                }
            });
        }
    },

    async initMarketplace() {
        const marketplace = await this.fetch(this.marketURL).then(res => {
            if (res) {
                res = Object.fromEntries(Object.entries(res).filter(([key, data]) =>
                    ((data.os && data.os.some(os => os.includes(this.os))) || !data.os) &&
                    ((data.fork && data.fork.some(fork => fork.includes(this.fork))) || !data.fork) &&
                    ((data.notFork && !data.notFork.some(fork => fork.includes(this.fork))) || !data.notFork)
                ));
            }
            return res;
        }).catch(err => console.warn(err));

        if (marketplace) {
            this.marketplace = marketplace;
            this.filteredItems = marketplace;
            this.loadPage();
        }
    },

    // Initialize Sine settings page.
    async initSine() {
        const sineGroupData = `data-category="paneSineMods" ${this.sineIsActive ? "" : 'hidden="true"'}`;

        const prefPane = document.querySelector("#mainPrefPane");
        const generalGroup = document.querySelector('[data-category="paneGeneral"]');

        const checkIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-check2" viewBox="0 0 16 16"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0"/></svg>';

        appendXUL(prefPane, `
            <hbox id="SineModsCategory" class="subcategory" ${sineGroupData}>
                <h1>${this.versionBrand} Mods</h1>
            </hbox>
        `, generalGroup);

        // Create group.
        const newGroup = appendXUL(prefPane, `
            <groupbox id="sineInstallationGroup" class="highlighting-group subcategory" ${sineGroupData}>
                <hbox id="sineInstallationHeader">
                    <h2>Marketplace</h2>
                    <input placeholder="Search..." class="sineCKSOption-input"/>
                    <button class="sineMarketplaceOpenButton"
                        id="sineMarketplaceRefreshButton" title="Refresh marketplace">
                    </button>
                    <button>Close</button>
                </hbox>
                <description class="description-deemphasized">
                    Find and install mods from the store.
                </description>
                <vbox id="sineInstallationList"></vbox>
                <description class="description-deemphasized">
                    or, add your own locally from a GitHub repo.
                </description>
                <vbox id="sineInstallationCustom">
                    <input class="sineCKSOption-input" placeholder="username/repo (folder if needed)"/>
                    <button class="sineMarketplaceItemButton">Install</button>
                    <button class="sineMarketplaceOpenButton sineItemConfigureButton"
                      title="Open settings"></button>
                    <button class="sineMarketplaceOpenButton" title="Expand marketplace"></button>
                </vbox>
            </groupbox>
        `, generalGroup);

        // Create search input event.
        let searchTimeout = null;
        document.querySelector("#sineInstallationHeader .sineCKSOption-input").addEventListener("input", (e) => {
            clearTimeout(searchTimeout); // Clear any pending search
            searchTimeout = setTimeout(() => {
                this.currentPage = 0; // Reset to first page on search
                this.filteredItems = Object.fromEntries(
                    Object.entries(this.marketplace).filter(
                        ([_key, item]) => item.name.toLowerCase().includes(e.target.value.toLowerCase())
                    )
                );
                this.loadPage();
            }, 300); // 300ms delay
        });

        // Create refresh button event
        const newRefresh = document.querySelector("#sineMarketplaceRefreshButton");
        newRefresh.addEventListener("click", async () => {
            newRefresh.disabled = true;
            await this.initMarketplace();
            newRefresh.disabled = false;
        });

        // Create close button event
        document.querySelector("#sineInstallationHeader button:last-child")
          .addEventListener("click", () => {
            newGroup.hidePopover();
            newGroup.removeAttribute("popover");
        });

        this.initMarketplace();

        // Custom mods event
        const newCustomButton =
            document.querySelector("#sineInstallationCustom .sineMarketplaceItemButton");
        const newCustomInput =
            document.querySelector("#sineInstallationCustom input");
        const installCustom = async () => {
            newCustomButton.disabled = true;
            await this.installMod(newCustomInput.value);
            newCustomInput.value = "";
            await this.loadPage();
            newCustomButton.disabled = false;
        }

        newCustomInput.addEventListener("keyup", (e) => {
            if (e.key === "Enter") installCustom();
        });
        newCustomButton.addEventListener("click", installCustom);

        // Settings dialog
        const newSettingsDialog = appendXUL(document.querySelector("#sineInstallationCustom"), `
            <dialog class="sineItemPreferenceDialog">
                <div class="sineItemPreferenceDialogTopBar"> 
                    <h3 class="sineMarketplaceItemTitle">Settings</h3>
                    <button>Close</button>
                </div>
                <div class="sineItemPreferenceDialogContent"></div>
            </dialog>
        `);
        
        // Settings close button event
        newSettingsDialog.querySelector("button")
          .addEventListener("click", () => newSettingsDialog.close());

        // Settings content
        const settingPrefs = [
            {
                "type": "text",
                "label": "**General**",
                "margin": "10px 0 15px 0",
                "size": "20px",
            },
            {
                "type": "checkbox",
                "property": "sine.allow-external-marketplace",
                "label": "Enable external marketplace. (may expose you to malicious JS mods)"
            },
            {
                "type": "string",
                "property": "sine.marketplace-url",
                "label": "Marketplace URL (raw github/text link)",
                "conditions": [{
                    "if":{
                        "property": "sine.allow-external-marketplace",
                        "value": true
                    }
                }]
            },
            {
                "type": "checkbox",
                "property": "sine.allow-unsafe-js",
                "label": "Enable installing JS from unofficial sources. (unsafe, use at your own risk)",
            },
            {
                "type": "checkbox",
                "property": "sine.enable-dev",
                "label": "Enable the developer command palette. (Ctrl+Shift+Y)",
            },
            {
                "type": "text",
                "label": "**Updates**",
                "margin": "10px 0 15px 0",
                "size": "20px",
            },
            {
                "type": "button",
                "label": "Check for Updates",
                "action": async () => {
                    return await this.updateEngine();
                },
                "indicator": checkIcon,
            },
            {
                "type": "dropdown",
                "property": "sine.is-cosine",
                "label": "Update branch.",
                "value": "bool",
                "placeholder": false,
                "restart": true,
                "options": [
                    {
                        "value": false,
                        "label": "sine"
                    },
                    {
                        "value": true,
                        "label": "cosine"
                    }
                ],
                "margin": "8px 0 0 0",
            },
            {
                "type": "checkbox",
                "property": "sine.script.auto-update",
                "defaultValue": true,
                "label": "Enables engine auto-updating.",
            },
            {
                "type": "checkbox",
                "property": "sine.script.auto-restart",
                "label": "Automatically restarts when engine updates are found.",
            }
        ];

        for (const [idx, pref] of settingPrefs.entries()) {
            let prefEl = this.parsePrefs(pref);

            if (pref.type === "string") {
                prefEl.addEventListener("change", () => {
                    this.initMarketplace();
                });
            }

            if (pref.property === "sine.enable-dev") {
                prefEl.addEventListener("click", () => {
                    const commandPalette = this.globalDoc.querySelector(".sineCommandPalette");
                    if (commandPalette) {
                        commandPalette.remove();
                    }

                    initDev(Sine);
                });
            }

            const newSettingsContent = newSettingsDialog.querySelector(".sineItemPreferenceDialogContent");
            if (prefEl && typeof prefEl !== "string") newSettingsContent.appendChild(prefEl);
            else if (prefEl === "button") {
                const prefContainer = appendXUL(newSettingsContent, `
                    <hbox class="updates-container">
                        <button style="margin: 0; box-sizing: border-box;">${pref.label}</button>
                        ${pref.indicator ? `
                            <div id="btn-indicator-${idx}" class="update-indicator"></div>
                        ` : ""}
                    </hbox>
                `);
                prefEl = prefContainer.children[0];
                prefEl.addEventListener("click", async () => {
                    prefEl.disabled = true;
                    if (pref.hasOwnProperty("indicator"))
                        document.querySelector(`#btn-indicator-${idx}`).innerHTML = pref.indicator + "<p>...</p>";
                    const isUpdated = await pref.action();
                    prefEl.disabled = false;
                    if (pref.hasOwnProperty("indicator")) {
                        document.querySelector(`#btn-indicator-${idx}`).innerHTML =
                            pref.indicator + `<p>${isUpdated ? "Engine updated" : "Up-to-date"}</p>`;
                    }
                });
            }
        }

        // Settings button
        document.querySelector(".sineItemConfigureButton")
            .addEventListener("click", () => newSettingsDialog.showModal());

        // Expand button event
        document.querySelector("#sineInstallationCustom .sineMarketplaceOpenButton:not(.sineItemConfigureButton)")
          .addEventListener("click", () => {
            newGroup.setAttribute("popover", "manual");
            newGroup.showPopover();
        });
        
        let modsDisabled = UC_API.Prefs.get("sine.mods.disable-all").value;

        const installedGroup = appendXUL(
            document.querySelector("#mainPrefPane"),
            `
                <groupbox id="sineInstalledGroup" class="highlighting-group subcategory"
                  ${this.sineIsActive ? "" : 'hidden=""'} data-category="paneSineMods">
                    <hbox id="sineInstalledHeader">
                        <h2>Installed Mods</h2>
                        <moz-toggle class="sinePreferenceToggle" ${modsDisabled ? "" : 'pressed="true"'}
                          aria-label="${modsDisabled ? "Enable" : "Disable"} all mods"></moz-toggle>
                    </hbox>
                    <description class="description-deemphasized">
                        ${this.versionBrand} Mods you have installed are listed here.
                    </description>
                    <hbox class="indent">
                        <hbox class="updates-container">
                            <button class="auto-update-toggle"
                                title="${this.autoUpdates ? "Disable" : "Enable"} auto-updating">
                                <span>Auto-Update</span>
                            </button>
                            <button class="manual-update">Check for Updates</button>
                            <div class="update-indicator">
                                ${this.autoUpdates ? `${checkIcon}<p>Up-to-date</p>` : ""}
                            </div>
                        </hbox>
                        <hbox class="transfer-container">
                            <button class="sine-import-btn">Import</button>
                            <button class="sine-export-btn">Export</button>
                        </hbox>
                    </hbox>
                    <vbox id="sineModsList"></vbox>
                </groupbox>
            `,
            generalGroup
        );

        // Logic to disable mod.
        const groupToggle = document.querySelector(".sinePreferenceToggle");
        groupToggle.addEventListener("toggle", () => {
            modsDisabled = !UC_API.Prefs.get("sine.mods.disable-all").value;
            UC_API.Prefs.set("sine.mods.disable-all", modsDisabled);
            groupToggle.title = `${UC_API.Prefs.get("sine.mods.disable-all").value ? "Enable" : "Disable"} all mods`;
            this.manager.rebuildMods();
            this.loadMods();
        });

        const autoUpdateButton = document.querySelector(".auto-update-toggle");
        autoUpdateButton.addEventListener("click", () => {
            this.autoUpdates = !this.autoUpdates;
            if (this.autoUpdates) {
                autoUpdateButton.setAttribute("enabled", true);
                autoUpdateButton.title = "Disable auto-updating";
            } else {
                autoUpdateButton.removeAttribute("enabled");
                autoUpdateButton.title = "Enable auto-updating";
            }
        });
        if (this.autoUpdates) {
            autoUpdateButton.setAttribute("enabled", true);
        }

        document.querySelector(".manual-update").addEventListener("click", async () => {
            const updateIndicator = installedGroup.querySelector(".update-indicator");
            updateIndicator.innerHTML = `${checkIcon}<p>...</p>`;
            const isUpdated = await this.updateMods("manual");
            updateIndicator.innerHTML = `${checkIcon}<p>${isUpdated ? "Mods updated" : "Up-to-date"}</p>`;
        });

        document.querySelector(".sine-import-btn").addEventListener("click", async () => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".json";
            input.style.display = "none";
            input.setAttribute("moz-accept", ".json");
            input.setAttribute("accept", ".json");
            input.click();

            let timeout;

            const filePromise = new Promise((resolve) => {
              input.addEventListener("change", (event) => {
                  if (timeout) {
                      clearTimeout(timeout);
                  }
              
                  const file = event.target.files[0];
                  resolve(file);
              });
          
              timeout = setTimeout(() => {
                  console.warn("[Sine]: Import timeout reached, aborting.");
                  resolve(null);
              }, 60000);
            });
        
            input.addEventListener("cancel", () => {
                console.warn("[Sine]: Import cancelled by user.");
                clearTimeout(timeout);
            });
        
            input.click();
        
            try {
                const file = await filePromise;
              
                if (!file) {
                    return;
                }
            
                const content = await file.text();
            
                const installedMods = await this.utils.getMods();
                const mods = JSON.parse(content);
            
                for (const mod of mods) {
                    installedMods[mod.id] = mod;
                    await this.installMod(mod.homepage, false);
                }

                await IOUtils.writeJSON(this.utils.modsDataFile, installedMods);

                this.loadPage();
                this.loadMods();
                this.manager.rebuildMods();
            } catch (error) {
                console.error("[Sine]: Error while importing mods:", error);
            }
        
            if (input) {
                input.remove();
            }
        });
        document.querySelector(".sine-export-btn").addEventListener("click", async () => {
            let temporalAnchor, temporalUrl;
            try {
                const mods = await this.utils.getMods();
                let modsJson = [];
                for (const mod of Object.values(mods)) {
                    modsJson.push(mod);
                }
                modsJson = JSON.stringify(modsJson, null, 2);
                const blob = new Blob([modsJson], { type: "application/json" });
              
                temporalUrl = URL.createObjectURL(blob);
                // Creating a link to download the JSON file
                temporalAnchor = document.createElement('a');
                temporalAnchor.href = temporalUrl;
                temporalAnchor.download = "sine-mods-export.json";
              
                document.body.appendChild(temporalAnchor);
                temporalAnchor.click();
                temporalAnchor.remove();
              
                successBox.hidden = false;
            } catch (error) {
                console.error("[Sine]: Error while exporting mods:", error);
            }
        
            if (temporalAnchor) {
                temporalAnchor.remove();
            }
        
            if (temporalUrl) {
                URL.revokeObjectURL(temporalUrl);
            }
        });
    },

    initSkeleton() {
        if (location.hash === "#zenMarketplace" || location.hash === "#sineMods") this.sineIsActive = true;

        // Add sine tab to the selection sidebar.
        const sineTab = appendXUL(document.querySelector("#categories"), `
            <richlistitem id="category-sine-mods" class="category"
              value="paneSineMods" tooltiptext="${this.versionBrand} Mods" align="center">
                <image class="category-icon"/>
                <label class="category-name" flex="1">
                    ${this.versionBrand} Mods
                </label>
            </richlistitem>
        `, document.querySelector("#category-general").nextElementSibling, true);

        if (this.sineIsActive) {
            document.querySelector("#categories").selectItem(sineTab);
            document.querySelectorAll('[data-category="paneGeneral"]').forEach(el =>
                el.setAttribute("hidden", "true"));
        };

        // Add Sine to the initaliztion object.
        gCategoryInits.set("paneSineMods", {
            _initted: true,
            init: () => {}
        });
    },

    async removeZenMods() {
        document.querySelector("#category-zen-marketplace").remove();
        await this.waitForElm("#ZenMarketplaceCategory");
        document.querySelector("#ZenMarketplaceCategory").remove();
        await this.waitForElm("#zenMarketplaceGroup");
        document.querySelector("#zenMarketplaceGroup").remove();
    },

    get fork() {
        let fork = "firefox";
        if (UC_API.Prefs.get("zen.browser.is-cool").exists()) fork = "zen";
        else if (UC_API.Prefs.get("enable.floorp.update").exists()) fork = "floorp";
        else if (UC_API.Prefs.get("mullvadbrowser.migration.version").exists()) fork = "mullvad";
        else if (UC_API.Prefs.get("browser.migration.waterfox_version").exists()) fork = "waterfox";
        else if (UC_API.Prefs.get("librewolf.aboutMenu.checkVersion").exists()) fork = "librewolf";
        // Add more unique identifiers to identify forks.
        return fork;
    },

    forkNum() {
        const nums = {
            "firefox": 0,
            "zen": 1,
            "floorp": 2,
            "mullvad": 3,
            "waterfox": 4,
            "librewolf": 5,
        };
        return nums[this.fork];
    },

    async init() {
        this.initSkeleton();
        if (this.fork === "zen") this.removeZenMods();
        
        // Inject settings styles.
        import("chrome://userscripts/content/engine/css/settings.js");

        this.initSine();
        this.loadMods();
        this.updateMods("auto");
    },
}

window.SineAPI = {
    utils: Sine.utils,
    manager: Sine.manager,
};

// Initialize Sine directory and file structure.
const modsJSON = Sine.utils.modsDataFile;
const chromeFile = Sine.utils.chromeFile;
const contentFile = Sine.utils.contentFile;

if (!await IOUtils.exists(modsJSON)) await IOUtils.writeUTF8(modsJSON, "{}");
if (!await IOUtils.exists(chromeFile)) await IOUtils.writeUTF8(chromeFile, "");
if (!await IOUtils.exists(contentFile)) await IOUtils.writeUTF8(contentFile, "");

if (Sine.mainProcess) {
    // Initialize fork pref that is used in mods.
    if (!UC_API.Prefs.get("sine.fork-id").exists()) {
        UC_API.Prefs.set("sine.fork-id", Sine.forkNum());
    }

    // Delete and transfer old zen files to the new Sine structure (if using Zen.)
    if (Sine.fork === "zen") {
        UC_API.Prefs.set("zen.mods.auto-update", false);
        try {
            const zenMods = await gZenMods.getMods();
            if (Object.keys(zenMods).length > 0) {
                const sineMods = await Sine.utils.getMods();
                await IOUtils.writeUTF8(modsJSON, JSON.stringify({...sineMods, ...zenMods}));

                const zenModsPath = gZenMods.modsRootPath;
                for (const id of Object.keys(zenMods)) {
                    await IOUtils.copy(PathUtils.join(zenModsPath, id), Sine.utils.modsDir, { recursive: true });   
                }
            
                // Delete old Zen-related mod data.
                IOUtils.remove(zenModsPath, { recursive: true });
                IOUtils.remove(PathUtils.join(Sine.chromeDir, "zen-themes.css"));
                IOUtils.remove(gZenMods.modsDataFile);
            }
        } catch (err) {
            console.warn("Error copying Zen mods: " + err);
            if (String(err).includes("NS_ERROR_FILE_DIR_NOT_EMPTY")) {
                Sine.showToast("Error copying Zen mods: Attempted to add a mod that already exists.");
            } else {
                Sine.showToast("Error copying Zen mods: Check Ctrl+Shift+J for more info.", "warning", false);
            }
        }
        delete window.gZenMods;
    }

    Sine.manager.rebuildMods();

    // Window listener to handle newly created windows (including PiP)
    const windowListener = {
        onOpenWindow: (xulWindow) => {
            const domWindow = xulWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                .getInterface(Ci.nsIDOMWindow);

            const loadHandler = () => {
                // Remove the event listener to prevent memory leaks
                domWindow.removeEventListener("load", loadHandler);

                if (Sine.cssURI) {
                    try {
                        const windowUtils = domWindow.windowUtils ||
                            domWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                            .getInterface(Ci.nsIDOMWindowUtils);

                        // Apply chrome CSS to new window
                        windowUtils.loadSheet(Sine.cssURI, windowUtils.USER_SHEET);
                        console.log("Applied chrome CSS to new window");
                    } catch (ex) {
                        console.warn("Failed to apply CSS to new window:", ex);
                    }
                }
            }

            // Wait for window to be fully loaded
            domWindow.addEventListener("load", loadHandler);
        },
    };

    // Register the window listener
    const windowMediator = Cc["@mozilla.org/appshell/window-mediator;1"]
        .getService(Ci.nsIWindowMediator);
    
    windowMediator.addListener(windowListener);
    
    // Clean up on shutdown
    window.addEventListener("beforeunload", () => {
        windowMediator.removeListener(windowListener);
    });

    const initWindow = Sine.initWindow();
    initDev(Sine);

    injectAPI();
    
    const fetchFunc = async () => {
        const action = UC_API.Prefs.get("sine.fetch-url").value;
        if (action.match(/^(q-)?fetch:/)) {
            const fetchId = action.replace(/^(q-)?fetch:/, "");
            const url = fetchId.replace(/-[0-9]+$/, "");
            const response = await fetch(url).then(res => res.text()).catch(err => console.warn(err));
            const fetchResults = await UC_API.SharedStorage.widgetCallbacks.get("fetch-results");
            fetchResults[fetchId] = response;
            await UC_API.SharedStorage.widgetCallbacks.set("fetch-results", fetchResults);
            UC_API.Prefs.set("sine.fetch-url", `done:${fetchId}`);
        }
    }
    UC_API.Prefs.set("sine.fetch-url", "none");
    await UC_API.SharedStorage.widgetCallbacks.set("fetch-results", {});
    UC_API.Prefs.addListener("sine.fetch-url", fetchFunc);

    import("chrome://userscripts/content/engine/css/main.js");

    await initWindow;
} else {
    Sine.init();
}
