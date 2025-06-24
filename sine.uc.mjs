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
import { defineMarked, markedStyles } from "chrome://userscripts/content/engine/marked.js";

// Imports to execute at script startup.
import("chrome://userscripts/content/engine/prefs.js");
defineMarked();

const isCosine = UC_API.Prefs.get("sine.is-cosine").value;
console.log(`${isCosine ? "Cosine" : "Sine"} is active!`);

const Sine = {
    mainProcess: document.location.pathname === "/content/browser.xhtml",
    versionBrand: isCosine ? "Cosine" : "Sine",
    engineURL: isCosine ? "https://raw.githubusercontent.com/CosmoCreeper/Sine/cosine/data/engine.json" : "https://cosmocreeper.github.io/Sine/data/engine.json",
    get marketURL() {
        const defaultURL = "https://cosmocreeper.github.io/Sine/data/marketplace.json";
        if (UC_API.Prefs.get("sine.allow-external-marketplace").value) {
            return UC_API.Prefs.get("sine.marketplace-url").value || defaultURL;
        } else {
            return defaultURL;
        }
    },
    updatedAt: "2025-06-24 13:00",

    showToast(label="Unknown", priority="warning", restart=true) {
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
        const chromeDir = UC_API.FileSystem.chromeDir().fileURI.replace("file:///", "").replace(/%20/g, " ");
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
                const globalDoc = windowRoot.ownerGlobal.document;
                globalDoc.querySelectorAll(".sine-theme-strings, .sine-theme-styles").forEach(el => el.remove());

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
                                const importPath = `@import "${UC_API.FileSystem.chromeDir().fileURI}sine-mods/${id}/${file}.css";\n`;
                            
                                if (style === "chrome") chromeData += importPath;
                                else contentData += importPath;
                            }
                        }

                        if (mod.preferences) {
                            const modPrefs = await Sine.utils.getModPreferences(mod);

                            const rootPrefs = Object.values(modPrefs).filter(pref =>
                                pref.type === "dropdown" || (pref.type === "string" && pref.processAs && pref.processAs === "root")
                            );
                            if (rootPrefs.length) {
                                const themeSelector = "theme-" + mod.name.replace(/\s/g, "-");

                                const themeEl = globalDoc.createElement("div");
                                themeEl.id = themeSelector;
                                themeEl.className = "sine-theme-strings";

                                for (const pref of rootPrefs) {
                                    if (UC_API.Prefs.get(pref.property).exists()) {
                                        const prefName = pref.property.replace(/\./g, "-");
                                        themeEl.setAttribute(prefName, UC_API.Prefs.get(pref.property).value);
                                    }
                                }

                                globalDoc.body.appendChild(themeEl);
                            }

                            const varPrefs = Object.values(modPrefs).filter(pref =>
                                (pref.type === "dropdown" && pref.processAs && pref.processAs.includes("var")) || pref.type === "string"
                            );
                            if (varPrefs.length) {
                                const themeSelector = "theme-" + mod.name.replace(/\s/g, "-") + "-style";
                                const themeEl = globalDoc.createElement("style");
                                themeEl.id = themeSelector;
                                themeEl.className = "sine-theme-styles";
                                themeEl.textContent = ":root {";

                                for (const pref of varPrefs) {
                                    if (UC_API.Prefs.get(pref.property).exists()) {
                                        const prefName = pref.property.replace(/\./g, "-");
                                        themeEl.textContent += `--${prefName}: ${UC_API.Prefs.get(pref.property).value};`;
                                    }
                                }

                                themeEl.textContent += "}";
                                globalDoc.head.appendChild(themeEl);
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

            // Get chrome directory
            const chromeDir = ds.get("UChrm", Ci.nsIFile);

            const stylesheets = ["chrome", "content"];
            for (const stylesheet of stylesheets) {
                try {
                    const stylePath = chromeDir.clone();
                    stylePath.append("sine-mods");
                    stylePath.append(`${stylesheet}.css`);

                    if (stylePath.exists()) {
                        const styleURI = io.newFileURI(stylePath);

                        if (stylesheet === "chrome") {
                            const windowUtils = windowRoot.ownerGlobal.windowUtils || windowRoot.ownerGlobal.QueryInterface(Ci.nsIInterfaceRequestor)
                                .getInterface(Ci.nsIDOMWindowUtils);

                            // Unregister existing sheet if it exists.
                            try {
                                windowUtils.removeSheet(styleURI, windowUtils.USER_SHEET);
                            } catch {}

                            // Load the sheet.
                            if (stylesheetData.chrome) {
                                windowUtils.loadSheet(styleURI, windowUtils.USER_SHEET);
                            }
                        } else {
                            // Unregister existing sheets if they exist.
                            if (ss.sheetRegistered(styleURI, ss.USER_SHEET)) {
                                ss.unregisterSheet(styleURI, ss.USER_SHEET);
                            }
                            if (ss.sheetRegistered(styleURI, ss.AUTHOR_SHEET)) {
                                ss.unregisterSheet(styleURI, ss.AUTHOR_SHEET);
                            }
                        
                            // Register the sheet.
                            if (stylesheetData.content) {
                                ss.loadAndRegisterSheet(styleURI, ss.USER_SHEET);
                            }
                        }
                    }
                } catch (err) {
                    console.warn(`Failed to reload ${stylesheet}.css: `, err);
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
            // Directly specify your Windows path
            const scriptDir = Cc["@mozilla.org/file/local;1"]
                .createInstance(Ci.nsIFile);
            scriptDir.initWithPath(this.jsDir);
        
            // Make sure the directory exists
            if (!scriptDir.exists()) {
                console.error("Script directory doesn't exist: " + scriptDir.path);
                return;
            }
        
            async function downloadAndExtractZip(url) {
                try {
                    // Download to your specified directory
                    const targetFile = scriptDir.clone();
                    targetFile.append("engine.zip");
                
                    const download = await Downloads.createDownload({
                        source: url,
                        target: targetFile.path
                    });
                
                    await download.start();
                
                    // Extract in the same directory
                    const zipReader = Cc["@mozilla.org/libjar/zip-reader;1"]
                      .createInstance(Ci.nsIZipReader);
                
                    zipReader.open(targetFile);
                
                    const extractDir = scriptDir.clone();
                
                    if (!extractDir.exists()) {
                        extractDir.create(Ci.nsIFile.DIRECTORY_TYPE, -1); // FIXED
                    }
                
                    // Extract all files
                    const entries = zipReader.findEntries("*");
                    let extractedCount = 0; // CHANGED from const to let
                
                    while (entries.hasMore()) {
                        const entryName = entries.getNext();
                        const destFile = extractDir.clone();
                    
                        const pathParts = entryName.split('/');
                        for (const part of pathParts) {
                            if (part) {
                                destFile.append(part);
                            }
                        }
                    
                        if (destFile.parent && !destFile.parent.exists()) {
                            destFile.parent.create(Ci.nsIFile.DIRECTORY_TYPE, -1); // FIXED
                        }
                    
                        if (!entryName.endsWith('/')) {
                            zipReader.extract(entryName, destFile);
                            extractedCount++; // This now works since it's let
                        }
                    }
                
                    zipReader.close();

                    // Optionally delete the zip file after extraction
                    targetFile.remove(false);
                
                    return extractDir;
                } catch (error) {
                    console.error("Download/Extract error: " + error);
                    throw error;
                }
            }

            await downloadAndExtractZip(engine.package);
        }
    },

    async initWindow() {
        this.updateMods("auto");
        if (UC_API.Prefs.get("sine.script.auto-update").value) {
            await this.updateEngine();
        }
    },

    initDev() {
        if (UC_API.Prefs.get("sine.enable-dev").value) {
            const palette = appendXUL(document.body, `
                <div class="sineCommandPalette" hidden="">
                    <div class="sineCommandInput" hidden=""></div>
                    <div class="sineCommandSearch">
                        <input type="text" placeholder="Enter a command..."/>
                        <hr/>
                        <div></div>
                    </div>
                </div>
            `);

            const contentDiv = palette.querySelector(".sineCommandInput");
            const searchDiv = palette.querySelector(".sineCommandSearch");
            const input = searchDiv.querySelector("input");
            const optionsContainer = searchDiv.querySelector("div");

            const options = [
                {
                    "label": "Refresh mod styles",
                    "action": () => Sine.manager.rebuildMods()
                },
            ];

            const searchOptions = () => {
                for (const child of optionsContainer.children) {
                    if (!child.textContent.toLowerCase().includes(input.value.toLowerCase())) {
                        child.setAttribute("hidden", "");
                    } else {
                        child.removeAttribute("hidden");
                    }
                }
                optionsContainer.querySelector("[selected]")?.removeAttribute("selected");
                optionsContainer.querySelector(":not([hidden])").setAttribute("selected", "");
            }

            const closePalette = () => {
                palette.setAttribute("hidden", "");
                input.value = "";
                searchOptions();
            }

            for (const option of options) {
                const optionBtn = appendXUL(optionsContainer, `<button>${option.label}</button>`);

                optionBtn.addEventListener("click", () => {
                    option.action();
                    if (!option.hasOwnProperty("hide") || option.hide)
                        closePalette();
                });
            }

            optionsContainer.children[0].setAttribute("selected", "");

            input.addEventListener("input", searchOptions);
            input.addEventListener("keydown", (e) => {
                const selectedChild = optionsContainer.querySelector(":not([hidden])[selected]");
                if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                    let newSelectedChild;
                    if (e.key === "ArrowUp") {
                        newSelectedChild = selectedChild.previousElementSibling || selectedChild.parentElement.lastElementChild;
                    } else {
                        newSelectedChild = selectedChild.nextElementSibling || selectedChild.parentElement.firstElementChild;
                    }
                    newSelectedChild.setAttribute("selected", "");
                    selectedChild.removeAttribute("selected");
                } else if (e.key === "Enter") {
                    selectedChild.click();
                }
            });

            document.addEventListener("keydown", (e) => {
                if (e.ctrlKey && e.shiftKey && e.key === "Y") {
                    palette.removeAttribute("hidden");
                    contentDiv.setAttribute("hidden", "");
                    searchDiv.removeAttribute("hidden");

                    // Wait animation time.
                    setTimeout(() => input.focus(), 350);
                } else if (e.key === "Escape") {
                    closePalette();
                }
            });

            document.addEventListener("mousedown", (e) => {
                let targetEl = e.target;
                while (targetEl) {
                    if (targetEl === palette) return;
                    targetEl = targetEl.parentNode;
                }

                closePalette();
            });
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
                if (branchParts[1].endsWith("/")) branchParts[1].substring(0, branchParts[1].length - 1);
                else folder = branchParts[1];
            }
        } else {
            branch = "main"; // Default branch if not specified
            // If there is no folder, use the whole repo name
            if (repo.endsWith("/")) repoName = repo.substring(0, repo.length - 1);
            else repoName = repo;
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
            this.showToast(`A mod utilizing JS has been ${remove ? "disabled" : "enabled"}. For usage of it to be fully restored, restart your browser.`);
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
        if (pref.disabledOn && pref.disabledOn.some(os => os.includes(this.os))) return;

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

        if (pref.property) prefEl.id = pref.property.replace(/\./g, "-");
        if (pref.label) pref.label = this.formatMD(pref.label);
        if (pref.property && pref.type !== "separator") prefEl.title = pref.property;
        if (pref.hasOwnProperty("margin")) prefEl.style.margin = pref.margin;
        if (pref.hasOwnProperty("size")) prefEl.style.fontSize = pref.size;

        if ((pref.type === "string" || pref.type === "dropdown") && pref.hasOwnProperty("label")) {
            appendXUL(prefEl, `<label class="sineItemPreferenceLabel">${pref.label}</label>`);
        }

        const showRestartPrefToast = () =>
            this.showToast("You changed a preference that requires a browser restart to take effect. For it to function properly, please restart.", "warning");

        if (pref.type === "separator") {
            prefEl.innerHTML += `<hr style="${pref.hasOwnProperty("height") ? `border-width: ${pref.height};` : ""}"></hr>`;
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
            const menulist = document.createXULElement("menulist");
            const menupopup = document.createXULElement("menupopup");
            menupopup.className = "in-menulist";
            const defaultMatch = pref.options.find(item => item.value === pref.defaultValue || item.value === pref.default);
            if (pref.placeholder !== false) {
                menulist.setAttribute("label", pref.placeholder ?? "None");
                menulist.setAttribute("value", defaultMatch ? "none" : pref.defaultValue ?? pref.default ?? "none");
                const menuitem = document.createXULElement("menuitem");
                menuitem.setAttribute("value", defaultMatch ? "none" : pref.defaultValue ?? pref.default ?? "none");
                menuitem.setAttribute("label", pref.placeholder ?? "None");
                menuitem.textContent = pref.placeholder ?? "None";
                menupopup.appendChild(menuitem);
            }
            const placeholderSelected = UC_API.Prefs.get(pref.property).value === "" || UC_API.Prefs.get(pref.property).value === "none";
            const hasDefaultValue = pref.hasOwnProperty("defaultValue") || pref.hasOwnProperty("default");
            if (UC_API.Prefs.get(pref.property).exists() && (!pref.force || !hasDefaultValue || UC_API.Prefs.get(pref.property).hasUserValue()) && !placeholderSelected) {
                const value = UC_API.Prefs.get(pref.property).value;
                menulist.setAttribute("label", pref.options.find(item => item.value === value)?.label ?? pref.placeholder ?? "None");
                menulist.setAttribute("value", value);
            } else if (hasDefaultValue && !placeholderSelected) {
                menulist.setAttribute("label", pref.options.find(item => item.value === pref.defaultValue || item.value === pref.default)?.label ?? pref.placeholder ?? "None");
                menulist.setAttribute("value", pref.defaultValue ?? pref.default);
                UC_API.Prefs.set(pref.property, pref.defaultValue ?? pref.default);
            } else if (pref.options.length >= 1 && !placeholderSelected) {
                menulist.setAttribute("label", pref.options[0].label);
                menulist.setAttribute("value", pref.options[0].value);
                UC_API.Prefs.set(pref.property, pref.options[0].value);
            }
            
            pref.options.forEach((option) => {
                const menuitem = document.createXULElement("menuitem");
                menuitem.setAttribute("label", option.label);
                menuitem.setAttribute("value", option.value);
                menuitem.textContent = option.label;
                menupopup.appendChild(menuitem);
            });
            menulist.addEventListener("command", () => {
                let value = menulist.getAttribute("value");
                if (pref.value === "number" || pref.value === "num") value = Number(value);
                else if (pref.value === "boolean" || pref.value === "bool") value = Boolean(value);
                UC_API.Prefs.set(pref.property, value);
                if (pref.restart) showRestartPrefToast();
                this.manager.rebuildMods();
            });
            menulist.appendChild(menupopup);
            prefEl.appendChild(menulist);
        } else if (pref.type === "text" && pref.hasOwnProperty("label")) {
            prefEl.innerHTML = pref.label;
        } else if (pref.type === "string") {
            const input = document.createElement("input");
            input.type = "text";
            input.placeholder = pref.placeholder ?? "Type something...";
            const hasDefaultValue = pref.hasOwnProperty("defaultValue") || pref.hasOwnProperty("default");
            if (UC_API.Prefs.get(pref.property).exists() && (!pref.force || !hasDefaultValue || UC_API.Prefs.get(pref.property).hasUserValue()))
                input.value = UC_API.Prefs.get(pref.property).value;
            else {
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

        if (((pref.type === "separator" && pref.hasOwnProperty("label")) || pref.type === "checkbox") && pref.hasOwnProperty("property")) {
            const clickable = pref.type === "checkbox" ? prefEl : prefEl.children[1];
            if ((pref.defaultValue ?? pref.default) && !UC_API.Prefs.get(pref.property).exists()) UC_API.Prefs.set(pref.property, true);
            if (UC_API.Prefs.get(pref.property).value) clickable.setAttribute("checked", true);
            if (pref.type === "checkbox" && clickable.getAttribute("checked")) clickable.children[0].checked = true;
            clickable.addEventListener("click", (e) => {
                UC_API.Prefs.set(pref.property, e.currentTarget.getAttribute("checked") ? false : true);
                if (pref.type === "checkbox" && e.target.type !== "checkbox") clickable.children[0].checked = e.currentTarget.getAttribute("checked") ? false : true;
                e.currentTarget.getAttribute("checked") ? e.currentTarget.removeAttribute("checked") : e.currentTarget.setAttribute("checked", true);
                if (pref.restart) showRestartPrefToast();
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
    
            const observer = new MutationObserver(mutations => {
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
        if (isBoolean) return isNot ? `:has(#${propertySelector}:not([checked])` : `:has(#${propertySelector}[checked])`;
        else return isNot ? `:not(:has(#${propertySelector} > *[value="${cond.value}"]))` : `:has(#${propertySelector} > *[value="${cond.value}"])`;
    },

    generateSelector(conditions, operator, id) {
        const condArray = Array.isArray(conditions) ? conditions : [conditions];
        if (condArray.length === 0) return "";
        const selectors = condArray.map(cond => {
            if (cond.if) return this.generateSingleSelector(cond.if, false);
            else if (cond.not) return this.generateSingleSelector(cond.not, true);
            else if (cond.conditions) return this.generateSelector(cond.conditions, cond.operator || "AND");
            else throw new Error("Invalid condition");
        }).filter(s => s);
        if (selectors.length === 0) return "";
        if (operator === "OR") return selectors.map(s => `dialog[open] .sineItemPreferenceDialogContent${s} #${id}`).join(", ");
        else return `dialog[open] .sineItemPreferenceDialogContent${selectors.join("")} #${id}`;
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
                                    title="${modData.enabled ? "Disable" : "Enable"} mod" ${modData.enabled ? 'pressed=""' : ""}/>
                            </hbox>
                            <description class="description-deemphasized sineItemDescription">
                                ${modData.description}
                            </description>
                        </vbox>
                        <hbox class="sineItemActions">
                            ${modData.preferences ? `
                                <button class="sineItemConfigureButton" title="Open settings"></button>
                            ` : ""}
                            <button class="sineItemHomepageButton" title="Visit homepage">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="context-fill" fill-opacity="context-fill-opacity"><path d="M14.817 7.507 8.852 1.542a1.918 1.918 0 0 0-2.703 0L.183 7.507A.618.618 0 0 0 1 8.436L1 14a2 2 0 0 0 2 2l9 0a2 2 0 0 0 2-2l0-5.564a.62.62 0 0 0 .375.139.626.626 0 0 0 .442-1.068zM8.75 14.75l-2.5 0 0-4 .5-.5 1.5 0 .5.5 0 4zm4-.581-.6.581-2.15 0L10 11a2 2 0 0 0-2-2L7 9a2 2 0 0 0-2 2l0 3.75-2.15 0-.6-.581-.001-6.96 4.783-4.783a.663.663 0 0 1 .936 0L12.75 7.21l0 6.959z"/></svg>
                            </button>
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
                            for (const file of modData["editable-files"].find(item => item.directory === "js").contents) {
                                const jsPath = PathUtils.join(this.jsDir, `${modData.id}_${modData.enabled ? file : file.replace(/[a-z]+\.m?js$/, "db")}`);
                                jsPromises.push(IOUtils.remove(jsPath));
                            }
                        }

                        await this.manager.removeMod(modData.id);
                        this.loadPage();
                        this.manager.rebuildMods();
                        item.remove();
                        if (modData.hasOwnProperty("js")) {
                            await Promise.all(jsPromises);
                            this.showToast("A mod utilizing JS has been removed. For usage of it to be fully halted, restart your browser.");
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
            const hasNestedDirs = items.some(item => typeof item === 'string' && item.includes("/"));

            if (hasNestedDirs) {
                // Recursively build nested structure
                const nestedPaths = items.filter(item => typeof item === 'string' && item.includes("/"));
                const directFiles = items.filter(item => typeof item === 'string' && !item.includes("/"));

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
            if (!this.doesPathGoBehind(currentPath, importPath) && regexArray.every(regex => !importPath.startsWith(regex))) {
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
                        await IOUtils.writeUTF8(themeFolder + (this.os.includes("win") ? "\\" + resolvedPath.replace(/\//g, "\\") : resolvedPath), importedCss);
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
        // TODO: Assess the ability to utilize concurrent tasks in here.
        // TODO: Will this work with promises and using concurrent tasks for file removal?
        for (const file of oldFiles) {
            if (typeof file === "string") {
                if (isRoot && file === "js") {
                    const jsDirPath = this.jsDir;
                    const oldJsFiles = Array.isArray(file.contents) ? file.contents : [];
                    const newJsFiles = newFiles.find(f => typeof f === "object" && f.directory === "js")?.contents || [];

                    for (const oldJsFile of oldJsFiles) {
                        if (typeof oldJsFile === "string") {
                            const actualFileName = `${newThemeData.id}_${oldJsFile}`;
                            const finalFileName = newThemeData.enabled
                                ? actualFileName
                                : actualFileName.replace(/[a-z]+\.m?js$/g, "db");
                            if (!newJsFiles.includes(oldJsFile)) {
                                const filePath = PathUtils.join(jsDirPath, finalFileName);
                                await IOUtils.remove(filePath);
                            }
                        }
                    }
                } else if (!newFiles.some(f => typeof f === "string" && f === file)) {
                    const filePath = PathUtils.join(themeFolder, file);
                    await IOUtils.remove(filePath);
                }
            } else if (typeof file === "object" && file.directory && file.contents) {
                if (isRoot && file.directory === "js") {
                    const jsDirPath = this.jsDir;
                    const oldJsFiles = Array.isArray(file.contents) ? file.contents : [];
                    const newJsFiles = newFiles.find(f => typeof f === "object" && f.directory === "js")?.contents || [];

                    for (const oldJsFile of oldJsFiles) {
                        if (typeof oldJsFile === "string") {
                            const actualFileName = `${newThemeData.id}_${oldJsFile}`;
                            const finalFileName = newThemeData.enabled
                                ? actualFileName
                                : actualFileName.replace(/[a-z]+\.m?js$/g, "db");
                            if (!newJsFiles.includes(oldJsFile)) {
                                const filePath = PathUtils.join(jsDirPath, finalFileName);
                                await IOUtils.remove(filePath);
                            }
                        }
                    }
                } else {
                    const matchingDir = newFiles.find(f => 
                        typeof f === "object" && f.directory === file.directory
                    );

                    if (!matchingDir) {
                        const dirPath = PathUtils.join(themeFolder, file.directory);
                        await IOUtils.remove(dirPath, { recursive: true });
                    } else {
                        const newDirPath = PathUtils.join(themeFolder, file.directory);
                        await this.removeOldFiles(newDirPath, file.contents, matchingDir.contents, newThemeData, false);
                    }
                }
            }
        }
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
                        const fileContents = await this.processRootCSS(file, newThemeData.style[formattedFile], themeFolder)
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
                await setProperty("style", `${repoRoot}chrome.css`, true);
                if (!theme.hasOwnProperty("style")) {
                    theme.style = {};
                    setProperty("style", `${repoRoot}userChrome.css`, true, "chrome", true);
                    setProperty("style", `${repoRoot}userContent.css`, true, "content", true);
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
                    setProperty("version", releasesData.hasOwnProperty("tag_name") ? releasesData.tag_name.toLowerCase().replace("v", "") : "1.0.0");
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
                            await IOUtils.writeUTF8(PathUtils.join(this.jsDir, newThemeData.id + "_" + fileName), fileContents);
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
            const dirLink = `https://api.github.com/repos/CosmoCreeper/Sine/contents/data/mods/${newThemeData.id}`;
            const newFiles = await this.fetch(dirLink).then(res => Object.values(res)).catch(err => console.warn(err));
            for (const file of newFiles) {
                promises.push((async () => {
                    const fileContents = await this.fetch(file.download_url).catch(err => console.error(err));
                    if (typeof fileContents === "string" && fileContents.toLowerCase() !== "404: not found") {
                        await IOUtils.writeUTF8(PathUtils.join(this.jsDir, newThemeData.id + "_" + file.name), fileContents);
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
                if (typeof newThemeData.preferences === "array") newPrefData = newThemeData.preferences;
                else newPrefData = await this.fetch(newThemeData.preferences, true).catch(err => console.error(err));
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
        if (currModData && currModData.hasOwnProperty("editable-files") && newThemeData.hasOwnProperty("editable-files"))
            await this.removeOldFiles(themeFolder, currModData["editable-files"], newThemeData["editable-files"], newThemeData);

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
            .then(async res => await this.createThemeJSON(repo, currThemeData, typeof res !== "object" ? {} : res));
        if (typeof newThemeData.style === "object" && Object.keys(newThemeData.style).length === 0) delete newThemeData.style;
        if (newThemeData) {
            await this.syncModData(currThemeData, newThemeData);

            if (reload) {
                this.manager.rebuildMods();
                this.loadMods();
            }

            if (newThemeData.hasOwnProperty("js"))
                this.showToast("A mod utilizing JS has been installed. For it to work properly, restart your browser.");
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
                        const minimalData = await this.createThemeJSON(currModData.homepage, currThemeData, typeof originalData !== "object" ? {} : originalData, true);
                        newThemeData = minimalData["theme"];
                        githubAPI = minimalData["githubAPI"];
                    } else
                        newThemeData = await this.fetch(`https://raw.githubusercontent.com/zen-browser/theme-store/main/themes/${currModData.id}/theme.json`);

                    if (newThemeData && typeof newThemeData === "object" && new Date(currModData.updatedAt) < new Date(newThemeData.updatedAt)) {
                        changeMade = true;
                        console.log("Auto-updating: " + currModData.name + "!");
                        if (currModData.homepage) {
                            let customData = await this.createThemeJSON(currModData.homepage, currThemeData, typeof newThemeData !== "object" ? {} : newThemeData, false, githubAPI);
                            if (currModData.hasOwnProperty("version") && customData.version === "1.0.0") customData.version = currModData.version;
                            customData.id = currModData.id;
                            if (typeof newThemeData.style === "object" && Object.keys(newThemeData.style).length === 0) delete newThemeData.style; 

                            const toAdd = ["style", "readme", "preferences", "image"];
                            for (const property of toAdd) {
                                if (!customData.hasOwnProperty(property) && currModData.hasOwnProperty(property))
                                    customData[property] = currModData[property];
                            }

                            const toReplace = ["name", "description"];
                            for (const property of toReplace) {
                                if (((typeof originalData !== "object" && originalData.toLowerCase() === "404: not found") || !originalData[property]) && currModData[property])
                                    customData[property] = currModData[property];
                            }

                            newThemeData = customData;
                        }
                        changeMadeHasJS = await this.syncModData(currThemeData, newThemeData, currModData);
                    }
                }
            }
            if (changeMadeHasJS) this.showToast("A mod utilizing JS has been updated. For it to work properly, restart your browser.");
            if (changeMade) {
                this.manager.rebuildMods();
                this.loadMods();
            }
            return changeMade;
        }
    },

    applySiteStyles() {
        appendXUL(document.head, `
            <style>
                #category-sine-mods .category-icon {
                    list-style-image: url("chrome://userscripts/content/engine/assets/saturn.svg");
                }
                groupbox:popover-open .description-deemphasized:nth-of-type(2), groupbox:popover-open #sineInstallationCustom,
                #sineInstallationHeader button, .sineInstallationItem > img, .auto-update-toggle[enabled] + .manual-update {
                    display: none;
                }
                #sineInstallationGroup {
                    margin-bottom: 7px !important;
                }
                #sineInstallationGroup input:focus {
                    border-color: transparent;
                    box-shadow: 0 0 0 2px var(--button-background-color-primary-active);
                    outline: var(--focus-outline);
                    outline-offset: var(--focus-outline-inset);
                }
                #sineInstallationHeader {
                    display: flex;
                    justify-content: space-between;
                }
                #sineInstallationGroup, #sineInstalledGroup {
                    border-radius: 5px;
                }
                #sineInstallationList {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, 192px);
                    gap: 7px !important;
                    margin-top: 17px;
                    max-height: 400px;
                    overflow-y: auto;
                    overflow-x: hidden;
                    margin-bottom: 5px;
                    width: 100%;
                    box-sizing: border-box;
                    padding: 4px;
                }
                .sineInstallationItem {
                    display: flex !important;
                    flex-direction: column;
                    border-radius: 5px !important;
                    padding: 15px !important;
                    background-color: rgba(255, 255, 255, 0.04) !important;
                    box-shadow: 0 0 5px rgba(0, 0, 0, 0.2) !important;
                    min-height: 200px;
                    position: relative;
                    width: 100%;
                    box-sizing: border-box;
                }
                .sineInstallationItem[hidden], .sineInstallationItem[installed] {
                    display: none !important;
                }
                .sineMarketplaceItemDescription {
                    padding-bottom: 10px;
                }
                .sineMarketplaceButtonContainer {
                    display: flex !important;
                    margin-top: auto;
                    height: 43px;
                }
                .sineMarketplaceOpenButton, .sineItemConfigureButton, .auto-update-toggle {
                    background-repeat: no-repeat;
                    background-size: 50%;
                    background-position: center;
                }
                #sineMarketplaceRefreshButton {
                    background-image: url("chrome://userscripts/content/engine/assets/refresh.svg");
                    background-size: 100%;
                }
                .sineMarketplaceButtonContainer .sineMarketplaceOpenButton {
                    background-image: url("chrome://userscripts/content/engine/assets/markdown.svg");
                }
                .sineItemConfigureButton {
                    background-image: url("chrome://userscripts/content/engine/assets/settings.svg");
                }
                #sineInstallationCustom .sineMarketplaceOpenButton:not(.sineItemConfigureButton) {
                    background-image: url("chrome://userscripts/content/engine/assets/expand.svg");
                }
                .sineMarketplaceOpenButton {
                    display: inline-flex !important;
                    width: 25%;
                    align-items: center;
                    justify-content: center;
                    font-size: 0;
                    min-width: 36px;
                }
                .sineMarketplaceOpenButton svg {
                    width: 50%;
                    height: 50%;
                }
                #sineInstallationCustom .sineMarketplaceOpenButton {
                    width: 37px;
                }
                #sineInstallationCustom .sineItemConfigureButton {
                    margin-left: auto;
                }
                .sineMarketplaceItemButton {
                    background-color: var(--color-accent-primary) !important;
                    color: black !important;
                    width: 100%;
                }
                #sineInstallationCustom {
                    margin-top: 8px;
                    display: flex;
                }
                #sineInstallationCustom .sineMarketplaceItemButton {
                    width: unset;
                    margin-left: 0;
                }
                #sineInstallationCustom>*:not(dialog) {
                    box-sizing: border-box;
                    height: 37px;
                }
                #sineInstallationCustom input {
                    margin-left: 0;
                    margin-right: 6px;
                    margin-top: 4px;
                }
                #sineInstalledHeader {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                #sineInstalledHeader h2 {
                    margin: 0;
                }
                .sineItemTitle {
                    margin: 0;
                }
                dialog::backdrop, #sineInstallationGroup:popover-open::backdrop {
                    background: rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(3px);
                }
                dialog {
                    border-radius: 5px;
                    max-height: 96vh;
                    max-width: 96vw;
                    animation: dialogPopin 0.3s ease-out;
                    overflow-y: scroll;
                    overflow-x: hidden;
                    display: none !important;
                    padding: 20px !important;
                    box-sizing: border-box;
                    width: max-content !important;
                    min-width: 60vw;
                }
                dialog[open] {
                    display: block !important;
                    cursor: default !important;
                }
                .sineItemPreferenceDialogTopBar {
                    display: flex;
                    align-items: center;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.3);
                    padding-bottom: 7px;
                    margin-bottom: 7px;
                }
                .sineItemPreferenceDialogTopBar button {
                    margin-left: auto;
                }
                .sineItemPreferenceDialogContent {
                    display: block;
                    max-width: calc(96vw - 40px);
                    width: max-content;
                    min-width: 100%;
                }
                .sineItemPreferenceCheckbox {
                    margin: var(--space-small) 0;
                    margin-right: 10px;
                    padding-inline-start: 0;
                    align-items: center;
                    display: flex;
                }
                .sineItemPreferenceDialogContent div:has(hr) {
                    position: relative;
                }
                .sineItemPreferenceDialogContent div:has(hr) * {
                    transition: all 150ms ease;
                }
                .sineItemPreferenceDialogContent div hr:has(+ .separator-label[title]:not([checked])) {
                    opacity: 0.5;
                }
                .separator-label {
                    position: absolute;
                    top: 50%;
                    margin-left: 14px;
                    background: var(--arrowpanel-background);
                    padding: 0 6px 0 5px;
                    transform: translateY(-60%);
                }
                .separator-label[title]:not([checked]), .separator-label[title][checked]:hover, .separator-label:not([title]) {
                    color: rgba(255, 255, 255, 0.5);
                }
                .separator-label[title]:not([checked]):hover {
                    color: white;
                }
                svg {
                    fill: white;
                }
                #sineMarketplaceRefreshButton {
                    margin: 0 0 0 6px !important;
                }
                #sineMarketplaceRefreshButton, #sineMarketplaceRefreshButton svg {
                    height: 37px !important;
                    width: 37px !important;
                }
                #sineInstallationGroup:popover-open {
                    position: fixed !important;
                    left: 50% !important;
                    top: 50% !important;
                    translate: -50% -50% !important;
                }
                #sineInstallationGroup:popover-open {
                    border: 0;
                    background: var(--arrowpanel-background) !important;
                    width: 80vw;
                    max-height: 96vh;
                    animation: dialogPopin 0.3s ease-out;

                    #sineInstallationHeader button {
                        display: block;
                    }
                    #sineInstallationHeader button {
                        margin: 0 !important;
                    }
                    #sineInstallationHeader #sineMarketplaceRefreshButton {
                        margin: 0 6px 0 6px !important;
                    }
                    .sineInstallationItem {
                        min-height: 400px;
                    }
                    #sineInstallationList {
                        max-height: 80vh;
                        overflow-y: scroll;
                        grid-template-columns: repeat(auto-fit, 364px);
                    }
                    .sineInstallationItem > img {
                        display: block;
                        border-radius: 5px;
                        box-shadow: 0 0 3px rgba(255, 255, 255, 0.03);
                        height: auto;
                        object-fit: contain;
                        width: 100%;
                        max-height: 40vh;
                        cursor: zoom-in;
                        transition: transform 400ms ease;
                    }
                    .sineInstallationItem > img:not([zoomed]):hover {
                        transform: scale(1.09);
                    }
                    .sineInstallationItem > img[zoomed] {
                        transition: width 400ms ease, height 400ms ease;
                        max-height: unset;
                        position: fixed;
                        width: calc(100% - 40px);
                        transform: translate(-50%, -50%);
                        left: 50%;
                        top: 50%;
                        cursor: zoom-out;
                        z-index: 220;
                    }
                    .sineInstallationItem:has(> img[zoomed])::before {
                        content: "";
                        position: fixed;
                        width: 100%;
                        height: 100%;
                        backdrop-filter: blur(5px);
                        z-index: 200;
                        top: 0;
                        left: 0;
                    }
                }
                #navigation-container {
                    display: flex;
                    justify-content: center !important;
                }
                #sineInstallationGroup:not(:popover-open) #navigation-container {
                    margin-bottom: 8px;
                }
                #sineInstalledGroup .indent {
                    margin: 0 !important;
                    height: fit-content !important;
                    display: flex;
                }
                #sineInstalledGroup description {
                    display: block;
                }
                .transfer-container, .sineItemPreferenceDialogTopBar button {
                    margin-left: auto;
                }
                .updates-container, .transfer-container {
                    display: inline-flex;
                    margin-bottom: 10px;
                }
                .updates-container * {
                    height: 34.833px;
                }
                .auto-update-toggle, .manual-update {
                    cursor: pointer;
                }
                .manual-update {
                    height: fit-content;
                    min-height: fit-content;
                }
                .updates-container .auto-update-toggle {
                    margin-left: 0;
                    margin-right: 0;
                    min-width: 0;
                    padding: 0;
                    width: 34.83px;
                    height: 34.83px;
                    color: white !important;
                    display: flex;
                    align-items: center;
                    box-sizing: border-box;

                    &::before {
                        background-image: url("chrome://userscripts/content/engine/assets/update.svg");
                        width: 34.83px;
                    }

                    span {
                        display: none;
                        align-items: center;
                    }
                }
                .sineItemActions .auto-update-toggle {
                    min-width: 0;
                    width: 32px;
                    height: 32px;
                    padding: 0;

                    &::before {
                        background-image: url("chrome://userscripts/content/engine/assets/update-disabled.svg");
                    }
                }
                .auto-update-toggle::before {
                    content: "";
                    display: block;
                    width: 100%;
                    height: 100%;
                }
                .auto-update-toggle[enabled] {
                    background-color: var(--color-accent-primary) !important;
                    color: black !important;

                    &::before {
                        filter: invert(1);
                    }

                    & span {
                        display: flex;
                    }
                }
                .updates-container .auto-update-toggle[enabled] {
                    width: 135px;
                }
                .update-indicator {
                    margin: 0;
                    margin-top: 4px;
                    margin-left: 6px;
                    display: inline-flex;
                }
                .update-indicator p {
                    line-height: 32px;
                    margin: 0;
                    margin-left: 7px;
                }
                .sineItemPreferenceDialogContent > * {
                    padding: 0 5px;
                    width: 100%;
                }
                .sineItemPreferenceDialogContent > *:has(hr) {
                    padding: 5px 5px 5px 0;
                }
                .sineItemPreferenceDialogContent hbox {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .sineItemPreferenceDialogContent hbox menulist, .sineItemPreferenceDialogContent hbox input {
                    display: flex;
                }
                .sineItemPreferenceDialogContent hbox label {
                    margin-right: 10px;
                }
                .sineItemPreferenceDialogContent > p {
                    padding: 0;
                    margin: 0;
                }
                .sineItem, #sineItemContentHeader {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .sineItem {
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 5px;
                    padding: var(--space-medium);
                    position: relative;
                    overflow-x: hidden;
                    flex-direction: column;
                    margin-bottom: 8px;
                }
                .sineItem:not(:has(moz-toggle[pressed])) {
                    .sineItemConfigureButton {
                        display: none;
                    }
                }
                .sineItem > * {
                    width: 100%;
                }
                .sineItemActions {
                    display: flex;
                    margin-top: 5px;
                }
                .sineItemActions > * {
                    margin-bottom: 0;
                    margin-left: 3.5px;
                    margin-right: 3.5px;
                }
                .sineItemActions > *, .sineItemUninstallButton label {
                    cursor: pointer;
                }
                .sineItemUninstallButton {
                    margin-left: auto;
                    margin-bottom: 0;
                }
                .sineItemConfigureButton {
                    margin-left: 0;
                }
                .sineItemConfigureButton, .sineItemHomepageButton {
                    width: 32px;
                    height: 32px;
                    min-width: 0;
                    padding: 0;
                    position: relative;
                }
                .sineItemConfigureButton svg, .sineItemHomepageButton svg {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                }
                .sineCKSOption-input {
                    padding: 5px;
                    border-radius: 5px;
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    margin-left: auto;
                    overflow: hidden;
                    white-space: nowrap;
                    text-overflow: ellipsis;
                    width: 40%;
                    user-select: none;
                    cursor: text;
                    background: transparent;
                    transition: border-color 0.1s;
                }
                @media (prefers-color-scheme: light) {
                    .sineMarketplaceItemButton {
                        color: white !important;
                    }
                    svg {
                        fill: black;
                    }
                    .separator-label:not([checked]), .separator-label[checked]:hover {
                        color: rgba(0, 0, 0, 0.5);
                    }
                    .separator-label:not([checked]):hover {
                        color: black;
                    }
                    .sineInstallationItem {
                        background-color: rgba(0, 0, 0, 0.04) !important;
                        box-shadow: 0 0 5px rgba(255, 255, 255, 0.2) !important;
                    }
                    .auto-update-toggle {
                        color: black !important;
                    }
                    .auto-update-toggle[enabled] {
                        color: white !important;
                    }
                    .sineItemPreferenceDialogTopBar {
                        border-color: rgba(0, 0, 0, 0.3);
                    }
                }
                .sine-editor {
                    min-width: 80vw;
                    overflow: hidden;

                    &[data-theme="default"] {
                        pre code.hljs{display:block;overflow-x:auto;padding:1em}code.hljs{padding:3px 5px}.hljs{background:#f3f3f3;color:#444}.hljs-comment{color:#697070}.hljs-punctuation,.hljs-tag{color:#444a}.hljs-tag .hljs-attr,.hljs-tag .hljs-name{color:#444}.hljs-attribute,.hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-name,.hljs-selector-tag{font-weight:700}.hljs-deletion,.hljs-number,.hljs-quote,.hljs-selector-class,.hljs-selector-id,.hljs-string,.hljs-template-tag,.hljs-type{color:#800}.hljs-section,.hljs-title{color:#800;font-weight:700}.hljs-link,.hljs-operator,.hljs-regexp,.hljs-selector-attr,.hljs-selector-pseudo,.hljs-symbol,.hljs-template-variable,.hljs-variable{color:#ab5656}.hljs-literal{color:#695}.hljs-addition,.hljs-built_in,.hljs-bullet,.hljs-code{color:#397300}.hljs-meta{color:#1f7199}.hljs-meta .hljs-string{color:#38a}.hljs-emphasis{font-style:italic}.hljs-strong{font-weight:700}
                    }

                    &[data-theme="atom-one-dark"] {
                        pre code.hljs{display:block;overflow-x:auto;padding:1em}code.hljs{padding:3px 5px}.hljs{color:#abb2bf;background:#282c34}.hljs-comment,.hljs-quote{color:#5c6370;font-style:italic}.hljs-doctag,.hljs-formula,.hljs-keyword{color:#c678dd}.hljs-deletion,.hljs-name,.hljs-section,.hljs-selector-tag,.hljs-subst{color:#e06c75}.hljs-literal{color:#56b6c2}.hljs-addition,.hljs-attribute,.hljs-meta .hljs-string,.hljs-regexp,.hljs-string{color:#98c379}.hljs-attr,.hljs-number,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-pseudo,.hljs-template-variable,.hljs-type,.hljs-variable{color:#d19a66}.hljs-bullet,.hljs-link,.hljs-meta,.hljs-selector-id,.hljs-symbol,.hljs-title{color:#61aeee}.hljs-built_in,.hljs-class .hljs-title,.hljs-title.class_{color:#e6c07b}.hljs-emphasis{font-style:italic}.hljs-strong{font-weight:700}.hljs-link{text-decoration:underline}
                    }

                    &[data-theme="tokyo-night-dark"] {
                        pre code.hljs{display:block;overflow-x:auto;padding:1em}code.hljs{padding:3px 5px}.hljs-comment,.hljs-meta{color:#565f89}.hljs-deletion,.hljs-doctag,.hljs-regexp,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id,.hljs-selector-pseudo,.hljs-tag,.hljs-template-tag,.hljs-variable.language_{color:#f7768e}.hljs-link,.hljs-literal,.hljs-number,.hljs-params,.hljs-template-variable,.hljs-type,.hljs-variable{color:#ff9e64}.hljs-attribute,.hljs-built_in{color:#e0af68}.hljs-keyword,.hljs-property,.hljs-subst,.hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:#7dcfff}.hljs-selector-tag{color:#73daca}.hljs-addition,.hljs-bullet,.hljs-quote,.hljs-string,.hljs-symbol{color:#9ece6a}.hljs-code,.hljs-formula,.hljs-section{color:#7aa2f7}.hljs-attr,.hljs-char.escape_,.hljs-keyword,.hljs-name,.hljs-operator{color:#bb9af7}.hljs-punctuation{color:#c0caf5}.hljs{background:#1a1b26;color:#9aa5ce}.hljs-emphasis{font-style:italic}.hljs-strong{font-weight:700}
                    }
                }
                .sine-editor .sineItemPreferenceDialogContent {
                    display: grid;
                    grid-template-columns: auto 1px 1fr;
                    overflow: scroll;
                    max-height: 80vh !important;
                }
                .sine-editor-sidebar {
                    min-width: 200px;
                    width: fit-content;
                    margin-right: 20px;
                    position: sticky;
                    top: 0;
                    left: 0;
                    height: 80vh;
                    overflow: scroll;
                }
                .sine-editor-searchbar {
                    border-radius: 8px;
                    margin-bottom: 15px;
                    width: calc(100% - 15px);
                    position: sticky;
                    top: 0;
                    z-index: 200;
                }
                .sine-editor-searchbar:focus {
                    outline: 2px solid var(--button-background-color-primary-active);
                }
                .sine-editor-resizer {
                    background: rgba(255, 255, 255, 0.3);
                    width: 1px;
                    cursor: e-resize;
                    padding: 0;
                    border: 2px solid var(--arrowpanel-background);
                }
                .sine-editor-folder-item .sine-editor-file-list {
                    margin-left: 15px;
                }
                .sine-editor-file-item:hover, .sine-editor-folder-item > p:hover {
                    background: rgba(0, 0, 0, 0.1);
                }
                .sine-editor-folder-item > p {
                    font-weight: bold;
                    display: flex;
                    align-items: center;
                }
                .sine-editor-file-item, .sine-editor-folder-item > p {
                    margin-bottom: 2px;
                    margin-top: 2px;
                    padding: 3px;
                }
                .sine-editor-folder-item > .sine-editor-file-list {
                    display: none;
                }
                .sine-editor-folder-item[open] > .sine-editor-file-list {
                    display: block;
                }
                .sine-editor-folder-item > p::before {
                    content: "";
                    display: inline-block;
                    margin-right: 5px;
                    width: 5px;
                    height: 5px;
                    border-bottom: 2px solid var(--button-background-color-primary-active);
                    border-right: 2px solid var(--button-background-color-primary-active);
                    transform: rotate(-45deg);
                    transition: transform 0.2s ease;
                }
                .sine-editor-folder-item[open] > p::before {
                    transform: rotate(45deg);
                }
                .sine-editor-sidebar, .sine-editor-textarea {
                    margin: 0;
                }
                pre {
                    position: relative;
                    overflow: auto;
                    width: auto !important;
                    padding: 0 0 25px 0 !important;
                    height: max-content !important;
                    white-space: break-spaces;
                    margin-left: 15px;
                }
                pre > * {
                    width: 100% !important;
                    display: block;
                    background: transparent;
                    overflow: hidden;
                    padding: 0;
                    white-space: pre-wrap;
                    overflow-wrap: normal;
                }
                .sine-editor-textarea {
                    position: absolute;
                    top: 0;
                    right: 0;
                    bottom: 0;
                    left: 0;
                    border: none;
                    border-radius: 0;
                    resize: none;
                    color: transparent;
                    caret-color: var(--button-background-color-primary-active);
                    overflow: hidden;
                    height: 100% !important;
                }
                .sine-editor-textpreview {
                    position: relative;
                    user-select: none;
                    height: max-content !important;
                }
                @media not (-moz-pref("sine.is-cool")) {
                    *:not(body, html) {
                        display: none !important;
                    }
                    body::before {
                        content: "Sine IS COOL";
                        width: 100vw;
                        height: 100vh;
                        display: flex !important;
                        text-align: center;
                        align-items: center;
                        font-size: 200px;
                        font-family: "DM Mono", "Papyrus", "Comic Sans", "SF Pro", "Wingdings", "Arial", sans-serif;
                        background-image: url("https://github.com/CosmoCreeper/Sine/blob/main/assets/logo.png?raw=true");
                    }
                }
                ${markedStyles}
            </style>
        `);
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
                            ` : ""}
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
                    newItem.querySelector(".sineItemPreferenceDialogTopBar button")
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
        const sineGroupData = `data-category="paneSineMods" class="subcategory" ${this.sineIsActive ? "" : 'hidden="true"'}`;

        const prefPane = document.querySelector("#mainPrefPane");
        const generalGroup = document.querySelector('[data-category="paneGeneral"]');

        const checkIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-check2" viewBox="0 0 16 16"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0"/></svg>';

        appendXUL(prefPane, `
            <hbox id="SineModsCategory" ${sineGroupData}>
                <h1>${this.versionBrand} Mods</h1>
            </hbox>
        `, generalGroup);

        // Create group.
        const newGroup = appendXUL(prefPane, `
            <groupbox id="sineInstallationGroup" class="highlighting-group" ${sineGroupData}></groupbox>
        `, generalGroup);

        // Create header
        const newHeader = document.createElement("hbox");
        newHeader.id = "sineInstallationHeader";
        newHeader.innerHTML = "<h2>Marketplace</h2>";

        // Create search input
        const newInput = document.createElement("input");
        newInput.className = "sineCKSOption-input";
        newInput.placeholder = "Search...";
        let searchTimeout = null;
        newInput.addEventListener("input", (e) => {
            clearTimeout(searchTimeout); // Clear any pending search
            searchTimeout = setTimeout(() => {
                this.currentPage = 0; // Reset to first page on search
                this.filteredItems = Object.fromEntries(
                    Object.entries(this.marketplace).filter(([_key, item]) =>
                        item.name.toLowerCase().includes(e.target.value.toLowerCase()))
                );
                this.loadPage();
            }, 300); // 300ms delay
        });
        newHeader.appendChild(newInput);

        // Create description
        const newDescription = document.createElement("description");
        newDescription.className = "description-deemphasized";
        newDescription.textContent = "Find and install mods from the store.";

        // Create list (grid)
        const newList = document.createElement("vbox");
        newList.id = "sineInstallationList";

        // Create refresh button
        const newRefresh = document.createElement("button");
        newRefresh.className = "sineMarketplaceOpenButton";
        newRefresh.id = "sineMarketplaceRefreshButton";
        newRefresh.title = "Refresh marketplace";
        newRefresh.addEventListener("click", async () => {
            newRefresh.disabled = true;
            await this.initMarketplace();
            newRefresh.disabled = false;
        });
        newHeader.appendChild(newRefresh);

        // Create close button
        const newClose = document.createElement("button");
        newClose.textContent = "Close";
        newClose.addEventListener("click", () => {
            newGroup.hidePopover();
            newGroup.removeAttribute("popover");
        });
        newHeader.appendChild(newClose);
        newGroup.appendChild(newHeader);

        newGroup.appendChild(newDescription);
        newGroup.appendChild(newList);

        this.initMarketplace();

        // Append custom mods description
        const newCustomDesc = document.createElement("description");
        newCustomDesc.className = "description-deemphasized";
        newCustomDesc.textContent = "or, add your own locally from a GitHub repo.";
        newGroup.appendChild(newCustomDesc);

        // Add custom mods section
        const newCustom = document.createElement("vbox");
        newCustom.id = "sineInstallationCustom";

        // Custom mods input
        const newCustomInput = document.createElement("input");
        newCustomInput.className = "sineCKSOption-input";
        newCustomInput.placeholder = "username/repo (folder if needed)";
        newCustom.appendChild(newCustomInput);

        // Custom mods button
        const newCustomButton = document.createElement("button");
        newCustomButton.className = "sineMarketplaceItemButton";
        newCustomButton.textContent = "Install";
        const installCustom = async () => {
            newCustomButton.disabled = true;
            await this.installMod(newCustomInput.value);
            newCustomInput.value = "";
            await this.loadPage();
            newCustomButton.disabled = false;
        }
        newCustomButton.addEventListener("click", installCustom);
        newCustom.appendChild(newCustomButton);

        newCustomInput.addEventListener("keyup", (e) => {
            if (e.key === "Enter") installCustom();
        });        

        // Settings dialog
        const newSettingsDialog = document.createElement("dialog");
        newSettingsDialog.className = "sineItemPreferenceDialog";
        
        // Settings top bar
        const newSettingsBar = document.createElement("div");
        newSettingsBar.className = "sineItemPreferenceDialogTopBar";
        newSettingsBar.innerHTML += '<h3 class="sineMarketplaceItemTitle">Settings</h3>';
        const newSettingsBarBtn = document.createElement("button");
        newSettingsBarBtn.textContent = "Close";
        newSettingsBarBtn.addEventListener("click", () => newSettingsDialog.close());
        newSettingsBar.appendChild(newSettingsBarBtn);
        newSettingsDialog.appendChild(newSettingsBar);

        // Settings content
        const newSettingsContent = document.createElement("div");
        newSettingsContent.className = "sineItemPreferenceDialogContent";
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
                "restart": true,
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
                    await this.updateEngine();
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
                "label": "Enables script auto-updating.",
            },
            {
                "type": "checkbox",
                "property": "sine.script.auto-restart",
                "label": "Automatically restarts when script updates are found.",
            }
        ];
        for (const [idx, pref] of settingPrefs.entries()) {
            let prefEl = this.parsePrefs(pref);

            if (pref.type === "string") {
                prefEl.addEventListener("change", () => {
                    this.initMarketplace();
                });
            }

            if (prefEl && typeof prefEl !== "string") newSettingsContent.appendChild(prefEl);
            else if (prefEl === "button") {
                const prefContainer = document.createElement("hbox");
                prefContainer.className = "updates-container";
                prefEl = document.createElement("button");
                prefEl.style.margin = "0";
                prefEl.style.boxSizing = "border-box";
                prefEl.textContent = pref.label;
                prefEl.addEventListener("click", async () => {
                    prefEl.disabled = true;
                    if (pref.hasOwnProperty("indicator"))
                        document.querySelector(`#btn-indicator-${idx}`).innerHTML = pref.indicator + "<p>...</p>";
                    const isUpdated = await pref.action();
                    prefEl.disabled = false;
                    if (pref.hasOwnProperty("indicator"))
                        document.querySelector(`#btn-indicator-${idx}`).innerHTML = pref.indicator + `<p>${isUpdated ? "Script updated" : "Up-to-date"}</p>`;
                }); 
                prefContainer.appendChild(prefEl);
                if (pref.hasOwnProperty("indicator")) {
                    const indicator = document.createElement("div");
                    indicator.id = `btn-indicator-${idx}`;
                    indicator.className = "update-indicator";
                    prefContainer.appendChild(indicator);
                }
                newSettingsContent.appendChild(prefContainer);
            }
        }
        newSettingsDialog.appendChild(newSettingsContent);
        newCustom.appendChild(newSettingsDialog);

        // Settings button
        const newSettingsButton = document.createElement("button");
        newSettingsButton.className = "sineMarketplaceOpenButton sineItemConfigureButton";
        newSettingsButton.title = "Open settings";
        newSettingsButton.addEventListener("click", () => newSettingsDialog.showModal());
        newCustom.appendChild(newSettingsButton);

        // Expand button
        const newExpandButton = document.createElement("button");
        newExpandButton.className = "sineMarketplaceOpenButton";
        newExpandButton.title = "Expand marketplace";
        newExpandButton.addEventListener("click", () => {
            newGroup.setAttribute("popover", "manual");
            newGroup.showPopover();
        });
        newCustom.appendChild(newExpandButton);

        newGroup.appendChild(newCustom);
        
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
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.style.display = 'none';
            input.setAttribute('moz-accept', '.json');
            input.setAttribute('accept', '.json');
            input.click();

            let timeout;

            const filePromise = new Promise((resolve) => {
              input.addEventListener('change', (event) => {
                  if (timeout) {
                      clearTimeout(timeout);
                  }
              
                  const file = event.target.files[0];
                  resolve(file);
              });
          
              timeout = setTimeout(() => {
                  console.warn('[Sine]: Import timeout reached, aborting.');
                  resolve(null);
              }, 60000);
            });
        
            input.addEventListener('cancel', () => {
                console.warn('[Sine]: Import cancelled by user.');
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
                console.error('[Sine]: Error while importing mods:', error);
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
                const blob = new Blob([modsJson], { type: 'application/json' });
              
                temporalUrl = URL.createObjectURL(blob);
                // Creating a link to download the JSON file
                temporalAnchor = document.createElement('a');
                temporalAnchor.href = temporalUrl;
                temporalAnchor.download = 'sine-mods-export.json';
              
                document.body.appendChild(temporalAnchor);
                temporalAnchor.click();
                temporalAnchor.remove();
              
                successBox.hidden = false;
            } catch (error) {
                console.error('[Sine]: Error while exporting mods:', error);
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
        const sineTab = document.createXULElement("richlistitem");
        sineTab.id = "category-sine-mods";
        sineTab.className = "category";
        sineTab.value = "paneSineMods";
        sineTab.setAttribute("tooltiptext", `${this.versionBrand} Mods`);
        sineTab.setAttribute("align", "center");

        const sineIcon = document.createXULElement("image");
        sineIcon.className = "category-icon";
        sineTab.appendChild(sineIcon);

        const sineTitle = document.createElement("label");
        sineTitle.className = "category-name";
        sineTitle.flex = "1";
        sineTitle.textContent = `${this.versionBrand} Mods`;
        sineTab.appendChild(sineTitle);

        document.querySelector("#categories").insertBefore(
            sineTab,
            document.querySelector("#category-general").nextElementSibling
        );

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
        this.applySiteStyles();
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
    if (!UC_API.Prefs.get("sine.fork-id").exists())
        UC_API.Prefs.set("sine.fork-id", Sine.forkNum());

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
            if (String(err).includes("NS_ERROR_FILE_DIR_NOT_EMPTY")) Sine.showToast("Error copying Zen mods: Attempted to add a mod that already exists.");
            else Sine.showToast("Error copying Zen mods: Check Ctrl+Shift+J for more info.", "warning", false);
        }
        delete window.gZenMods;
    }

    Sine.manager.rebuildMods();
    const initWindow = Sine.initWindow();
    Sine.initDev();

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

    appendXUL(document.head, `
        <style>
            notification-message {
                border-radius: 8px !important;
                box-shadow: 2px 2px 2px rgba(0, 0, 0, 0.2) !important;
                margin-bottom: 5px !important;
                margin-right: 5px !important;
            }
            .sineCommandPalette {
                position: fixed;
                height: fit-content;
                width: 50vw;
                max-width: 800px;
                left: 50%;
                top: 50%;
                transform: translate(-50%, -50%);
                backdrop-filter: blur(10px) brightness(0.6) saturate(3.4);
                border: 2px solid rgba(255, 255, 255, 0.3);
                z-index: 2000;
                box-shadow: 0 0 4px 4px rgba(0, 0, 0, 0.5);
                border-radius: 8px;
                transition: visibility 0.35s ease, opacity 0.35s ease;
                box-sizing: border-box;
        
                &[hidden] {
                    display: block;
                    opacity: 0;
                    visibility: hidden;
                    backdrop-filter: 0px;
                }
            }
            .sineCommandInput, .sineCommandSearch {
                width: 100%;
                height: 100%;
                box-sizing: border-box;
                position: relative;
        
                & > input, & > div {
                    padding: 15px;
                    box-sizing: border-box;
                    font-size: 15px;
                    width: 100%;
                }
                & > input {
                    background: transparent;
                    border: none;
                    padding-bottom: 0;
                }
                & > hr {
                    border-top: 1px solid rgba(255, 255, 255, 0.3);
                    margin: 10px;
                }
                & > div {
                    padding-top: 0;
        
                    & > button {
                        width: 100%;
                        padding: 5px;
                        background: transparent;
                        border: 1px solid rgba(255, 255, 255, 0.3);
                        box-sizing: border-box;
                        margin-top: 3px;
                        margin-bottom: 3px;
        
                        &[selected], &:hover {
                            background: rgba(255, 255, 255, 0.3);
                        }
                    }
                }
                & > .submit {
                    position: relative;
                    margin-left: auto;
                    right: 8px;
                    bottom: 8px;
                    width: 80px;
                    height: 30px;
                    background-color: var(--color-accent-primary);
                    border-radius: 8px;
                    color: black;
                    display: flex;
                    align-items: center;
                    text-indent: 18px;
                    transition: filter 0.35s ease;
                    border: 1px solid rgba(255, 255, 255, 0.3);
                }
                & > .submit::before {
                    content: "";
                    position: absolute;
                    margin: 0 auto;
                    height: 15px;
                    width: 15px;
                    background-image: url(data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGcgaWQ9IlNWR1JlcG9fYmdDYXJyaWVyIiBzdHJva2Utd2lkdGg9IjAiPjwvZz48ZyBpZD0iU1ZHUmVwb190cmFjZXJDYXJyaWVyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjwvZz48ZyBpZD0iU1ZHUmVwb19pY29uQ2FycmllciI+IDxwYXRoIGQ9Ik0xMS41MDAzIDEySDUuNDE4NzJNNS4yNDYzNCAxMi43OTcyTDQuMjQxNTggMTUuNzk4NkMzLjY5MTI4IDE3LjQ0MjQgMy40MTYxMyAxOC4yNjQzIDMuNjEzNTkgMTguNzcwNEMzLjc4NTA2IDE5LjIxIDQuMTUzMzUgMTkuNTQzMiA0LjYwNzggMTkuNjcwMUM1LjEzMTExIDE5LjgxNjEgNS45MjE1MSAxOS40NjA0IDcuNTAyMzEgMTguNzQ5MUwxNy42MzY3IDE0LjE4ODZDMTkuMTc5NyAxMy40OTQyIDE5Ljk1MTIgMTMuMTQ3MSAyMC4xODk2IDEyLjY2NDhDMjAuMzk2OCAxMi4yNDU4IDIwLjM5NjggMTEuNzU0MSAyMC4xODk2IDExLjMzNTFDMTkuOTUxMiAxMC44NTI5IDE5LjE3OTcgMTAuNTA1NyAxNy42MzY3IDkuODExMzVMNy40ODQ4MyA1LjI0MzAzQzUuOTA4NzkgNC41MzM4MiA1LjEyMDc4IDQuMTc5MjEgNC41OTc5OSA0LjMyNDY4QzQuMTQzOTcgNC40NTEwMSAzLjc3NTcyIDQuNzgzMzYgMy42MDM2NSA1LjIyMjA5QzMuNDA1NTEgNS43MjcyOCAzLjY3NzcyIDYuNTQ3NDEgNC4yMjIxNSA4LjE4NzY3TDUuMjQ4MjkgMTEuMjc5M0M1LjM0MTc5IDExLjU2MSA1LjM4ODU1IDExLjcwMTkgNS40MDcgMTEuODQ1OUM1LjQyMzM4IDExLjk3MzggNS40MjMyMSAxMi4xMDMyIDUuNDA2NTEgMTIuMjMxQzUuMzg3NjggMTIuMzc1IDUuMzQwNTcgMTIuNTE1NyA1LjI0NjM0IDEyLjc5NzJaIiBzdHJva2U9IiMwMDAwMDAiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48L3BhdGg+IDwvZz48L3N2Zz4=);
                    transition: transform 0.35s ease;
                }
                & > .submit:hover {
                    filter: brightness(0.8);
                }
                & > .submit:hover::before {
                    transform: rotateZ(-90deg);
                }
            }
            @media (prefers-color-scheme: light) {
                .sineCommandInput {
                    & > .submit {
                        color: white;
                    }
                    & > .submit::before {
                        filter: invert(1);
                    }
                }
            }
        </style>
    `);

    await initWindow;
} else {
    Sine.init();
}
