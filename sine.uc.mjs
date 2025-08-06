// ==UserScript==
// @include   main
// @include   about:preferences*
// @include   about:settings*
// @ignorecache
// ==/UserScript==

// API import.
import("chrome://userscripts/content/engine/assets/imports/motion.sys.mjs");

// Engine imports.
import appendXUL from "chrome://userscripts/content/engine/utils/XULManager.js";
import injectAPI from "chrome://userscripts/content/engine/injectAPI.js";
import { defineMarked } from "chrome://userscripts/content/engine/assets/imports/marked.js";
import initDev from "chrome://userscripts/content/engine/plugins/cmdPalette.js";
import updates from "chrome://userscripts/content/engine/services/updates.js";
import utils from "chrome://userscripts/content/engine/utils/utils.js";
import manager from "chrome://userscripts/content/engine/utils/manager.js";

import ucAPI from "chrome://userscripts/content/engine/utils/uc_api.js";
window.ucAPI = ucAPI;

// Imports to execute at script startup.
import("chrome://userscripts/content/engine/prefs.js");
defineMarked();

const isCosine = Services.prefs.getBoolPref("sine.is-cosine");
console.log(`${isCosine ? "Cosine" : "Sine"} is active!`);

const Sine = {
    get versionBrand() {
        return isCosine ? "Cosine" : "Sine";
    },

    get marketURL() {
        const defaultURL = "https://sineorg.github.io/store/marketplace.json";
        if (Services.prefs.getBoolPref("sine.allow-external-marketplace", false)) {
            return Services.prefs.getStringPref("sine.marketplace-url", defaultURL) || defaultURL;
        } else {
            return defaultURL;
        }
    },

    get autoUpdates() {
        return Services.prefs.getBoolPref("sine.auto-updates", true);
    },

    set autoUpdates(newValue) {
        Services.prefs.setBoolPref("sine.auto-updates", newValue);
    },

    async initWindow() {
        this.updateMods("auto");
        await updates.checkForUpdates();
    },

    rawURL(repo) {
        if (repo.startsWith("[") && repo.endsWith(")") && repo.includes("](")) {
            repo = repo.replace(/^\[[a-z]+\]\(/i, "").replace(/\)$/, "");
        }

        if (repo.startsWith("https://github.com/")) {
            repo = repo.replace("https://github.com/", "");
        }

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
        if (remove) {
            promise = manager.disableMod(themeData.id);
        } else {
            promise = manager.enableMod(themeData.id);
        }

        const jsPromises = [];
        if (themeData.js) {
            const jsFileLoc = PathUtils.join(utils.jsDir, themeData.id + "_");
            for (let file of themeData["editable-files"]?.find(item => item.directory === "js")?.contents) {
                const fileToReplace = remove ? file : file.replace(/[a-z]+\.m?js$/, "db");

                if (remove) {
                    file = file.replace(/[a-z]+\.m?js$/, "db");
                }

                jsPromises.push((async () => {
                    await IOUtils.writeUTF8(jsFileLoc + file, await IOUtils.readUTF8(jsFileLoc + fileToReplace));
                    await IOUtils.remove(PathUtils.join(jsFileLoc, fileToReplace), { ignoreAbsent: true });
                })());
            }
        }

        await promise;
        manager.rebuildMods();

        if (themeData.js) {
            await Promise.all(jsPromises);
            ucAPI.showToast([
                `A mod utilizing JS has been ${remove ? "disabled" : "enabled"}.`,
                "For usage of it to be fully restored, restart your browser."
            ]);
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
        if (pref.disabledOn && pref.disabledOn.some(os => os.includes(ucAPI.os))) {
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
        if (docName[pref.type]) {
            prefEl = document.createElement(docName[pref.type]);
        } else {
            return;
        }

        if (pref.property || pref.id) {
            const identifier = pref.property ?? pref.id;
            prefEl.id = identifier.replace(/\./g, "-");
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
            ucAPI.showToast(
                [
                    "You changed a preference that requires a browser restart to take effect."
                ]
            );
        }

        const convertToBool = (string) => {
            string = string.toLowerCase();
            if (string === "false") {
                return false;
            } else {
                return true;
            }
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
                <menulist>
                    <menupopup class="in-menulist"></menupopup>
                </menulist>
            `, null, true);

            const menulist = prefEl.querySelector("menulist");
            const menupopup = menulist.children[0];

            const defaultMatch = pref.options.find(item =>
                item.value === pref.defaultValue || item.value === pref.default
            );
            if (pref.placeholder !== false) {
                const label = pref.placeholder ?? "None";
                const value = defaultMatch ? "none" : pref.defaultValue ?? pref.default ?? "none";

                menulist.setAttribute("label", label);
                menulist.setAttribute("value", value);

                appendXUL(menupopup, `
                    <menuitem label="${label}" value="${value}"/>
                `, null, true);
            }

            pref.options.forEach(option => {
                appendXUL(menupopup, `
                    <menuitem label="${option.label}" value="${option.value}"/>
                `, null, true);
            });

            const placeholderSelected =
                ucAPI.prefs.get(pref.property) === "" || ucAPI.prefs.get(pref.property) === "none";
            const hasDefaultValue = pref.hasOwnProperty("defaultValue") || pref.hasOwnProperty("default");
            if (
                Services.prefs.getPrefType(pref.property) > 0 &&
                (
                    !pref.force ||
                    !hasDefaultValue ||
                    (Services.prefs.getPrefType(pref.property) > 0 && Services.prefs.prefHasUserValue(pref.property))
                ) &&
                !placeholderSelected
            ) {
                const value = ucAPI.prefs.get(pref.property);
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
                ucAPI.prefs.set(pref.property, pref.defaultValue ?? pref.default);
            } else if (Array.from(menupopup.children).length >= 1 && !placeholderSelected) {
                menulist.setAttribute("label", menupopup.children[0].getAttribute("label"));
                menulist.setAttribute("value", menupopup.children[0].getAttribute("value"));
                ucAPI.prefs.set(pref.property, menupopup.children[0].getAttribute("value"));
            }
            
            menulist.addEventListener("command", () => {
                let value = menulist.getAttribute("value");

                if (pref.value === "number" || pref.value === "num") {
                    value = Number(value);
                } else if (pref.value === "boolean" || pref.value === "bool") {
                    value = convertToBool(value);
                }

                ucAPI.prefs.set(pref.property, value);
                if (pref.restart) {
                    showRestartPrefToast();
                }
                manager.rebuildMods();
            });
        } else if (pref.type === "text" && pref.hasOwnProperty("label")) {
            prefEl.innerHTML = pref.label;
        } else if (pref.type === "string") {
            const input = appendXUL(prefEl, `
                <input type="text" placeholder="${pref.placeholder ?? "Type something..."}"/>
            `);

            const hasDefaultValue = pref.hasOwnProperty("defaultValue") || pref.hasOwnProperty("default");
            if (
                Services.prefs.getPrefType(pref.property) > 0 &&
                (
                    !pref.force ||
                    !hasDefaultValue ||
                    (Services.prefs.getPrefType(pref.property) > 0 && Services.prefs.prefHasUserValue(pref.property))
                )
            ) {
                input.value = ucAPI.prefs.get(pref.property);
            } else {
                ucAPI.prefs.set(pref.property, pref.defaultValue ?? pref.default ?? "");
                input.value = pref.defaultValue ?? pref.default;
            }

            const updateBorder = () => {
                if (pref.hasOwnProperty("border") && pref.border === "value") {
                    input.style.borderColor = input.value;
                } else if (pref.hasOwnProperty("border")) {
                    input.style.borderColor = pref.border;
                }
            }
            updateBorder();

            input.addEventListener("change", () => {
                let value = input.value;
                if (pref.value === "number" || pref.value === "num") {
                    value = Number(input.value);
                } else if (pref.value === "boolean" || pref.value === "bool") {
                    value = convertToBool(input.value);
                }

                ucAPI.prefs.set(pref.property, value);

                manager.rebuildMods();
                updateBorder();
                if (pref.restart) {
                    showRestartPrefToast();
                }
            });
        }

        if (
            ((pref.type === "separator" && pref.hasOwnProperty("label")) || pref.type === "checkbox") &&
            pref.hasOwnProperty("property")
        ) {
            const clickable = pref.type === "checkbox" ? prefEl : prefEl.children[1];

            if ((pref.defaultValue ?? pref.default) && !Services.prefs.getPrefType(pref.property) > 0) {
                ucAPI.prefs.set(pref.property, true);
            }

            if (ucAPI.prefs.get(pref.property)) {
                clickable.setAttribute("checked", true);
            }

            if (pref.type === "checkbox" && clickable.getAttribute("checked")) {
                clickable.children[0].checked = true;
            }

            clickable.addEventListener("click", (e) => {
                ucAPI.prefs.set(pref.property, e.currentTarget.getAttribute("checked") ? false : true);
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

        if (pref.hasOwnProperty("conditions")) {
            this.setupPrefObserver(pref);
        }

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

    evaluateCondition(cond) {
        const isNot = !!cond.not;
        const condition = cond.if || cond.not;
        
        if (typeof condition.value === "boolean") {
            const prefValue = Services.prefs.getBoolPref(condition.property, false);
            return isNot ? prefValue !== condition.value : prefValue === condition.value;
        } else if (typeof condition.value === "number") {
            const prefValue = Services.prefs.getIntPref(condition.property, 0);
            return isNot ? prefValue !== condition.value : prefValue === condition.value;
        } else {
            const prefValue = Services.prefs.getCharPref(condition.property, "");
            return isNot ? prefValue !== condition.value : prefValue === condition.value;
        }
    },
    
    evaluateConditions(conditions, operator = "AND") {
        const condArray = Array.isArray(conditions) ? conditions : [conditions];
        if (condArray.length === 0) {
            return true;
        }
        
        const results = condArray.map(cond => {
            if (cond.if || cond.not) {
                return this.evaluateCondition(cond);
            } else if (cond.conditions) {
                return this.evaluateConditions(cond.conditions, cond.operator || "AND");
            } else {
                return false;
            }
        });
        
        return operator === "OR" ? results.some(r => r) : results.every(r => r);
    },
    
    updatePrefVisibility(pref) {
        const identifier = pref.id ?? pref.property;
        const targetId = identifier.replace(/\./g, "-");
        const element = document.getElementById(targetId);
        
        if (element) {
            const shouldShow = this.evaluateConditions(pref.conditions, pref.operator || "OR");
            element.style.display = shouldShow ? "flex" : "none";
        }
    },
    
    setupPrefObserver(pref) {
        const identifier = pref.id ?? pref.property;
        const targetId = identifier.replace(/\./g, "-");
        
        // Initially hide the element
        const element = document.getElementById(targetId);
        if (element) {
            element.style.display = "none";
        }
        
        // Collect all preference properties that need to be observed
        const propsToObserve = new Set();
        
        const collectProps = (conditions) => {
            const condArray = Array.isArray(conditions) ? conditions : [conditions];
            condArray.forEach(cond => {
                if (cond.if || cond.not) {
                    const condition = cond.if || cond.not;
                    propsToObserve.add(condition.property);
                } else if (cond.conditions) {
                    collectProps(cond.conditions);
                }
            });
        };
        
        collectProps(pref.conditions);
        
        // Create observer callback
        const observer = {
            observe: (_, topic, data) => {
                if (topic === "nsPref:changed" && propsToObserve.has(data)) {
                    this.updatePrefVisibility(pref);
                }
            }
        };
        
        // Add observers for each property
        propsToObserve.forEach(prop => {
            Services.prefs.addObserver(prop, observer);
        });

        window.addEventListener("beforeunload", () => {
            propsToObserve.forEach(prop => {
                console.log("Removing observer: " + prop);
                Services.prefs.removeObserver(prop, observer);
            });
        });
        
        // Initial visibility check
        this.updatePrefVisibility(pref);
        
        return observer;
    },

    async loadMods() {
        if (document.querySelector(".sineItem")) {
            document.querySelectorAll(".sineItem").forEach(el => el.remove());
        }

        if (!Services.prefs.getBoolPref("sine.mods.disable-all", false)) {
            let installedMods = await utils.getMods();
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
                                ${modData.description}
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
                    installedMods = await utils.getMods();
                    const theme = installedMods[modData.id];
                    await this.toggleTheme(theme, theme.enabled);
                    toggle.title = `${theme.enabled ? "Enable" : "Disable"} mod`;
                });

                if (modData.preferences) {
                    const dialog = item.querySelector("dialog");

                    item.querySelector(".sineItemPreferenceDialogTopBar button")
                        .addEventListener("click", () => dialog.close());
                    
                    const loadPrefs = async () => {
                        const modPrefs = await utils.getModPreferences(modData);
                        for (const pref of modPrefs) {
                            const prefEl = this.parsePrefs(pref);
                            if (prefEl) {
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
                    const installedMods = await utils.getMods();
                    installedMods[key]["no-updates"] = !installedMods[key]["no-updates"];
                    if (!updateButton.getAttribute("enabled")) {
                        updateButton.setAttribute("enabled", true);
                        updateButton.title = "Enable updating for this mod";
                    } else {
                        updateButton.removeAttribute("enabled");
                        updateButton.title = "Disable updating for this mod";
                    }
                    await IOUtils.writeJSON(utils.modsDataFile, installedMods);
                });
                
                // Add remove button click event.
                const remove = item.querySelector(".sineItemUninstallButton");
                remove.addEventListener("click", async () => {
                    if (window.confirm("Are you sure you want to remove this mod?")) {
                        remove.disabled = true;

                        const jsPromises = [];
                        const jsFiles = modData["editable-files"]?.find(item => item.directory === "js");
                        if (jsFiles) {
                            for (const file of jsFiles.contents) {
                                const jsPath = PathUtils.join(
                                    utils.jsDir,
                                    `${modData.id}_${modData.enabled ? file : file.replace(/[a-z]+\.m?js$/, "db")}`
                                );
                                jsPromises.push(IOUtils.remove(jsPath, { ignoreAbsent: true }));
                            }
                        }

                        await manager.removeMod(modData.id);
                        this.loadPage();
                        manager.rebuildMods();
                        item.remove();
                        if (modData.hasOwnProperty("js")) {
                            await Promise.all(jsPromises);
                            ucAPI.showToast([
                                "A mod utilizing JS has been removed.",
                                "For usage of it to be fully halted, restart your browser."
                            ]);
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
            if (segment === "..") {
                initialDepth--;
            } else if (segment !== ".") {
                initialDepth++;
            }
        }
    
        let newDepth = 0;
        for (const segment of newPathSegments) {
            if (segment === "..") {
                newDepth--;
            } else if (segment !== ".") {
                newDepth++;
            }
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
        while (
            (match = importRegex.exec(cssContent.replace(/\/\*[\s\S]*?\*\//g, ''))) ||
            (match = urlRegex.exec(cssContent))
        ) {
            matches.push(match);
        }
    
        const imports = [...new Set(matches.map(match => match[2] ?? match[1]))];
    
        let editableFiles = [];
        const promises = [];
        for (const importPath of imports) {
            // Add to this array as needed (if things with weird paths are being added in.)
            const regexArray = ["data:", "chrome://", "resource://", "https://", "http://", "moz-extension:", "moz-icon:"];
            if (
                !this.doesPathGoBehind(currentPath, importPath) &&
                regexArray.every(regex => !importPath.startsWith(regex))
            ) {
                const splicedPath = currentPath.split("/").slice(0, -1).join("/");
                const completePath = splicedPath ? splicedPath + "/" : splicedPath;
                const resolvedPath = completePath + importPath.replace(/(?<!\.)\.\//g, "");
                const fullUrl = new URL(resolvedPath, repoBaseUrl).href;
                promises.push((async () => {
                    const importedCss = await ucAPI.fetch(fullUrl);
                    if (importPath.endsWith(".css")) {
                        const filesToAdd = await this.processCSS(resolvedPath, importedCss, repoBaseUrl, themeFolder);
                        editableFiles = editableFiles.concat(filesToAdd);
                    } else {
                        await IOUtils.writeUTF8(
                            themeFolder +
                                (ucAPI.os.includes("win") ? "\\" + resolvedPath.replace(/\//g, "\\") : resolvedPath),
                            importedCss
                        );
                        editableFiles.push(resolvedPath);
                    }
                })());
            }
        }
    
        // Add the current file to the editableFiles structure before writing.
        editableFiles.push(currentPath);
    
        // Match the appropriate path format for each OS.
        if (ucAPI.os.includes("win")) {
            currentPath = "\\" + currentPath.replace(/\//g, "\\");
        } else {
            currentPath = "/" + currentPath;
        }

        await IOUtils.writeUTF8(themeFolder + currentPath, cssContent);
        await Promise.all(promises);
        return editableFiles;
    },

    async processRootCSS(rootFileName, repoBaseUrl, themeFolder) {
        const rootPath = `${rootFileName}.css`;
        const rootCss = await ucAPI.fetch(repoBaseUrl);
    
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
                                const filePath = PathUtils.join(utils.jsDir, finalFileName);
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
            if (!match) {
                return null;
            }
            const user = match[1];
            const returnRepo = match[2];
            return `https://api.github.com/repos/${user}/${returnRepo}`;
        }
        const notNull = (data) => {
            return typeof data === "object" ||
                (typeof data === "string" && data && data.toLowerCase() !== "404: not found");
        }
        const shouldApply = (property) => {
            return !theme.hasOwnProperty(property) ||
                (
                    (
                        property === "style" || property === "preferences" ||
                        property === "readme" || property === "image"
                    ) &&
                    typeof theme[property] === "string" &&
                    theme[property].startsWith("https://raw.githubusercontent.com/zen-browser/theme-store")
                );
        }

        const repoRoot = this.rawURL(repo);
        const apiRequiringProperties = minimal ? ["updatedAt"] : ["homepage", "name", "description", "createdAt", "updatedAt"];
        let needAPI = false;
        for (const property of apiRequiringProperties) {
            if (!theme.hasOwnProperty(property)) {
                needAPI = true;
            }
        }
        if (needAPI && !githubAPI) {
            githubAPI = ucAPI.fetch(translateToAPI(repo));
        }

        const promises = [];
        const setProperty = async (property, value, ifValue=null, nestedProperty=false, escapeNull=false) => {
            promises.push((async () => {
                if (notNull(value) && (shouldApply(property) || escapeNull)) {
                    if (ifValue) {
                        ifValue = await ucAPI.fetch(value).then(res => notNull(res));
                    }

                    if (ifValue ?? true) {
                        if (nestedProperty) {
                            theme[property][nestedProperty] = value;
                        } else {
                            theme[property] = value;
                        }
                    }
                }
            })());
            await promises[promises.length - 1];
        }

        if (!minimal) {
            promises.push((async () => {
                await setProperty("style", `${repoRoot}chrome.css`, true);

                if (!theme.style) {
                    theme.style = {};

                    const directories = ["", "chrome/"]
                    for (const dir of directories) {
                        const stylePromises = [];
                        stylePromises.push(
                            setProperty("style", `${repoRoot + dir}userChrome.css`, true, "chrome", true)
                        );
                        stylePromises.push(
                            setProperty("style", `${repoRoot + dir}userContent.css`, true, "content", true)
                        );
                        await Promise.all(stylePromises);
                    }
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
                const silkthemesJSON = await ucAPI.fetch(`${repoRoot}bento.json`);
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
                    const releasesData = await ucAPI.fetch(`${translateToAPI(repo)}/releases/latest`);
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

    async handleJS(newThemeData) {
        const editableFiles = [];
        const promises = [];
        if (typeof newThemeData.js === "string" || typeof newThemeData.js === "array") {
            if (Services.prefs.getBoolPref("sine.allow-unsafe-js", false)) {
                const jsFiles = Array.isArray(newThemeData.js) ? newThemeData.js : [newThemeData.js];
                for (const file of jsFiles) {
                    promises.push((async () => {
                        const fileContents = await ucAPI.fetch(file).catch(err => console.error(err));
                        if (typeof fileContents === "string" && fileContents.toLowerCase() !== "404: not found") {
                            const fileName = file.split("/").pop();
                            await IOUtils.writeUTF8(
                                PathUtils.join(utils.jsDir, newThemeData.id + "_" + fileName),
                                fileContents
                            );
                            editableFiles.push(`js/${fileName}`);
                        }
                    })());
                }
            } else {
                ucAPI.showToast(
                    [
                        "This mod uses unofficial JS.",
                        "To install it, you must enable the option. (unsafe)"
                    ],
                    2,
                    () => {
                        Services.prefs.setBoolPref("sine.allow-unsafe-js", true);
                        this.handleJS(newThemeData);
                    }
                );
                return false;
            }
        } else {
            const dirLink = `https://api.github.com/repos/sineorg/store/contents/mods/${newThemeData.id}`;
            const newFiles = await ucAPI.fetch(dirLink).then(res => Object.values(res)).catch(err => console.warn(err));
            for (const file of newFiles) {
                promises.push((async () => {
                    const fileContents = await ucAPI.fetch(file.download_url).catch(err => console.error(err));
                    if (typeof fileContents === "string" && fileContents.toLowerCase() !== "404: not found") {
                        await IOUtils.writeUTF8(
                            PathUtils.join(utils.jsDir, newThemeData.id + "_" + file.name),
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
        const themeFolder = utils.getModFolder(newThemeData.id);
        newThemeData["editable-files"] = [];
        
        const promises = [];

        let changeMadeHasJS = false;
        if (newThemeData.hasOwnProperty("js") || (currModData && currModData.hasOwnProperty("js"))) {
            if (newThemeData.hasOwnProperty("js")) {
                promises.push((async () => {
                    const jsReturn = await this.handleJS(newThemeData);
                    if (jsReturn) {
                        newThemeData["editable-files"] = newThemeData["editable-files"].concat(jsReturn);
                        changeMadeHasJS = true;
                    }
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
                    newPrefData = await ucAPI.fetch(newThemeData.preferences, true).catch(err => console.error(err));

                    try {
                        JSON.parse(newPrefData);
                    } catch (err) {
                        console.warn(err);
                        newPrefData = await ucAPI.fetch(
                            "https://raw.githubusercontent.com/zen-browser/theme-store/main/" +
                            `themes/${newThemeData.id}/preferences.json`,
                            true
                        ).catch(err => console.error(err));
                    }
                }
                await IOUtils.writeUTF8(PathUtils.join(themeFolder, "preferences.json"), newPrefData);
            })());
            newThemeData["editable-files"].push("preferences.json");
        } if (newThemeData.hasOwnProperty("readme")) {
            promises.push((async () => {
                const newREADMEData = await ucAPI.fetch(newThemeData.readme).catch(err => console.error(err));
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

        if (newThemeData.hasOwnProperty("modules")) {
            currThemeData = await utils.getMods();
        }
        currThemeData[newThemeData.id] = newThemeData;

        await IOUtils.writeJSON(utils.modsDataFile, currThemeData);
        if (currModData) {
            return changeMadeHasJS;
        }
    },

    async installMod(repo, reload=true) {
        const currThemeData = await utils.getMods();

        const newThemeData = await ucAPI.fetch(`${this.rawURL(repo)}theme.json`)
            .then(async res =>
                await this.createThemeJSON(repo, currThemeData, typeof res !== "object" ? {} : res)
            );
        if (typeof newThemeData.style === "object" && Object.keys(newThemeData.style).length === 0) {
            delete newThemeData.style;
        }
        if (newThemeData) {
            await this.syncModData(currThemeData, newThemeData);

            if (reload) {
                manager.rebuildMods();
                this.loadMods();
            }

            if (newThemeData.hasOwnProperty("js")) {
                ucAPI.showToast([
                    "A mod utilizing JS has been installed.",
                    "For it to work properly, restart your browser."
                ]);
            }
        }
    },

    async updateMods(source) {
        if ((source === "auto" && this.autoUpdates) || source === "manual") {
            const currThemeData = await utils.getMods();
            let changeMade = false;
            let changeMadeHasJS = false;
            for (const key in currThemeData) {
                const currModData = currThemeData[key];
                if (currModData.enabled && !currModData["no-updates"]) {
                    let newThemeData, githubAPI, originalData;
                    if (currModData.homepage) {
                        originalData = await ucAPI.fetch(`${this.rawURL(currModData.homepage)}theme.json`);
                        const minimalData = await this.createThemeJSON(
                            currModData.homepage,
                            currThemeData,
                            typeof originalData !== "object" ? {} : originalData,
                            true
                        );
                        newThemeData = minimalData["theme"];
                        githubAPI = minimalData["githubAPI"];
                    } else {
                        newThemeData = await ucAPI.fetch(
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
                            if (
                                typeof newThemeData.style === "object" &&
                                Object.keys(newThemeData.style).length === 0
                            ) {
                                delete newThemeData.style; 
                            }

                            const toAdd = ["style", "readme", "preferences", "image"];
                            for (const property of toAdd) {
                                if (
                                    !customData.hasOwnProperty(property) &&
                                    currModData.hasOwnProperty(property)
                                ) {
                                    customData[property] = currModData[property];
                                }
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
                ucAPI.showToast([
                    "A mod utilizing JS has been updated.",
                    "For it to work properly, restart your browser."
                ]);
            }

            if (changeMade) {
                manager.rebuildMods();
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
        const installedMods = await utils.getMods();
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
                    if (newItemImage.hasAttribute("zoomed")) {
                        newItemImage.removeAttribute("zoomed");
                    } else {
                        newItemImage.setAttribute("zoomed", "true");
                    }
                });
            }
            
            // Add readme dialog
            if (data.readme) {
                const dialog = newItem.querySelector("dialog");
                newItem.querySelector(".sineItemPreferenceDialogTopBar > button")
                    .addEventListener("click", () => dialog.close());
            
                const newOpenButton = newItem.querySelector(".sineMarketplaceOpenButton");
                newOpenButton.addEventListener("click", async () => {
                    const themeMD = await ucAPI.fetch(data.readme).catch((err) => console.error(err));
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
            if (installedMods[key]) {
                newItem.setAttribute("installed", "true");
            }
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
        const marketplace = await ucAPI.fetch(this.marketURL).then(res => {
            if (res) {
                res = Object.fromEntries(Object.entries(res).filter(([key, data]) =>
                    ((data.os && data.os.some(os => os.includes(ucAPI.os))) || !data.os) &&
                    ((data.fork && data.fork.some(fork => fork.includes(ucAPI.getFork()))) || !data.fork) &&
                    ((data.notFork && !data.notFork.some(fork => fork.includes(ucAPI.getFork()))) || !data.notFork)
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
            if (e.key === "Enter") {
                installCustom();
            }
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
                "id": "version-indicator",
                "label": `Current: <b>${Services.prefs.getStringPref("sine.version")}</b> | ` +
                    `Latest: <b>${Services.prefs.getStringPref("sine.latest-version")}</b>`,
            },
            {
                "type": "button",
                "id": "install-update",
                "label": "Install update",
                "action": async () => {
                    const engine = await updates.fetch();
                    await updates.updateEngine(engine);
                },
                "indicator": checkIcon,
                "conditions": [
                    {
                        "not": {
                            "property": "sine.latest-version",
                            "value": Services.prefs.getStringPref("sine.version")
                        }
                    }
                ],
            },
            {
                "type": "button",
                "id": "restart",
                "label": "Restart to apply changes",
                "action": () => ucAPI.restart(true),
                "conditions": [
                    {
                        "if": {
                            "property": "sine.engine.pending-restart",
                            "value": true
                        }
                    }
                ],
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
                "property": "sine.engine.auto-update",
                "defaultValue": true,
                "label": "Enables engine auto-updating.",
            }
        ];

        for (const pref of settingPrefs) {
            let prefEl = this.parsePrefs(pref);

            if (pref.type === "string") {
                prefEl.addEventListener("change", () => {
                    this.initMarketplace();
                });
            }

            if (pref.property === "sine.enable-dev") {
                prefEl.addEventListener("click", () => {
                    const commandPalette = ucAPI.globalDoc.querySelector(".sineCommandPalette");
                    if (commandPalette) {
                        commandPalette.remove();
                    }

                    initDev();
                });
            }

            const newSettingsContent = newSettingsDialog.querySelector(".sineItemPreferenceDialogContent");
            if (prefEl) {
                newSettingsContent.appendChild(prefEl);
            } else if (pref.type === "button") {
                const buttonTrigger = async (callback, btn) => {
                    btn.disabled = true;
                    await callback();
                    btn.disabled = false;

                    newSettingsContent.querySelector("#version-indicator").innerHTML =
                        `Current: <b>${Services.prefs.getStringPref("sine.version")}</b> | ` +
                        `Latest: <b>${Services.prefs.getStringPref("sine.latest-version")}</b>`;

                    if (btn === prefEl) {
                        btn.style.display = "none";
                    }
                }

                if (pref.id === "version-indicator") {
                    prefEl = appendXUL(newSettingsContent, `
                        <hbox id="version-container">
                            <p id="version-indicator">${pref.label}</p>
                            <button id="sineMarketplaceRefreshButton"></button>
                        </hbox>
                    `);

                    prefEl.children[1].addEventListener("click", () => {
                        buttonTrigger(async () => {
                            await updates.checkForUpdates();
                        }, prefEl.children[1]);
                    });
                } else {
                    prefEl = appendXUL(newSettingsContent, `
                        <button class="settingsBtn" id="${pref.id}">${pref.label}</button>
                    `);

                    prefEl.addEventListener("click", () => buttonTrigger(pref.action, prefEl));
                }
            }

            if (pref.conditions) {
                this.setupPrefObserver(pref);
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
        
        let modsDisabled = Services.prefs.getBoolPref("sine.mods.disable-all", false);

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
            modsDisabled = !Services.prefs.getBoolPref("sine.mods.disable-all", false);
            Services.prefs.setBoolPref("sine.mods.disable-all", modsDisabled);
            groupToggle.title =
                `${Services.prefs.getBoolPref("sine.mods.disable-all", false) ? "Enable" : "Disable"} all mods`;
            manager.rebuildMods();
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
            
                const installedMods = await utils.getMods();
                const mods = JSON.parse(content);
            
                for (const mod of mods) {
                    installedMods[mod.id] = mod;
                    await this.installMod(mod.homepage, false);
                }

                await IOUtils.writeJSON(utils.modsDataFile, installedMods);

                this.loadPage();
                this.loadMods();
                manager.rebuildMods();
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
                const mods = await utils.getMods();
                let modsJson = [];
                for (const mod of Object.values(mods)) {
                    modsJson.push(mod);
                }
                modsJson = JSON.stringify(modsJson, null, 2);
                const blob = new Blob([modsJson], { type: "application/json" });
              
                temporalUrl = URL.createObjectURL(blob);
                // Creating a link to download the JSON file
                temporalAnchor = document.createElement("a");
                temporalAnchor.href = temporalUrl;
                temporalAnchor.download = "sine-mods-export.json";
              
                document.body.appendChild(temporalAnchor);
                temporalAnchor.click();
                temporalAnchor.remove();
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
        if (location.hash === "#zenMarketplace" || location.hash === "#sineMods") {
            this.sineIsActive = true;
        }

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

    async init() {
        this.initSkeleton();
        if (ucAPI.getFork() === "zen") {
            this.removeZenMods();
        }
        
        // Inject settings styles.
        import("chrome://userscripts/content/engine/styles/settings.js");

        this.initSine();
        this.loadMods();
        this.updateMods("auto");
    },
}

window.SineAPI = {
    utils,
    manager,
};

// Initialize Sine directory and file structure.
const modsJSON = utils.modsDataFile;
const chromeFile = utils.chromeFile;
const contentFile = utils.contentFile;

if (!await IOUtils.exists(modsJSON)) {
    await IOUtils.writeUTF8(modsJSON, "{}");
}

if (!await IOUtils.exists(chromeFile)) {
    await IOUtils.writeUTF8(chromeFile, "");
}

if (!await IOUtils.exists(contentFile)) {
    await IOUtils.writeUTF8(contentFile, "");
}

// Initialize the main process.
if (ucAPI.mainProcess) {
    // Initialize fork pref that is used in mods.
    Services.prefs.setIntPref("sine.fork-id", ucAPI.getFork(true));

    // Delete and transfer old zen files to the new Sine structure (if using Zen.)
    if (ucAPI.getFork() === "zen") {
        try {
            const zenMods = await gZenMods.getMods();
            if (Object.keys(zenMods).length > 0) {
                const sineMods = await utils.getMods();
                await IOUtils.writeUTF8(modsJSON, JSON.stringify({...sineMods, ...zenMods}));

                const zenModsPath = gZenMods.modsRootPath;
                for (const id of Object.keys(zenMods)) {
                    await IOUtils.copy(PathUtils.join(zenModsPath, id), utils.modsDir, { recursive: true });   
                }
            
                // Delete old Zen-related mod data.
                await IOUtils.remove(gZenMods.modsDataFile);
                await Sine.removeDir(zenModsPath);

                // Refresh the mod data to hopefully deregister the zen-themes.css file.
                gZenMods.triggerModsUpdate();

                // Remove zen-themes.css after all other data has been deregistered and/or removed.
                IOUtils.remove(PathUtils.join(ucAPI.sysChromeDir, "zen-themes.css"));
            }
        } catch (err) {
            console.warn("Error copying Zen mods: " + err);
            if (String(err).includes("NS_ERROR_FILE_DIR_NOT_EMPTY")) {
                ucAPI.showToast([
                    "Error copying Zen mods.",
                    "Attempted to add a mod that already exists."
                ]);
            } else {
                ucAPI.showToast(
                    [
                        "Error copying Zen mods.",
                        "Check Ctrl+Shift+J for more info."
                    ],
                    0
                );
            }
        }
        delete window.gZenMods;
    }

    manager.rebuildMods();

    // Initialize window listener.
    manager.initWinListener();

    // Initialize toast manager.
    ucAPI.initToastManager();

    const initWindow = Sine.initWindow();
    initDev();

    injectAPI();

    import("chrome://userscripts/content/engine/styles/main.js");

    await initWindow;
} else {
    Sine.init();
}
