// ==UserScript==
// @include   main
// @include   about:preferences*
// @include   about:settings*
// @ignorecache
// ==/UserScript==

import * as UC_API from "chrome://userchromejs/content/uc_api.sys.mjs";
// Allow writing outside of the resources folder.
UC_API.Prefs.set("userChromeJS.allowUnsafeWrites", true);
// Allow script to run on about:preferences/settings page.
UC_API.Prefs.set("userChromeJS.persistent_domcontent_callback", true);
// If auto-updating not set, set to true.
if (!UC_API.Prefs.get("sine.auto-updates").exists()) UC_API.Prefs.set("sine.auto-updates", true);
if (!UC_API.Prefs.get("sine.script.auto-update").exists()) UC_API.Prefs.set("sine.script.auto-update", true);
if (!UC_API.Prefs.get("sine.is-cool").exists()) UC_API.Prefs.set("sine.is-cool", true);
if (!UC_API.Prefs.get("sine.editor.theme").exists()) UC_API.Prefs.set("sine.editor.theme", "atom-one-dark");

console.log("Sine is active!");

const Sine = {
    XUL: "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
    storeURL: "https://cosmocreeper.github.io/Sine/latest.json",
    scriptURL: "https://cosmocreeper.github.io/Sine/sine.uc.mjs",
    updatedAt: "2025-05-27 21:34",
    version: "1.1.8",

    restartBrowser() {
        Services.startup.quit(Services.startup.eAttemptQuit | Services.startup.eRestart);
    },

    async fetch(url, forceText=false) {
        UC_API.Prefs.set("sine.fetch-url", url);
        return new Promise(resolve => {
            const listener = UC_API.Prefs.addListener("sine.fetch-url", async () => {
                UC_API.Prefs.removeListener(listener);
                let response = await UC_API.SharedStorage.widgetCallbacks.get("fetch-results");
                try {
                    if (!forceText) response = JSON.parse(response);
                } catch {}
                resolve(response);
            });
        });
    },

    async process(action) {
        UC_API.Prefs.set("sine.process", action);
        return new Promise((resolve) => {
            const listener = UC_API.Prefs.addListener("sine.process", () => {
                UC_API.Prefs.removeListener(listener);
                resolve("complete");
            });
        });
    },

    mapLegacyObj(obj) {
        return Object.fromEntries(
          Object.entries(obj).filter(([key]) => /theme/i.test(key)).map(([key, value]) => {
              const foundString = key.match(/theme/i)[0];
              const replacement = foundString === foundString.toLowerCase() ? "mod" : "Mod";
              return [key.replace(/theme/gi, replacement), value];
          })
        );
    },

    get utils() {
        return typeof ZenThemesCommon !== "undefined" ? {
            ...ZenThemesCommon,
            ...this.mapLegacyObj(ZenThemesCommon),
            "legacy": true
         } : gZenMods;
    },

    get manager() {
        return this.utils.hasOwnProperty("legacy") ? {
            ...gZenMarketplaceManager,
            ...this.mapLegacyObj(gZenMarketplaceManager)
        } : gZenMarketplaceManager;
    },

    set doNotRebuildModsList(value) {
        this.utils.hasOwnProperty("legacy") ?
            gZenMarketplaceManager._doNotRebuildThemesList = value :
            gZenMarketplaceManager._doNotRebuildModsList = value;
    },

    get os() {
        return gZenOperatingSystemCommonUtils.currentOperatingSystem;
    },

    get chromeDir() {
        const chromeDir = UC_API.FileSystem.chromeDir().fileURI.replace("file:///", "").replace(/%20/g, " ");
        return this.os === "windows" ? chromeDir.replace(/\//g, "\\") : "/" + chromeDir;
    },

    get autoUpdates() {
        return UC_API.Prefs.get("sine.auto-updates").value;
    },

    set autoUpdates(newValue) {
        UC_API.Prefs.set("sine.auto-updates", newValue);
    },

    async updateScript(mainProcess=true) {
        const data = mainProcess ? await fetch(this.scriptURL).then(res => res.text()).catch(err => console.warn(err)) :
            await this.fetch(this.scriptURL).catch(err => console.warn(err));
        await UC_API.FileSystem.writeFile("../JS/sine.uc.mjs", data);
    },

    async initWindow() {
        const latest = await fetch(this.storeURL).then(res => res.json()).catch(err => console.warn(err));
        if (latest) {
            this.modGitHubs = latest.marketplace;
            if (UC_API.Prefs.get("sine.script.auto-update").value && new Date(latest.updatedAt) > new Date(this.updatedAt)) {
                await this.updateScript();
                if (UC_API.Prefs.get("sine.script.auto-restart").value)
                    this.restartBrowser();
                else
                    UC_API.Notifications.show({
                        priority: "system",
                        label: `Sine has been updated to version ${latest.version}. Please restart your browser for these changes to take effect.`,
                        buttons: [{
                            label: "Restart",
                            callback: () => {
                                this.restartBrowser();
                                return false;
                            }
                        }]
                    });
            }
        }
    },

    rawURL(repo) {
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
        if (themeData.js) {
            var jsPath = PathUtils.join(this.chromeDir, "JS");
            var jsFileLoc = PathUtils.join(jsPath, themeData.id + "_");
        }
        if (remove) {
            await this.manager.disableMod(themeData.id);
            this.doNotRebuildModsList = true;
            if (themeData.hasOwnProperty("js")) {
                for (const file of themeData["editable-files"].find(item => item.directory === "js").contents) {
                    await IOUtils.writeUTF8(jsFileLoc + file.replace(/[a-z]+\.m?js$/, "db"), await IOUtils.readUTF8(jsFileLoc + file));
                    await IOUtils.remove(jsFileLoc + file, { ignoreAbsent: true });
                }
                UC_API.Notifications.show({
                    window: window.top,
                    type: "my-button-js",
                    priority: "warning",
                    label: "A mod utilizing JS has been disabled. For usage of it to be fully halted, restart your browser.",
                    buttons: [{
                      label: "Restart",
                      callback: (notification) => {
                          this.restartBrowser();
                          return true;
                      }
                    }]
                });
            }
        } else {
            await this.manager.enableMod(themeData.id);
            this.doNotRebuildModsList = true;
            if (themeData.hasOwnProperty("js")) {
                for (const file of themeData["editable-files"].find(item => item.directory === "js").contents) {
                    await IOUtils.writeUTF8(jsFileLoc + file, await IOUtils.readUTF8(jsFileLoc + file.replace(/[a-z]+\.m?js$/, "db")));
                    await IOUtils.remove(jsFileLoc + file.replace(/[a-z]+\.m?js$/, "db"), { ignoreAbsent: true });
                }
                UC_API.Notifications.show({
                    priority: "warning",
                    label: "A mod utilizing JS has been enabled. For usage of it to be fully restored, restart your browser.",
                    buttons: [{
                      label: "Restart",
                      callback: (notification) => {
                          this.restartBrowser();
                          return true;
                      }
                    }]
                });
            }
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
        if (pref.hasOwnProperty("disabledOn") && pref.disabledOn.includes(this.os)) return;

        const docName = {
            "separator": "div",
            "checkbox": "checkbox",
            "dropdown": "hbox",
            "text": "p",
            "string": "hbox"
        }

        let prefEl;
        if (docName.hasOwnProperty(pref.type)) prefEl = document.createElement(docName[pref.type]);
        else prefEl = pref.type;
        if (pref.hasOwnProperty("property")) prefEl.id = pref.property.replace(/\./g, "-");

        if (pref.hasOwnProperty("label")) {
            pref.label = this.formatMD(pref.label);
        } if (pref.hasOwnProperty("property") && pref.type !== "separator") {
            prefEl.title = pref.property;
        } if (pref.hasOwnProperty("margin")) {
            prefEl.style.margin = pref.margin;
        } if (pref.hasOwnProperty("size")) {
            prefEl.style.fontSize = pref.size;
        }

        if ((pref.type === "string" || pref.type === "dropdown") && pref.hasOwnProperty("label")) {
            const hboxLabel = document.createElement("label");
            hboxLabel.className = "zenThemeMarketplaceItemPreferenceLabel";
            hboxLabel.innerHTML = pref.label;
            prefEl.appendChild(hboxLabel);
        }

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
            prefEl.className = "zenThemeMarketplaceItemPreferenceCheckbox";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            prefEl.appendChild(checkbox);
            if (pref.hasOwnProperty("label")) {
                const checkLabel = document.createElement("label");
                checkLabel.className = "checkbox-label";
                checkLabel.innerHTML = pref.label;
                prefEl.appendChild(checkLabel);
            }
        } else if (pref.type === "dropdown") {
            const menulist = document.createElementNS(this.XUL, "menulist");
            const menupopup = document.createElementNS(this.XUL, "menupopup");
            menupopup.className = "in-menulist";
            const defaultMatch = pref.options.find(item => item.value === pref.defaultValue || item.value === pref.default);
            if (pref.placeholder !== false) {
                menulist.setAttribute("label", pref.placeholder ?? "None");
                menulist.setAttribute("value", defaultMatch ? "none" : pref.defaultValue ?? pref.default ?? "none");
                const menuitem = document.createElementNS(this.XUL, "menuitem");
                menuitem.setAttribute("value", defaultMatch ? "none" : pref.defaultValue ?? pref.default ?? "none");
                menuitem.setAttribute("label", pref.placholder ?? "None");
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
                const menuitem = document.createElementNS(this.XUL, "menuitem");
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
                this.manager._triggerBuildUpdateWithoutRebuild();
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
                this.manager._triggerBuildUpdateWithoutRebuild();
                if (pref.hasOwnProperty("border") && pref.border === "value") input.style.borderColor = input.value;
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
            });
        }

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
        if (operator === "OR") return selectors.map(s => `dialog[open] .zenThemeMarketplaceItemPreferenceDialogContent${s} #${id}`).join(", ");
        else return `dialog[open] .zenThemeMarketplaceItemPreferenceDialogContent${selectors.join("")} #${id}`;
    },

    injectDynamicCSS(pref) {
        const styleEl = document.createElement("style");
        const identifier = pref.id ?? pref.property;
        const targetId = identifier.replace(/\./g, "-");
        const selector = this.generateSelector(pref.conditions, pref.operator || "OR", targetId);
        styleEl.textContent = `
            #${targetId} {
                display: none;
            }
            ${selector} {
                display: flex;
            }
        `;
        document.head.appendChild(styleEl);
    },

    async loadMods() {
        await this.waitForElm(".zenThemeMarketplaceItem");
        document.querySelectorAll(".zenThemeMarketplaceItem").forEach((el) => el.remove());
        const installedMods = await this.utils.getMods();
        const sortedArr = Object.values(installedMods).sort((a, b) => a.name.localeCompare(b.name));
        const ids = sortedArr.map(obj => obj.id);
        for (const key of ids) {
            const modData = installedMods[key];
            // Create new item.
            const item = document.createElement("vbox");
            item.className = "zenThemeMarketplaceItem";

            // Create new content.
            const content = document.createElement("vbox");
            content.className = "zenThemeMarketplaceItemContent";
            // Create new header
            const header = document.createElement("hbox");
            header.id = "zenThemeMarketplaceItemContentHeader";
            header.innerHTML = `
                <label>
                    <h3 class="zenThemeMarketplaceItemTitle">${modData.name} (v${modData.version})</h3>
                </label>
            `;
            // Create new toggle button.
            const toggle = document.createElement("moz-toggle");
            toggle.className = "zenThemeMarketplaceItemPreferenceToggle";
            toggle.title = `${modData.enabled ? "Disable" : "Enable"} mod`;
            if (modData.enabled)
                toggle.setAttribute("pressed", "true");
            // Logic to disable mod.
            toggle.addEventListener("click", async () => {
                const themes = await this.utils.getMods();
                const theme = themes[modData.id];
                await this.toggleTheme(theme, theme.enabled);
                toggle.title = `${theme.enabled ? "Enable" : "Disable"} mod`;
                await this.loadMods();
            });
            header.appendChild(toggle);
            // Append new header
            content.appendChild(header);
            // Create and append new description.
            const description = document.createElement("description");
            description.className = "description-deemphasized zenThemeMarketplaceItemDescription";
            description.textContent = modData.description;
            content.appendChild(description);
            // Append new content.
            item.appendChild(content);

            // Create new actions.
            const actions = document.createElement("hbox");
            actions.className = "zenThemeMarketplaceItemActions";

            // Create new dialog.
            const dialog = document.createElement("dialog");
            dialog.className = "zenThemeMarketplaceItemPreferenceDialog";

            if (modData.enabled && modData.hasOwnProperty("preferences")) {
                // Create new top bar.
                const topbar = document.createElement("div");
                topbar.className = "zenThemeMarketplaceItemPreferenceDialogTopBar";
                topbar.innerHTML = `<h3 class="zenThemeMarketplaceItemTitle">${modData.name} (v${modData.version})</h3>`;
                // Create and append new close button.
                const close = document.createElement("button");
                close.textContent = "Close";
                close.addEventListener("click", () => dialog.close());
                topbar.appendChild(close);
                // Append new top bar.
                dialog.appendChild(topbar);
                // Create new preferences content.
                const prefs = document.createElement("div");
                prefs.className = "zenThemeMarketplaceItemPreferenceDialogContent";
                const modPrefs = await this.utils.getModPreferences(modData);
                for (const pref of modPrefs) {
                    const prefEl = this.parsePrefs(pref);
                    if (prefEl && typeof prefEl !== "string") prefs.appendChild(prefEl);
                    if (pref.hasOwnProperty("conditions")) this.injectDynamicCSS(pref);
                }

                // Append new preferences content.
                dialog.appendChild(prefs);

                // Append new dialog.
                item.appendChild(dialog);

                // Create and append new settings button.
                const settings = document.createElement("button");
                settings.className = "zenThemeMarketplaceItemConfigureButton";
                settings.title = "Open settings";
                settings.addEventListener("click", () => dialog.showModal());
                actions.appendChild(settings);
            }
            
            // Create and append new homepage button.
            const homepage = document.createElement("button");
            homepage.className = "zenThemeMarketplaceItemHomepageButton";
            homepage.addEventListener("click", () => window.open(modData.homepage, "_blank"));
            homepage.title = "Visit homepage";
            actions.appendChild(homepage);
            // Create and append new updating button.
            const updateButton = document.createElement("button");
            updateButton.className = "auto-update-toggle";
            if (modData["no-updates"]) updateButton.setAttribute("enabled", true);
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
            updateButton.innerHTML = `<svg viewBox="-4 -4 32 32" id="update-disabled" data-name="Flat Line Disabled" xmlns="http://www.w3.org/2000/svg" class="icon flat-line"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path id="primary" d="M4,12A8,8,0,0,1,18.93,8" style="fill: none; stroke: #000000; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2;"></path><path id="primary-2" data-name="primary" d="M20,12A8,8,0,0,1,5.07,16" style="fill: none; stroke: #000000; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2;"></path><polyline id="primary-3" data-name="primary" points="14 8 19 8 19 3" style="fill: none; stroke: #000000; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2;"></polyline><polyline id="primary-4" data-name="primary" points="10 16 5 16 5 21" style="fill: none; stroke: #000000; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2;"></polyline><line x1="4" y1="4" x2="20" y2="20" stroke="#000000" stroke-width="2" stroke-linecap="round"/></g></svg>`;
            updateButton.title = `${modData["no-updates"] ? "Enable" : "Disable"} updating for this mod`;
            actions.appendChild(updateButton);
            // Create new remove mod button.
            const remove = document.createElement("button");
            remove.className = "zenThemeMarketplaceItemUninstallButton";
            remove.dataset.l10nId = "zen-theme-marketplace-remove-button";
            remove.addEventListener("click", async () => {
                if (window.confirm("Are you sure you want to remove this mod?")) {
                    remove.disabled = true;
                    await this.manager.removeMod(modData.id);
                    this.doNotRebuildModsList = true;
                    await this.loadPage(document.querySelector("#sineInstallationList"), document.querySelector("#navigation-container"));
                    if (modData.hasOwnProperty("js")) {
                        for (const file of modData["editable-files"].find(item => item.directory === "js").contents) {
                            const jsPath = PathUtils.join(PathUtils.join(this.chromeDir, "JS"), `${modData.id}_${modData.enabled ? file : file.replace(/[a-z]+\.m?js$/, "db")}`);
                            await IOUtils.remove(jsPath);
                        }
                        UC_API.Notifications.show({
                            priority: "warning",
                            label: "A mod utilizing JS has been removed. For usage of it to be fully halted, restart your browser.",
                            buttons: [{
                              label: "Restart",
                              callback: (notification) => {
                                  this.restartBrowser();
                                  return true;
                              }
                            }]
                        });
                    }
                    await this.loadMods();
                }
            });
            // Create and append new remove mod child hbox.
            const removeChild = document.createElement("hbox");
            removeChild.className = "box-inherit button-box";
            removeChild.innerHTML = `<label class="button-box">Remove mod</label>`;
            remove.appendChild(removeChild);
            // Append new remove mod button.
            actions.appendChild(remove);
            // Append new actions.
            item.appendChild(actions);

            // Append item to the marketplace list.
            document.querySelector("#zenThemeMarketplaceList").appendChild(item);
        }
    },

    addToEditableFiles(editableFiles, path) {
        const parts = path.split("/");
        let currentLevel = editableFiles;
        for (let i = 0; i < parts.length - 1; i++) {
          const dirName = parts[i];
          let dirObj = currentLevel.find(item => typeof item === "object" && item.directory ===   dirName);
          if (!dirObj) {
            dirObj = { directory: dirName, contents: [] };
            currentLevel.push(dirObj);
          }
          currentLevel = dirObj.contents;
        }
        const fileName = parts[parts.length - 1];
        if (!currentLevel.includes(fileName)) {
          currentLevel.push(fileName);
        }
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

    async processCSS(currentPath, cssContent, originalURL, mozDocumentRule, themeFolder, editableFiles) {
        originalURL = originalURL.split("/");
        originalURL.pop();
        const repoBaseUrl = originalURL.join("/") + "/";
        const importRegex = /@import\s+(?:url\(['"]?([^'")]+)['"]?\)|['"]([^'"]+)['"])\s*;/g;

        const importMatches = [];
        let match;
        while ((match = importRegex.exec(cssContent)) !== null) {
            importMatches.push(match);
        }
    
        let actualCSS = "";
        if (importMatches.length > 0) {
            const lastImportEnd = importMatches[importMatches.length - 1].index + importMatches[importMatches.length - 1][0].length;
            actualCSS = cssContent.slice(lastImportEnd).trim();
        } else actualCSS = cssContent.trim();
    
        const importStatements = importMatches.map(match => match[0]);
        const imports = importMatches.map(match => match[1] || match[2]);
    
        for (const importPath of imports) {
            if (importPath.endsWith(".css") && !this.doesPathGoBehind(currentPath, importPath)) {
                const splicedPath = currentPath.split("/").slice(0, -1).join("/");
                const completePath = splicedPath ? splicedPath + "/" : splicedPath;
                const resolvedPath = completePath + importPath.replace(/(?<!\.)\.\//g, "");
                const fullUrl = new URL(resolvedPath, repoBaseUrl).href;
                const importedCss = await this.fetch(fullUrl);
                editableFiles = await this.processCSS(resolvedPath, importedCss, repoBaseUrl, mozDocumentRule, themeFolder, editableFiles);
            }
        }
    
        let newCssContent = importStatements.join("\n");
        if (actualCSS) {
            if (mozDocumentRule) newCssContent += `\n@-moz-document ${mozDocumentRule} {\n${actualCSS}  \n}`;
            else newCssContent += `\n${actualCSS}`;
        }
    
        // Add the current file to the editableFiles structure before writing
        this.addToEditableFiles(editableFiles, currentPath);
    
        if (this.os === "windows") currentPath = "\\" + currentPath.replace(/\//g, "\\");
        else currentPath = "/" + currentPath;
        await IOUtils.writeUTF8(themeFolder + currentPath, newCssContent);
        return editableFiles;
    },

    async processRootCSS(rootFileName, repoBaseUrl, themeFolder, editableFiles) {
        let mozDocumentRule;
        if (rootFileName === "userChrome") mozDocumentRule = "url-prefix(\"chrome:\")";
        if (rootFileName === "userContent") mozDocumentRule = "regexp(\"^(?!chrome:).*\")";
        const rootPath = `${rootFileName}.css`;
    
        const rootCss = await this.fetch(repoBaseUrl);
    
        await this.processCSS(rootPath, rootCss, repoBaseUrl, mozDocumentRule, themeFolder, editableFiles);
        return editableFiles;
    },

    async removeOldFiles(themeFolder, oldFiles, newFiles, newThemeData, isRoot=true) {
        for (const file of oldFiles) {
            if (typeof file === "string") {
                if (isRoot && file === "js") {
                    const jsDirPath = PathUtils.join(this.chromeDir, "JS");
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
                    const jsDirPath = PathUtils.join(this.chromeDir, "JS");
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
        await IOUtils.remove(PathUtils.join(themeFolder, "chrome.css"), { ignoreAbsent: true });
        newThemeData["editable-files"] = [];
        let newCSSData = "";
        if (newThemeData.style.hasOwnProperty("chrome") || newThemeData.style.hasOwnProperty("content")) {
            if (newThemeData.style.hasOwnProperty("chrome")) {
                newCSSData = `@import "./userChrome.css";`;
                let chrome = await this.fetch(newThemeData.style.chrome).catch(err => console.error(err));
                chrome = `@-moz-document url-prefix("chrome:") {\n  ${chrome}\n}`;
                newThemeData["editable-files"] = await this.processRootCSS("userChrome", newThemeData.style.chrome, themeFolder, newThemeData["editable-files"]);
            } if (newThemeData.style.hasOwnProperty("content")) {
                newCSSData += `\n@import "./userContent.css";`;
                let content = await this.fetch(newThemeData.style.content).catch(err => console.error(err));
                content = `@-moz-document regexp("^(?!chrome:).*") {\n  ${content}\n}`;
                newThemeData["editable-files"] = await this.processRootCSS("userContent", newThemeData.style.content, themeFolder, newThemeData["editable-files"]);
            }
            newThemeData["editable-files"].push("chrome.css");
        } else {
            newCSSData = await this.fetch(newThemeData.style).catch(err => console.error(err));
            newThemeData["editable-files"] = await this.processRootCSS("chrome", newThemeData.style, themeFolder, newThemeData["editable-files"]);
        }
        await IOUtils.writeUTF8(PathUtils.join(themeFolder, "chrome.css"), newCSSData);
        return newThemeData["editable-files"];
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

    async createThemeJSON(repo, theme={}, mainProcess=false) {
        const localFetch = async (url) => {
            let response;
            if (mainProcess) {
                response = await fetch(url).then(res => res.text());
                try {
                    response = JSON.parse(response);
                } catch {}
             } else response = await this.fetch(url);
             return response;
        }
        const translateToAPI = (input) => {
            const trimmedInput = input.trim().replace(/\/+$/, "");
            const regex = /(?:https?:\/\/github\.com\/)?([\w\-.]+)\/([\w\-.]+)/i;
            const match = trimmedInput.match(regex);
            if (!match) return null;
            const user = match[1];
            const repo = match[2];
            return `https://api.github.com/repos/${user}/${repo}`;
        }
        const notNull = (data) =>
            typeof data === "object" || (typeof data === "string" && data.toLowerCase() !== "404: not found");
        const shouldApply = (property) => !theme.hasOwnProperty(property) ||
            ((property === "style" || property === "preferences" || property === "readme" || property === "image")
                && typeof theme[property] === "string" && theme[property].startsWith("https://raw.githubusercontent.com/zen-browser/theme-store"));

        const repoRoot = this.rawURL(repo);
        const githubAPI = await localFetch(translateToAPI(repo));

        const setProperty = async (property, value, ifValue=true, nestedProperty=false, escapeNull=false) => {
            if (typeof ifValue === "string") ifValue = await localFetch(ifValue).then(res => notNull(res));
            if (notNull(value) && ifValue && (shouldApply(property) || escapeNull)) {
                if (!nestedProperty) theme[property] = value;
                else theme[property][nestedProperty] = value;
            }
        }

        if (!mainProcess) {
            await setProperty("homepage", githubAPI.html_url);

            await setProperty("style", repoRoot + "chrome.css", `${repoRoot}chrome.css`);
            if (!theme.hasOwnProperty("style")) {
                theme.style = {};
                await setProperty("style", repoRoot + "userChrome.css", `${repoRoot}userChrome.css`, "chrome", true);
                await setProperty("style", repoRoot + "userContent.css", `${repoRoot}userContent.css`, "content", true);
            }
            await setProperty("preferences", repoRoot + "preferences.json", `${repoRoot}preferences.json`);
            await setProperty("readme", repoRoot + "README.md", `${repoRoot}README.md`);
            await setProperty("readme", repoRoot + "readme.md", `${repoRoot}readme.md`);
            let randomID = this.generateRandomId();
            const themes = await this.utils.getMods();
            while (themes.hasOwnProperty(randomID)) {
                randomID = this.generateRandomId();
            }
            await setProperty("id", randomID);
            const silkthemesJSON = await localFetch(`${repoRoot}bento.json`);
            if (notNull(silkthemesJSON) && silkthemesJSON.hasOwnProperty("package")) {
                const silkPackage = silkthemesJSON.package;
                await setProperty("name", silkPackage.name);
                await setProperty("author", silkPackage.author);
                await setProperty("version", silkPackage.version);
            } else {
                await setProperty("name", githubAPI.name);
                const releasesData = await localFetch(`${translateToAPI(repo)}/releases/latest`);
                await setProperty("version", releasesData.hasOwnProperty("tag_name") ? releasesData.tag_name.replace("v", "") : "1.0.0");
            }
            await setProperty("description", githubAPI.description);
            await setProperty("createdAt", githubAPI.created_at);
        }
        await setProperty("updatedAt", githubAPI.updated_at);

        return theme;
    },

    async handleJS(newThemeData) {
        let dir = { "directory": "js", "contents": [] };
        if (UC_API.Prefs.get("sine.allow-unsafe-js").value &&
           (typeof newThemeData.js === "string" || typeof newThemeData.js === "array")) {
            const jsFiles = typeof newThemeData.js === "string" ? [newThemeData.js] : newThemeData.js;
            for (const file of jsFiles) {
                const fileContents = await this.fetch(file).catch(err => console.error(err));
                if (typeof fileContents === "string" && fileContents.toLowerCase() !== "404: not found") {
                    const fileName = file.split("/").pop();
                    await IOUtils.writeUTF8(PathUtils.join(PathUtils.join(this.chromeDir, "JS"), newThemeData.id + "_" + fileName), fileContents);
                    dir.contents.push(fileName);
                }
            }
        } else {
            const dirLink = `https://api.github.com/repos/CosmoCreeper/Sine/contents/mods/${newThemeData.id}`;
            const newFiles = await this.fetch(dirLink).catch(err => console.warn(err));
            for (const file of newFiles) {
                const fileContents = await this.fetch(file.download_url).catch(err => console.error(err));
                if (typeof fileContents === "string" && fileContents.toLowerCase() !== "404: not found") {
                    await IOUtils.writeUTF8(PathUtils.join(PathUtils.join(this.chromeDir, "JS"), newThemeData.id + "_" + file.name), fileContents);
                    dir.contents.push(file.name);
                }
            }
        }
        newThemeData["editable-files"].push(dir);
        return newThemeData["editable-files"];
    },

    async installMod(repo) {
        const currThemeData = await this.utils.getMods();
    
        const newThemeData = await this.fetch(`${this.rawURL(repo)}theme.json`)
            .then(async res => typeof res !== "object" && res.toLowerCase() === "404: not found" ? 
                  await this.createThemeJSON(repo) : await this.createThemeJSON(repo, res));
        if (typeof newThemeData.style === "object" && Object.keys(newThemeData.style).length === 0) delete newThemeData.style;
        if (newThemeData) {
            const themeFolder = this.utils.getModFolder(newThemeData.id);
            newThemeData["editable-files"] = [];
            if (newThemeData.hasOwnProperty("style")) {
                newThemeData["editable-files"] = await this.parseStyles(themeFolder, newThemeData);
            } if (newThemeData.hasOwnProperty("preferences")) {
                const newPrefData = await this.fetch(newThemeData.preferences, true).catch(err => console.error(err));
                await IOUtils.writeUTF8(PathUtils.join(themeFolder, "preferences.json"), newPrefData);
                newThemeData["editable-files"].push("preferences.json");
            } if (newThemeData.hasOwnProperty("readme")) {
                const newREADMEData = await this.fetch(newThemeData.readme).catch(err => console.error(err));
                await IOUtils.writeUTF8(PathUtils.join(themeFolder, "readme.md"), newREADMEData);
                newThemeData["editable-files"].push("readme.md");
            } if (newThemeData.hasOwnProperty("js")) newThemeData["editable-files"] = await this.handleJS(newThemeData);
        
            newThemeData["no-updates"] = false;
            newThemeData.enabled = true;
            currThemeData[newThemeData.id] = newThemeData;
            await IOUtils.writeJSON(this.utils.modsDataFile, currThemeData);

            await this.manager._triggerBuildUpdateWithoutRebuild();
            this.doNotRebuildModsList = true;
            if (newThemeData.hasOwnProperty("js"))
                UC_API.Notifications.show({
                    priority: "warning",
                    label: "A mod utilizing JS has been installed. For it to work properly, restart your browser.",
                    buttons: [{
                      label: "Restart",
                      callback: (notification) => {
                          this.restartBrowser();
                          return true;
                      }
                    }]
                });
            await this.loadMods();
        }
    },

    async checkForUpdates() {
        if (this.autoUpdates) {
            const currThemeData = await this.utils.getMods();
            for (const key in currThemeData) {
                const currModData = currThemeData[key];
                let newThemeData;
                if (currModData.hasOwnProperty("homepage") && currModData.homepage) {
                    newThemeData = await fetch(`${this.rawURL(currModData.homepage)}theme.json`).then(res => res.text()).catch(err => console.warn(err));
                    if (newThemeData) {
                        if (typeof newThemeData !== "object" && newThemeData.toLowerCase() === "404: not found")
                            newThemeData = await this.createThemeJSON(currModData.homepage, {}, true);
                        else newThemeData = await this.createThemeJSON(currModData.homepage, JSON.parse(newThemeData), true).catch(err => console.warn(err));
                        newThemeData.id = currModData.id;
                    }
                } else
                    newThemeData = await fetch(`https://raw.githubusercontent.com/zen-browser/theme-store/main/themes/${currModData.id}/theme.json`).then(res => res.json()).catch(err => console.warn(err));
                
                if (currModData.enabled && !currModData["no-updates"] && new Date(currModData.updatedAt) < new Date(newThemeData.updatedAt)) {
                    window.openPreferences();
                    break;
                }
            }
        }
    },

    async updateMods(source) {
        if ((source === "auto" && this.autoUpdates) || source === "manual") {
            const currThemeData = await this.utils.getMods();
            let changeMade = false;
            let changeMadeHasJS = false;
            for (const key in currThemeData) {
                const currModData = currThemeData[key];
                let newThemeData;
                if (currModData.hasOwnProperty("homepage") && currModData.homepage) {
                    newThemeData = await this.fetch(`${this.rawURL(currModData.homepage)}theme.json`);
                    let customData;
                    if (typeof newThemeData !== "object" && newThemeData.toLowerCase() === "404: not found") {
                        customData = await this.createThemeJSON(currModData.homepage);
                        if (currModData.hasOwnProperty("version")) customData.version = currModData.version;
                    } else customData = await this.createThemeJSON(currModData.homepage, newThemeData);
                    customData.id = currModData.id;
                    if (typeof newThemeData.style === "object" && Object.keys(newThemeData.style).length === 0) delete newThemeData.style; 
                    
                    const addProp = (property) =>
                        !customData.hasOwnProperty(property) && currModData.hasOwnProperty(property) ?
                            customData[property] = currModData[property] : null;
                    addProp("style");
                    addProp("readme");
                    addProp("preferences");
                    addProp("image");
                    if (((typeof newThemeData !== "object" && newThemeData.toLowerCase() === "404: not found") || !newThemeData.hasOwnProperty("name")) && currModData.hasOwnProperty("name"))
                        customData.name = currModData.name;
                    newThemeData = customData;
                } else
                    newThemeData = await this.fetch(`https://raw.githubusercontent.com/zen-browser/theme-store/main/themes/${currModData.id}/theme.json`);
                
                if (newThemeData && typeof newThemeData === "object" && currModData.enabled && !currModData["no-updates"] && new Date(currModData.updatedAt) < new Date(newThemeData.updatedAt)) {
                    changeMade = true;
                    const themeFolder = this.utils.getModFolder(newThemeData.id);
                    console.log("Auto-updating: " + currModData.name + "!");
                    newThemeData["editable-files"] = [];

                    if (newThemeData.hasOwnProperty("style")) {
                        newThemeData["editable-files"] = await this.parseStyles(themeFolder, newThemeData);
                    }

                    if (newThemeData.hasOwnProperty("preferences")) {
                        const newPrefData = await this.fetch(newThemeData.preferences, true).catch(err => console.error(err));
                        await IOUtils.writeUTF8(PathUtils.join(themeFolder, "preferences.json"), newPrefData);
                        newThemeData["editable-files"].push("preferences.json");
                    }

                    if (newThemeData.hasOwnProperty("readme")) {
                        const newREADMEData = await this.fetch(newThemeData.readme).catch(err => console.error(err));
                        await IOUtils.writeUTF8(PathUtils.join(themeFolder, "readme.md"), newREADMEData);
                        newThemeData["editable-files"].push("preferences.json");
                    }

                    if (newThemeData.hasOwnProperty("js")) newThemeData["editable-files"] = await this.handleJS(newThemeData);

                    if (newThemeData.hasOwnProperty("js") || currModData.hasOwnProperty("js")) changeMadeHasJS = true;

                    if (currModData.hasOwnProperty("editable-files") && newThemeData.hasOwnProperty("editable-files"))
                        await this.removeOldFiles(themeFolder, currModData["editable-files"], newThemeData["editable-files"], newThemeData);
                    
                    newThemeData["no-updates"] = false;
                    newThemeData.enabled = true;
                    currThemeData[newThemeData.id] = newThemeData;
                    await IOUtils.writeJSON(this.utils.modsDataFile, currThemeData);

                    await this.manager._triggerBuildUpdateWithoutRebuild();
                    this.doNotRebuildModsList = true;
                }
            }
            if (changeMadeHasJS)
                UC_API.Notifications.show({
                    priority: "warning",
                    label: "A mod utilizing JS has been updated. For it to work properly, restart your browser.",
                    buttons: [{
                      label: "Restart",
                      callback: (notification) => {
                          this.restartBrowser();
                          return true;
                      }
                    }]
                });
            if (changeMade) await this.loadMods();
        }
    },

    applySiteStyles() {
        const globalStyleSheet = document.createElement("style");
        globalStyleSheet.textContent = `
            #zenThemeMarketplaceLink, #zenThemeMarketplaceCheckForUpdates, #ZenMarketplaceCategory[hidden] ~ #sineInstallationGroup,
            groupbox:popover-open .description-deemphasized:nth-of-type(2), groupbox:popover-open #sineInstallationCustom,
            #sineInstallationHeader button, .sineInstallationItem > img, .auto-update-toggle[enabled] + .manual-update {
                display: none;
            }
            #sineInstallationGroup {
                margin-bottom: 7px !important;
            }
            #sineInstallationGroup input:focus {
                border-color: transparent;
                box-shadow: 0 0 0 2px var(--zen-primary-color);
                outline: var(--focus-outline);
                outline-offset: var(--focus-outline-inset);
            }
            #sineInstallationHeader {
                display: flex;
                justify-content: space-between;
            }
            #ZenMarketplaceCategory:not([hidden]) ~ #sineInstallationGroup {
                display: block;
            }
            #sineInstallationGroup, #zenMarketplaceGroup {
                border-radius: 5px;
            }
            #sineInstallationList {
                display: grid;
                grid-template-columns: repeat(auto-fit, 194px);
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
            #sineInstallationCustom .zenThemeMarketplaceItemConfigureButton {
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
            .zenThemeMarketplaceItemTitle {
                margin: 0;
            }
            dialog::backdrop, #sineInstallationGroup:popover-open::backdrop {
                background: rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(3px);
            }
            dialog {
                border-radius: 5px;
                width: fit-content;
                max-height: 96vh;
                max-width: 96vw;
                animation: dialogPopin 0.3s ease-out;
                overflow-y: scroll;
                overflow-x: hidden;
                display: none !important;
                padding: 20px !important;
                box-sizing: border-box;
            }
            dialog[open] {
                display: block !important;
            }
            .zenThemeMarketplaceItemPreferenceDialogTopBar {
                align-items: center;
                border-bottom: 1px solid rgba(255, 255, 255, 0.3);
                padding-bottom: 7px;
                margin-bottom: 7px;
            }
            .zenThemeMarketplaceItemPreferenceDialogContent {
                display: block;
                max-width: calc(96vw - 40px);
                width: max-content;
                min-width: 100%;
            }
            .zenThemeMarketplaceItemPreferenceCheckbox {
                margin: var(--space-small) 0;
                margin-right: 10px;
                padding-inline-start: 0;
                align-items: center;
                display: flex;
            }
            .zenThemeMarketplaceItemPreferenceDialogContent div:has(hr) {
                position: relative;
            }
            .zenThemeMarketplaceItemPreferenceDialogContent div:has(hr) * {
                transition: all 150ms ease;
            }
            .zenThemeMarketplaceItemPreferenceDialogContent div hr:has(+ .separator-label[title]:not([checked])) {
                opacity: 0.5;
            }
            .separator-label {
                position: absolute;
                top: 50%;
                margin-left: 14px;
                background: var(--zen-dialog-background);
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
                border: 0;
                position: fixed;
                top: 50%;
                translate: 0% -50%;
                background: var(--zen-dialog-background) !important;
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
                    border-radius: 8px;
                    box-shadow: 0 0 4px rgba(255, 255, 255, 0.2);
                    height: auto;
                    max-height: 20vh;
                    object-fit: contain;
                    max-height: 40vh;
                }
            }
            #navigation-container {
                display: flex;
                justify-content: center;
            }
            #sineInstallationGroup:not(:popover-open) #navigation-container {
                margin-bottom: 8px;
            }
            #zenMarketplaceGroup .indent {
                margin: 0 !important;
            }
            .updates-container {
                display: flex;
            }
            .updates-container *, .updates-container {
                height: 32px;
            }
            .auto-update-toggle, .manual-update {
                cursor: pointer;
            }
            .auto-update-toggle, .zenThemeMarketplaceItemEditButton {
                min-width: 0;
                padding: 0;
                width: 32px;
                height: 32px;
                color: white !important;
                display: flex;
                align-items: center;
            }
            .auto-update-toggle svg, #sineMarketplaceRefreshButton svg {
                filter: invert(1);
            }
            .auto-update-toggle[enabled] {
                background-color: var(--color-accent-primary) !important;
                color: black !important;
            }
            .updates-container .auto-update-toggle[enabled] {
                width: 135px;
            }
            .auto-update-toggle[enabled] svg {
                filter: invert(0);
            }
            .update-indicator {
                margin: 0;
                margin-top: 4px;
                margin-left: 4px;
                display: inline-flex;
            }
            .update-indicator p {
                line-height: 32px;
                margin: 0;
                margin-left: 7px;
            }
            .zenThemeMarketplaceItemPreferenceDialogContent > * {
                padding: 0 5px;
                width: 100%;
            }
            .zenThemeMarketplaceItemPreferenceDialogContent > *:has(hr) {
                padding: 5px 5px 5px 0;
            }
            .zenThemeMarketplaceItemPreferenceDialogContent hbox {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .zenThemeMarketplaceItemPreferenceDialogContent hbox menulist, .zenThemeMarketplaceItemPreferenceDialogContent hbox input {
                display: flex;
            }
            .zenThemeMarketplaceItemPreferenceDialogContent hbox label {
                margin-right: 10px;
            }
            .zenThemeMarketplaceItemPreferenceDialogContent > p {
                padding: 0;
                margin: 0;
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
                .auto-update-toggle svg, #sineMarketplaceRefreshButton svg {
                    filter: invert(0);
                }
                .auto-update-toggle {
                    color: black !important;
                }
                .auto-update-toggle[enabled] svg {
                    filter: invert(1);
                }
                .auto-update-toggle[enabled] {
                    color: white !important;
                }
                .zenThemeMarketplaceItemPreferenceDialogTopBar {
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
            .sine-editor .zenThemeMarketplaceItemPreferenceDialogContent {
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
                outline: 2px solid var(--zen-primary-color);
            }
            .sine-editor-resizer {
                background: rgba(255, 255, 255, 0.3);
                width: 1px;
                cursor: e-resize;
                padding: 0;
                border: 2px solid var(--zen-dialog-background);
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
                border-bottom: 2px solid var(--zen-primary-color);
                border-right: 2px solid var(--zen-primary-color);
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
                caret-color: var(--zen-primary-color);
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
        `;
        globalStyleSheet.textContent += markedStyles;
        document.head.appendChild(globalStyleSheet);
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
            .replace(/<hr([^>]*?)(?<!\/)>/gi, "<hr$1 />");
        return htmlContent;
    },

    currentPage: 0,

    // Load and render items for the current page
    async loadPage(newList, navContainer) {
        newList.innerHTML = "";

        // Calculate pagination
        const itemsPerPage = 6;
        const installedMods = await this.utils.getMods();
        const items = this.searchQuery ? this.filteredItems : this.allItems;
        const availableItems = items.filter(item => !installedMods[item.key]);
        const totalItems = availableItems.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        const currentPage = Math.max(0, Math.min(this.currentPage, totalPages - 1));
        const start = currentPage * itemsPerPage;
        const end = Math.min(start + itemsPerPage, totalItems);
        const currentItems = availableItems.slice(start, end);

        // Render items for the current page
        for (const { key, data } of currentItems) {
            // Create item
            const newItem = document.createElement("vbox");
            newItem.className = "sineInstallationItem";

            // Add image
            if (data.image) {
                const newItemImage = document.createElement("img");
                newItemImage.src = data.image;
                newItem.appendChild(newItemImage);
            }

            // Add header
            const newItemHeader = document.createElement("hbox");
            newItemHeader.className = "sineMarketplaceItemHeader";
            newItemHeader.innerHTML = `
                <label>
                    <h3 class="sineMarketplaceItemTitle">${data.name} (v${data.version})</h3>
                </label>
            `;
            newItem.appendChild(newItemHeader);

            // Add description
            const newItemDescription = document.createElement("description");
            newItemDescription.className = "sineMarketplaceItemDescription";
            newItemDescription.textContent = data.description;
            newItem.appendChild(newItemDescription);

            // Add button container
            const buttonContainer = document.createElement("hbox");
            buttonContainer.className = "sineMarketplaceButtonContainer";

            // Add readme dialog
            if (data.readme) {
                const dialog = document.createElement("dialog");
                dialog.className = "zenThemeMarketplaceItemPreferenceDialog";

                const topbar = document.createElement("div");
                topbar.className = "zenThemeMarketplaceItemPreferenceDialogTopBar";
                const close = document.createElement("button");
                close.textContent = "Close";
                close.addEventListener("click", () => dialog.close());
                close.style.marginLeft = "auto";
                topbar.appendChild(close);
                dialog.appendChild(topbar);

                const content = document.createElement("div");
                content.className = "zenThemeMarketplaceItemPreferenceDialogContent";
                const markdownBody = document.createElement("div");
                markdownBody.className = "markdown-body";
                content.appendChild(markdownBody);
                dialog.appendChild(content);
                newItem.appendChild(dialog);

                const newOpenButton = document.createElement("button");
                newOpenButton.className = "sineMarketplaceOpenButton";
                newOpenButton.addEventListener("click", async () => {
                    const themeMD = await this.fetch(data.readme).catch((err) => console.error(err));
                    let relativeURL = data.readme.split("/");
                    relativeURL.pop();
                    relativeURL = relativeURL.join("/") + "/";
                    markdownBody.innerHTML = this.parseMD(themeMD, relativeURL);
                    dialog.showModal();
                });
                newOpenButton.innerHTML = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path d="M29.693 25.849h-27.385c-1.271 0-2.307-1.036-2.307-2.307v-15.083c0-1.271 1.036-2.307 2.307-2.307h27.385c1.271 0 2.307 1.036 2.307 2.307v15.078c0 1.276-1.031 2.307-2.307 2.307zM7.693 21.229v-6l3.078 3.849 3.073-3.849v6h3.078v-10.458h-3.078l-3.073 3.849-3.078-3.849h-3.078v10.464zM28.307 16h-3.078v-5.229h-3.073v5.229h-3.078l4.615 5.385z"></path> </g></svg>`;
                buttonContainer.appendChild(newOpenButton);
            }

            // Add install button
            const newItemButton = document.createElement("button");
            newItemButton.className = "sineMarketplaceItemButton";
            newItemButton.addEventListener("click", async (e) => {
                newItemButton.disabled = true;
                await this.installMod(this.modGitHubs[key]);
                e.target.parentElement.parentElement.setAttribute("installed", "true");
                await this.loadPage(newList, navContainer);
            });
            newItemButton.textContent = "Install";
            buttonContainer.appendChild(newItemButton);
            newItem.appendChild(buttonContainer);
            newList.appendChild(newItem);

            // Check if installed
            const installedMods = await this.utils.getMods();
            if (installedMods[key]) newItem.setAttribute("installed", "true");
        }

        // Update navigation controls
        navContainer.innerHTML = "";
        if (totalPages > 1) {
            const prevButton = document.createElement("button");
            prevButton.textContent = "Previous";
            prevButton.disabled = currentPage === 0;
            prevButton.addEventListener("click", () => {
                if (this.currentPage > 0) {
                    this.currentPage--;
                    this.loadPage(newList, navContainer);
                }
            });

            const nextButton = document.createElement("button");
            nextButton.textContent = "Next";
            nextButton.disabled = currentPage >= totalPages - 1;
            nextButton.addEventListener("click", () => {
                if (this.currentPage < totalPages - 1) {
                    this.currentPage++;
                    this.loadPage(newList, navContainer);
                }
            });

            navContainer.appendChild(prevButton);
            navContainer.appendChild(nextButton);
        }
    },

    // Initialize marketplace
    async initMarketplace() {
        const refreshIcon = `<svg viewBox="-4 -4 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path d="M12 20.75C10.0772 20.75 8.23311 19.9862 6.87348 18.6265C5.51384 17.2669 4.75 15.4228 4.75 13.5C4.75 11.5772 5.51384 9.73311 6.87348 8.37348C8.23311 7.01384 10.0772 6.25 12 6.25H14.5C14.6989 6.25 14.8897 6.32902 15.0303 6.46967C15.171 6.61032 15.25 6.80109 15.25 7C15.25 7.19891 15.171 7.38968 15.0303 7.53033C14.8897 7.67098 14.6989 7.75 14.5 7.75H12C10.8628 7.75 9.75105 8.08723 8.80547 8.71905C7.85989 9.35087 7.1229 10.2489 6.68769 11.2996C6.25249 12.3502 6.13862 13.5064 6.36048 14.6218C6.58235 15.7372 7.12998 16.7617 7.93414 17.5659C8.73829 18.37 9.76284 18.9177 10.8782 19.1395C11.9936 19.3614 13.1498 19.2475 14.2004 18.8123C15.2511 18.3771 16.1491 17.6401 16.781 16.6945C17.4128 15.7489 17.75 14.6372 17.75 13.5C17.75 13.3011 17.829 13.1103 17.9697 12.9697C18.1103 12.829 18.3011 12.75 18.5 12.75C18.6989 12.75 18.8897 12.829 19.0303 12.9697C19.171 13.1103 19.25 13.3011 19.25 13.5C19.2474 15.422 18.4827 17.2645 17.1236 18.6236C15.7645 19.9827 13.922 20.7474 12 20.75Z" fill="#000000"></path> <path d="M12 10.75C11.9015 10.7505 11.8038 10.7313 11.7128 10.6935C11.6218 10.6557 11.5392 10.6001 11.47 10.53C11.3296 10.3894 11.2507 10.1988 11.2507 10C11.2507 9.80128 11.3296 9.61066 11.47 9.47003L13.94 7.00003L11.47 4.53003C11.3963 4.46137 11.3372 4.37857 11.2962 4.28657C11.2552 4.19457 11.2332 4.09526 11.2314 3.99455C11.2296 3.89385 11.2482 3.79382 11.2859 3.70043C11.3236 3.60705 11.3797 3.52221 11.451 3.45099C11.5222 3.37977 11.607 3.32363 11.7004 3.28591C11.7938 3.24819 11.8938 3.22966 11.9945 3.23144C12.0952 3.23322 12.1945 3.25526 12.2865 3.29625C12.3785 3.33724 12.4613 3.39634 12.53 3.47003L15.53 6.47003C15.6705 6.61066 15.7493 6.80128 15.7493 7.00003C15.7493 7.19878 15.6705 7.38941 15.53 7.53003L12.53 10.53C12.4608 10.6001 12.3782 10.6557 12.2872 10.6935C12.1962 10.7313 12.0985 10.7505 12 10.75Z" fill="#000000"></path> </g></svg>`;
        const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-check2" viewBox="0 0 16 16"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0"/></svg>`;
        const updateIcon = `<svg viewBox="-3 -3 32 32" id="update" data-name="Flat Line" xmlns="http://www.w3.org/2000/svg" class="icon flat-line"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path id="primary" d="M4,12A8,8,0,0,1,18.93,8" style="fill: none; stroke: #000000; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2;"></path><path id="primary-2" data-name="primary" d="M20,12A8,8,0,0,1,5.07,16" style="fill: none; stroke: #000000; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2;"></path><polyline id="primary-3" data-name="primary" points="14 8 19 8 19 3" style="fill: none; stroke: #000000; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2;"></polyline><polyline id="primary-4" data-name="primary" points="10 16 5 16 5 21" style="fill: none; stroke: #000000; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2;"></polyline></g></svg>`;
        
        await this.waitForElm("#ZenMarketplaceCategory");
        document.querySelector("#ZenMarketplaceCategory h1").textContent = "Sine Mods";
        await this.waitForElm("#zenMarketplaceHeader h2");
        document.querySelector("#zenMarketplaceHeader h2").textContent = "Installed Mods";
        document.querySelector("#zenMarketplaceGroup .description-deemphasized").textContent = "Sine Mods you have installed are listed here.";

        const updatesContainer = document.createElement("hbox");
        updatesContainer.className = "updates-container";
        const autoUpdateButton = document.createElement("button");
        autoUpdateButton.className = "auto-update-toggle";
        autoUpdateButton.addEventListener("click", () => {
            this.autoUpdates = !this.autoUpdates;
            if (this.autoUpdates) {
                autoUpdateButton.setAttribute("enabled", true);
                autoUpdateButton.title = "Disable auto-updating";
                autoUpdateButton.innerHTML = updateIcon + "Auto-Update";
            } else {
                autoUpdateButton.removeAttribute("enabled");
                autoUpdateButton.title = "Enable auto-updating";
                autoUpdateButton.innerHTML = updateIcon;
            }
        });
        autoUpdateButton.innerHTML = updateIcon;
        if (this.autoUpdates) {
            autoUpdateButton.setAttribute("enabled", true);
            autoUpdateButton.innerHTML += "Auto-Update";
        }
        autoUpdateButton.title = `${this.autoUpdates ? "Disable" : "Enable"} auto-updating`;
        updatesContainer.appendChild(autoUpdateButton);
        const updateIndicator = document.createElement("div");
        updateIndicator.className = "update-indicator";
        if (this.autoUpdates) updateIndicator.innerHTML = `${checkIcon}<p>Up-to-date</p>`;
        const manualUpdateButton = document.createElement("button");
        manualUpdateButton.className = "manual-update";
        manualUpdateButton.textContent = "Check for Updates";
        manualUpdateButton.addEventListener("click", async () => {
            updateIndicator.innerHTML = `${checkIcon}<p>...</p>`;
            await this.updateMods("manual");
            updateIndicator.innerHTML = `${checkIcon}<p>Up-to-date</p>`;
        });
        updatesContainer.appendChild(manualUpdateButton);
        updatesContainer.appendChild(updateIndicator);

        document.querySelector("#zenMarketplaceGroup .indent").insertBefore(updatesContainer, document.querySelector("#zenThemeMarketplaceImport"));

        // Create group
        const newGroup = document.createElement("groupbox");
        newGroup.id = "sineInstallationGroup";
        newGroup.className = "highlighting-group";

        // Create header
        const newHeader = document.createElement("hbox");
        newHeader.id = "sineInstallationHeader";
        newHeader.innerHTML = `<h2>Marketplace</h2>`;

        // Create search input
        const newInput = document.createElement("input");
        newInput.className = "zenCKSOption-input";
        newInput.placeholder = "Search...";
        let searchTimeout = null;
        newInput.addEventListener("input", (e) => {
            clearTimeout(searchTimeout); // Clear any pending search
            searchTimeout = setTimeout(() => {
                this.searchQuery = e.target.value.toLowerCase();
                this.currentPage = 0; // Reset to first page on search
                this.filteredItems = this.allItems.filter(item =>
                    item.data.name.toLowerCase().includes(this.searchQuery)
                );
                this.loadPage(
                    document.querySelector("#sineInstallationList"),
                    document.querySelector("#navigation-container")
                );
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

        // Add navigation controls
        const navContainer = document.createElement("hbox");
        navContainer.id = "navigation-container";

        // Create refresh button
        const newRefresh = document.createElement("button");
        newRefresh.className = "sineMarketplaceOpenButton";
        newRefresh.id = "sineMarketplaceRefreshButton";
        newRefresh.innerHTML = refreshIcon;
        newRefresh.title = "Refresh marketplace";
        newRefresh.addEventListener("click", async () => {
            newRefresh.disabled = true;
            const latest = await this.fetch(this.storeURL).catch(err => console.warn(err));
            if (latest) {
                this.modGitHubs = latest.marketplace;
                await UC_API.SharedStorage.widgetCallbacks.set("transfer", JSON.stringify(this.modGitHubs));
                UC_API.Prefs.set("sine.no-internet", false);
                await this.loadPage(newList, navContainer);
            }
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
        newGroup.appendChild(navContainer);

        // Fetch and store all items
        if (UC_API.Prefs.get("sine.no-internet").value) {
            const latest = await this.fetch(this.storeURL).catch(err => console.warn(err));
            if (latest) {
                this.modGitHubs = latest.marketplace;
                await UC_API.SharedStorage.widgetCallbacks.set("transfer", JSON.stringify(this.modGitHubs));
                UC_API.Prefs.set("sine.no-internet", false);
            }
        }

        if (this.modGitHubs) {
            const keys = Object.keys(this.modGitHubs);
            this.allItems = [];
            for (const key of keys) {
                const data = await this.fetch(`${this.rawURL(this.modGitHubs[key])}theme.json`).catch((err) => console.error(err));
                if (data) {
                    this.allItems.push({ key, data });
                }
            }
            this.filteredItems = [...this.allItems];
            await this.loadPage(newList, navContainer);
        }

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
        newCustomInput.className = "zenCKSOption-input";
        newCustomInput.placeholder = "username/repo (folder if needed)";
        newCustom.appendChild(newCustomInput);

        // Custom mods button
        const newCustomButton = document.createElement("button");
        newCustomButton.className = "sineMarketplaceItemButton";
        newCustomButton.textContent = "Install";
        newCustomButton.addEventListener("click", async () => {
            newCustomButton.disabled = true;
            await this.installMod(newCustomInput.value);
            newCustomInput.value = "";
            await this.loadPage(newList, navContainer);
            newCustomButton.disabled = false;
        });
        newCustom.appendChild(newCustomButton);

        // Settings dialog
        const newSettingsDialog = document.createElement("dialog");
        newSettingsDialog.className = "zenThemeMarketplaceItemPreferenceDialog";
        
        // Settings top bar
        const newSettingsBar = document.createElement("div");
        newSettingsBar.className = "zenThemeMarketplaceItemPreferenceDialogTopBar";
        newSettingsBar.innerHTML += `<h3 class="zenMarketplaceItemTitle">Settings</h3>`;
        const newSettingsBarBtn = document.createElement("button");
        newSettingsBarBtn.textContent = "Close";
        newSettingsBarBtn.addEventListener("click", () => newSettingsDialog.close());
        newSettingsBar.appendChild(newSettingsBarBtn);
        newSettingsDialog.appendChild(newSettingsBar);

        // Settings content
        const newSettingsContent = document.createElement("div");
        newSettingsContent.className = "zenThemeMarketplaceItemPreferenceDialogContent";
        const settingPrefs = [
            // General settings title for when that happens.
            {
                "type": "text",
                "label": "**General**",
                "margin": "10px 0 15px 0",
                "size": "20px"
            },
            {
                "type": "checkbox",
                "property": "sine.allow-unsafe-js",
                "label": "Enable installing JS from unofficial sources. (unsafe, use at your own risk)",
            },
            {
                "type": "text",
                "label": "**Updates**",
                "margin": "10px 0 15px 0",
                "size": "20px"
            },
            {
                "type": "button",
                "label": "Check for Updates",
                "action": async () => {
                    const latest = await this.fetch(this.storeURL).then(res => res.json()).catch(err => console.warn(err));
                    if (latest && new Date(latest.updatedAt) > new Date(this.updatedAt)) {
                        await this.updateScript(false);
                        if (UC_API.Prefs.get("sine.script.auto-restart").value)
                            this.restartBrowser();
                        else
                            UC_API.Notifications.show({
                                priority: "warning",
                                label: `Sine has been updated to version ${latest.version}. Please restart your browser for these changes to take effect.`,
                                buttons: [{
                                  label: "Restart",
                                  callback: (notification) => {
                                      this.restartBrowser();
                                      return true;
                                  }
                                }]
                            });
                    }
                },
                "indicator": checkIcon
            },
            {
                "type": "checkbox",
                "property": "sine.script.auto-update",
                "defaultValue": true,
                "label": "Enables script auto-updating."
            },
            {
                "type": "checkbox",
                "property": "sine.script.auto-restart",
                "label": "Automatically restarts when script updates are found."
            }
        ];
        for (const [idx, pref] of settingPrefs.entries()) {
            let prefEl = this.parsePrefs(pref);
            if (prefEl && typeof prefEl !== "string") newSettingsContent.appendChild(prefEl);
            else if (prefEl === "button") {
                const prefContainer = document.createElement("hbox");
                prefContainer.className = "updates-container";
                prefEl = document.createElement("button");
                prefEl.style.margin = "0";
                prefEl.textContent = pref.label;
                prefEl.addEventListener("click", async () => {
                    prefEl.disabled = true;
                    if (pref.hasOwnProperty("indicator"))
                        document.querySelector(`#btn-indicator-${idx}`).innerHTML = pref.indicator + "<p>...</p>";
                    await pref.action();
                    prefEl.disabled = false;
                    if (pref.hasOwnProperty("indicator"))
                        document.querySelector(`#btn-indicator-${idx}`).innerHTML = pref.indicator + "<p>Up-to-date</p>";
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
            if (pref.hasOwnProperty("conditions")) this.injectDynamicCSS(pref);
        }
        newSettingsDialog.appendChild(newSettingsContent);
        newCustom.appendChild(newSettingsDialog);

        // Settings button
        const newSettingsButton = document.createElement("button");
        newSettingsButton.className = "sineMarketplaceOpenButton zenThemeMarketplaceItemConfigureButton";
        newSettingsButton.title = "Open settings";
        newSettingsButton.addEventListener("click", () => newSettingsDialog.showModal());
        newCustom.appendChild(newSettingsButton);

        // Expand button
        const newExpandButton = document.createElement("button");
        newExpandButton.className = "sineMarketplaceOpenButton";
        newExpandButton.innerHTML = `<svg viewBox="0 0 32 32" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2;" version="1.1" xml:space="preserve" xmlns="http://www.w3.org/2000/svg" xmlns:serif="http://www.serif.com/" xmlns:xlink="http://www.w3.org/1999/xlink"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path d="M7.539,26.475l6.849,-6.971c0.58,-0.591 0.572,-1.541 -0.019,-2.121c-0.591,-0.58 -1.541,-0.572 -2.121,0.019l-6.737,6.856c-0.007,-0.079 -0.011,-0.159 -0.011,-0.24c0,-0 -0,-7.018 -0,-7.018c-0,-0.828 -0.672,-1.5 -1.5,-1.5c-0.828,0 -1.5,0.672 -1.5,1.5l0,7.018c0,3.037 2.462,5.5 5.5,5.5c3.112,-0 6.905,-0 6.905,-0c0.828,-0 1.5,-0.673 1.5,-1.5c0,-0.828 -0.672,-1.5 -1.5,-1.5l-6.905,-0c-0.157,-0 -0.311,-0.015 -0.461,-0.043Z"></path><path d="M24.267,5.51l-7.056,7.181c-0.58,0.591 -0.571,1.541 0.019,2.122c0.591,0.58 1.541,0.571 2.121,-0.019l7.149,-7.277c0.031,0.156 0.047,0.318 0.047,0.483c-0,0 -0,6.977 -0,6.977c-0,0.828 0.672,1.5 1.5,1.5c0.828,0 1.5,-0.672 1.5,-1.5l-0,-6.977c-0,-3.038 -2.463,-5.5 -5.5,-5.5c-3.162,0 -7.047,0 -7.047,0c-0.828,0 -1.5,0.672 -1.5,1.5c0,0.828 0.672,1.5 1.5,1.5c0,0 3.885,0 7.047,0c0.074,-0 0.147,0.003 0.22,0.01Z"></path><g id="Icon"></g></g></svg>`;
        newExpandButton.title = "Expand marketplace";
        newExpandButton.addEventListener("click", () => {
            newGroup.setAttribute("popover", "manual");
            newGroup.showPopover();
        });
        newCustom.appendChild(newExpandButton);

        newGroup.appendChild(newCustom);

        // Append group to main preferences pane
        document.querySelector("#mainPrefPane").insertBefore(newGroup, document.querySelector("#zenMarketplaceGroup"));
    },

    async init() {
        this.applySiteStyles();
        await this.initMarketplace();
        await this.loadMods();
        await this.updateMods("auto");
        this.doNotRebuildModsList = true;
    },
}

switch (document.location.pathname) {
    case "settings":
    case "preferences":
        window.addEventListener("load", async () => {
            if (document.readyState === "complete") {
                document.querySelector("#category-zen-marketplace .category-name").textContent = "Sine";
                const listenerFunc = async () => {
                    if (!UC_API.Prefs.get("sine.no-internet").value)
                        Sine.modGitHubs = JSON.parse(await UC_API.SharedStorage.widgetCallbacks.get("transfer"));
                    Sine.init();
                }

                if (!UC_API.Prefs.get("sine.transfer-complete").value) {
                    const listener = UC_API.Prefs.addListener("sine.transfer-complete", () => {
                        UC_API.Prefs.removeListener(listener);
                        listenerFunc();
                    });
                } else listenerFunc();
            }
        });
        break;
    case "/content/browser.xhtml":
        UC_API.Prefs.set("sine.transfer-complete", false);
        await Sine.initWindow();
        await Sine.checkForUpdates();
        const fetchFunc = async () => {
            const url = UC_API.Prefs.get("sine.fetch-url").value;
            let response = await fetch(url).then(res => res.text()).catch(err => console.warn(err));
            await UC_API.SharedStorage.widgetCallbacks.set("fetch-results", response);
            UC_API.Prefs.removeListener(fetchListener);
            UC_API.Prefs.set("sine.fetch-url", "none");
            fetchListener = UC_API.Prefs.addListener("sine.fetch-url", fetchFunc);
        }
        UC_API.Prefs.set("sine.fetch-url", "none");
        let fetchListener = UC_API.Prefs.addListener("sine.fetch-url", fetchFunc);
        const processFunc = async () => {
            const process = UC_API.Prefs.get("sine.process").value;
            switch (process) {
                // FUTURE PURPOSES.
            }
            UC_API.Prefs.set("sine.process", "none");
        }
        UC_API.Prefs.addListener("sine.process", processFunc);
        const globalStyleSheet = document.createElement("style");
        globalStyleSheet.textContent = `
            notification-message {
                border-radius: 8px !important;
                box-shadow: 2px 2px 2px rgba(0, 0, 0, 0.2) !important;
                margin-bottom: 5px !important;
                margin-right: 5px !important;
            }4
        `;
        document.head.appendChild(globalStyleSheet);
        if (Sine.modGitHubs) {
            await UC_API.SharedStorage.widgetCallbacks.set("transfer", JSON.stringify(Sine.modGitHubs));
            UC_API.Prefs.set("sine.no-internet", false);
        } else {
            UC_API.Prefs.set("sine.no-internet", true);
        }
        UC_API.Prefs.set("sine.transfer-complete", true);
        break;
}


// Marked parser and style imports. https://cdn.jsdelivr.net/npm/marked@4.0.0/marked.min.js
!function(e,t){"object"==typeof exports&&"undefined"!=typeof module?t(exports):"function"==typeof define&&define.amd?define(["exports"],t):t((e="undefined"!=typeof globalThis?globalThis:e||self).marked={})}(this,function(r){"use strict";function i(e,t){for(var u=0;u<t.length;u++){var n=t[u];n.enumerable=n.enumerable||!1,n.configurable=!0,"value"in n&&(n.writable=!0),Object.defineProperty(e,n.key,n)}}function s(e,t){(null==t||t>e.length)&&(t=e.length);for(var u=0,n=new Array(t);u<t;u++)n[u]=e[u];return n}function D(e,t){var u="undefined"!=typeof Symbol&&e[Symbol.iterator]||e["@@iterator"];if(u)return(u=u.call(e)).next.bind(u);if(Array.isArray(e)||(u=function(e,t){if(e){if("string"==typeof e)return s(e,t);var u=Object.prototype.toString.call(e).slice(8,-1);return"Map"===(u="Object"===u&&e.constructor?e.constructor.name:u)||"Set"===u?Array.from(e):"Arguments"===u||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(u)?s(e,t):void 0}}(e))||t&&e&&"number"==typeof e.length){u&&(e=u);var n=0;return function(){return n>=e.length?{done:!0}:{done:!1,value:e[n++]}}}throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}function e(){return{baseUrl:null,breaks:!1,extensions:null,gfm:!0,headerIds:!0,headerPrefix:"",highlight:null,langPrefix:"language-",mangle:!0,pedantic:!1,renderer:null,sanitize:!1,sanitizer:null,silent:!1,smartLists:!1,smartypants:!1,tokenizer:null,walkTokens:null,xhtml:!1}}r.defaults=e();function u(e){return t[e]}var n=/[&<>"']/,l=/[&<>"']/g,a=/[<>"']|&(?!#?\w+;)/,o=/[<>"']|&(?!#?\w+;)/g,t={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};function c(e,t){if(t){if(n.test(e))return e.replace(l,u)}else if(a.test(e))return e.replace(o,u);return e}var h=/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/gi;function x(e){return e.replace(h,function(e,t){return"colon"===(t=t.toLowerCase())?":":"#"===t.charAt(0)?"x"===t.charAt(1)?String.fromCharCode(parseInt(t.substring(2),16)):String.fromCharCode(+t.substring(1)):""})}var p=/(^|[^\[])\^/g;function f(u,e){u=u.source||u,e=e||"";var n={replace:function(e,t){return t=(t=t.source||t).replace(p,"$1"),u=u.replace(e,t),n},getRegex:function(){return new RegExp(u,e)}};return n}var F=/[^\w:]/g,g=/^$|^[a-z][a-z0-9+.-]*:|^[?#]/i;function A(e,t,u){if(e){var n;try{n=decodeURIComponent(x(u)).replace(F,"").toLowerCase()}catch(e){return null}if(0===n.indexOf("javascript:")||0===n.indexOf("vbscript:")||0===n.indexOf("data:"))return null}t&&!g.test(u)&&(u=function(e,t){C[" "+e]||(d.test(e)?C[" "+e]=e+"/":C[" "+e]=w(e,"/",!0));var u=-1===(e=C[" "+e]).indexOf(":");return"//"===t.substring(0,2)?u?t:e.replace(k,"$1")+t:"/"===t.charAt(0)?u?t:e.replace(E,"$1")+t:e+t}(t,u));try{u=encodeURI(u).replace(/%25/g,"%")}catch(e){return null}return u}var C={},d=/^[^:]+:\/*[^/]*$/,k=/^([^:]+:)[\s\S]*$/,E=/^([^:]+:\/*[^/]*)[\s\S]*$/;var m={exec:function(){}};function B(e){for(var t,u,n=1;n<arguments.length;n++)for(u in t=arguments[n])Object.prototype.hasOwnProperty.call(t,u)&&(e[u]=t[u]);return e}function b(e,t){var u=e.replace(/\|/g,function(e,t,u){for(var n=!1,r=t;0<=--r&&"\\"===u[r];)n=!n;return n?"|":" |"}).split(/ \|/),n=0;if(u[0].trim()||u.shift(),u[u.length-1].trim()||u.pop(),u.length>t)u.splice(t);else for(;u.length<t;)u.push("");for(;n<u.length;n++)u[n]=u[n].trim().replace(/\\\|/g,"|");return u}function w(e,t,u){var n=e.length;if(0===n)return"";for(var r=0;r<n;){var i=e.charAt(n-r-1);if(i!==t||u){if(i===t||!u)break;r++}else r++}return e.substr(0,n-r)}function v(e){e&&e.sanitize&&!e.silent&&console.warn("marked(): sanitize and sanitizer parameters are deprecated since version 0.7.0, should not be used and will be removed in the future. Read more here: https://marked.js.org/#/USING_ADVANCED.md#options")}function y(e,t){if(t<1)return"";for(var u="";1<t;)1&t&&(u+=e),t>>=1,e+=e;return u+e}function _(e,t,u,n){var r=t.href,i=t.title?c(t.title):null,t=e[1].replace(/\\([\[\]])/g,"$1");if("!"===e[0].charAt(0))return{type:"image",raw:u,href:r,title:i,text:c(t)};n.state.inLink=!0;t={type:"link",raw:u,href:r,title:i,text:t,tokens:n.inlineTokens(t,[])};return n.state.inLink=!1,t}var z=function(){function e(e){this.options=e||r.defaults}var t=e.prototype;return t.space=function(e){e=this.rules.block.newline.exec(e);if(e)return 1<e[0].length?{type:"space",raw:e[0]}:{raw:"\n"}},t.code=function(e){var t=this.rules.block.code.exec(e);if(t){e=t[0].replace(/^ {1,4}/gm,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?e:w(e,"\n")}}},t.fences=function(e){var t=this.rules.block.fences.exec(e);if(t){var u=t[0],e=function(e,t){if(null===(e=e.match(/^(\s+)(?:```)/)))return t;var u=e[1];return t.split("\n").map(function(e){var t=e.match(/^\s+/);return null!==t&&t[0].length>=u.length?e.slice(u.length):e}).join("\n")}(u,t[3]||"");return{type:"code",raw:u,lang:t[2]&&t[2].trim(),text:e}}},t.heading=function(e){var t=this.rules.block.heading.exec(e);if(t){var u=t[2].trim();/#$/.test(u)&&(e=w(u,"#"),!this.options.pedantic&&e&&!/ $/.test(e)||(u=e.trim()));u={type:"heading",raw:t[0],depth:t[1].length,text:u,tokens:[]};return this.lexer.inline(u.text,u.tokens),u}},t.hr=function(e){e=this.rules.block.hr.exec(e);if(e)return{type:"hr",raw:e[0]}},t.blockquote=function(e){var t=this.rules.block.blockquote.exec(e);if(t){e=t[0].replace(/^ *> ?/gm,"");return{type:"blockquote",raw:t[0],tokens:this.lexer.blockTokens(e,[]),text:e}}},t.list=function(e){var t=this.rules.block.list.exec(e);if(t){var u,n,r,i,s,l,a,D,o,c=1<(p=t[1].trim()).length,h={type:"list",raw:"",ordered:c,start:c?+p.slice(0,-1):"",loose:!1,items:[]},p=c?"\\d{1,9}\\"+p.slice(-1):"\\"+p;this.options.pedantic&&(p=c?p:"[*+-]");for(var f=new RegExp("^( {0,3}"+p+")((?: [^\\n]*| *)(?:\\n[^\\n]*)*(?:\\n|$))");e&&!this.rules.block.hr.test(e)&&(t=f.exec(e));){D=t[2].split("\n"),o=this.options.pedantic?(i=2,D[0].trimLeft()):(i=t[2].search(/[^ ]/),i=t[1].length+(4<i?1:i),D[0].slice(i-t[1].length)),s=!1,u=t[0],!D[0]&&/^ *$/.test(D[1])&&(u=t[1]+D.slice(0,2).join("\n")+"\n",h.loose=!0,D=[]);for(var F=new RegExp("^ {0,"+Math.min(3,i-1)+"}(?:[*+-]|\\d{1,9}[.)])"),g=1;g<D.length;g++){if(a=D[g],this.options.pedantic&&(a=a.replace(/^ {1,4}(?=( {4})*[^ ])/g,"  ")),F.test(a)){u=t[1]+D.slice(0,g).join("\n")+"\n";break}if(s){if(!(a.search(/[^ ]/)>=i)&&a.trim()){u=t[1]+D.slice(0,g).join("\n")+"\n";break}o+="\n"+a.slice(i)}else a.trim()||(s=!0),a.search(/[^ ]/)>=i?o+="\n"+a.slice(i):o+="\n"+a}h.loose||(l?h.loose=!0:/\n *\n *$/.test(u)&&(l=!0)),this.options.gfm&&(n=/^\[[ xX]\] /.exec(o))&&(r="[ ] "!==n[0],o=o.replace(/^\[[ xX]\] +/,"")),h.items.push({type:"list_item",raw:u,task:!!n,checked:r,loose:!1,text:o}),h.raw+=u,e=e.slice(u.length)}h.items[h.items.length-1].raw=u.trimRight(),h.items[h.items.length-1].text=o.trimRight(),h.raw=h.raw.trimRight();var A=h.items.length;for(g=0;g<A;g++)this.lexer.state.top=!1,h.items[g].tokens=this.lexer.blockTokens(h.items[g].text,[]),h.items[g].tokens.some(function(e){return"space"===e.type})&&(h.loose=!0,h.items[g].loose=!0);return h}},t.html=function(e){var t=this.rules.block.html.exec(e);if(t){e={type:"html",raw:t[0],pre:!this.options.sanitizer&&("pre"===t[1]||"script"===t[1]||"style"===t[1]),text:t[0]};return this.options.sanitize&&(e.type="paragraph",e.text=this.options.sanitizer?this.options.sanitizer(t[0]):c(t[0]),e.tokens=[],this.lexer.inline(e.text,e.tokens)),e}},t.def=function(e){e=this.rules.block.def.exec(e);if(e)return e[3]&&(e[3]=e[3].substring(1,e[3].length-1)),{type:"def",tag:e[1].toLowerCase().replace(/\s+/g," "),raw:e[0],href:e[2],title:e[3]}},t.table=function(e){e=this.rules.block.table.exec(e);if(e){var t={type:"table",header:b(e[1]).map(function(e){return{text:e}}),align:e[2].replace(/^ *|\| *$/g,"").split(/ *\| */),rows:e[3]?e[3].replace(/\n$/,"").split("\n"):[]};if(t.header.length===t.align.length){t.raw=e[0];for(var u,n,r,i=t.align.length,s=0;s<i;s++)/^ *-+: *$/.test(t.align[s])?t.align[s]="right":/^ *:-+: *$/.test(t.align[s])?t.align[s]="center":/^ *:-+ *$/.test(t.align[s])?t.align[s]="left":t.align[s]=null;for(i=t.rows.length,s=0;s<i;s++)t.rows[s]=b(t.rows[s],t.header.length).map(function(e){return{text:e}});for(i=t.header.length,u=0;u<i;u++)t.header[u].tokens=[],this.lexer.inlineTokens(t.header[u].text,t.header[u].tokens);for(i=t.rows.length,u=0;u<i;u++)for(r=t.rows[u],n=0;n<r.length;n++)r[n].tokens=[],this.lexer.inlineTokens(r[n].text,r[n].tokens);return t}}},t.lheading=function(e){e=this.rules.block.lheading.exec(e);if(e){e={type:"heading",raw:e[0],depth:"="===e[2].charAt(0)?1:2,text:e[1],tokens:[]};return this.lexer.inline(e.text,e.tokens),e}},t.paragraph=function(e){e=this.rules.block.paragraph.exec(e);if(e){e={type:"paragraph",raw:e[0],text:"\n"===e[1].charAt(e[1].length-1)?e[1].slice(0,-1):e[1],tokens:[]};return this.lexer.inline(e.text,e.tokens),e}},t.text=function(e){e=this.rules.block.text.exec(e);if(e){e={type:"text",raw:e[0],text:e[0],tokens:[]};return this.lexer.inline(e.text,e.tokens),e}},t.escape=function(e){e=this.rules.inline.escape.exec(e);if(e)return{type:"escape",raw:e[0],text:c(e[1])}},t.tag=function(e){e=this.rules.inline.tag.exec(e);if(e)return!this.lexer.state.inLink&&/^<a /i.test(e[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&/^<\/a>/i.test(e[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&/^<(pre|code|kbd|script)(\s|>)/i.test(e[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&/^<\/(pre|code|kbd|script)(\s|>)/i.test(e[0])&&(this.lexer.state.inRawBlock=!1),{type:this.options.sanitize?"text":"html",raw:e[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,text:this.options.sanitize?this.options.sanitizer?this.options.sanitizer(e[0]):c(e[0]):e[0]}},t.link=function(e){var t=this.rules.inline.link.exec(e);if(t){var u=t[2].trim();if(!this.options.pedantic&&/^</.test(u)){if(!/>$/.test(u))return;e=w(u.slice(0,-1),"\\");if((u.length-e.length)%2==0)return}else{var n=function(e,t){if(-1===e.indexOf(t[1]))return-1;for(var u=e.length,n=0,r=0;r<u;r++)if("\\"===e[r])r++;else if(e[r]===t[0])n++;else if(e[r]===t[1]&&--n<0)return r;return-1}(t[2],"()");-1<n&&(i=(0===t[0].indexOf("!")?5:4)+t[1].length+n,t[2]=t[2].substring(0,n),t[0]=t[0].substring(0,i).trim(),t[3]="")}var r,n=t[2],i="";return this.options.pedantic?(r=/^([^'"]*[^\s])\s+(['"])(.*)\2/.exec(n))&&(n=r[1],i=r[3]):i=t[3]?t[3].slice(1,-1):"",n=n.trim(),_(t,{href:(n=/^</.test(n)?this.options.pedantic&&!/>$/.test(u)?n.slice(1):n.slice(1,-1):n)&&n.replace(this.rules.inline._escapes,"$1"),title:i&&i.replace(this.rules.inline._escapes,"$1")},t[0],this.lexer)}},t.reflink=function(e,t){if((u=this.rules.inline.reflink.exec(e))||(u=this.rules.inline.nolink.exec(e))){e=(u[2]||u[1]).replace(/\s+/g," ");if((e=t[e.toLowerCase()])&&e.href)return _(u,e,u[0],this.lexer);var u=u[0].charAt(0);return{type:"text",raw:u,text:u}}},t.emStrong=function(e,t,u){void 0===u&&(u="");var n=this.rules.inline.emStrong.lDelim.exec(e);if(n&&(!n[3]||!u.match(/(?:[0-9A-Za-z\xAA\xB2\xB3\xB5\xB9\xBA\xBC-\xBE\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0560-\u0588\u05D0-\u05EA\u05EF-\u05F2\u0620-\u064A\u0660-\u0669\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07C0-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u0860-\u086A\u0870-\u0887\u0889-\u088E\u08A0-\u08C9\u0904-\u0939\u093D\u0950\u0958-\u0961\u0966-\u096F\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09E6-\u09F1\u09F4-\u09F9\u09FC\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A66-\u0A6F\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0AE6-\u0AEF\u0AF9\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B66-\u0B6F\u0B71-\u0B77\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0BE6-\u0BF2\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C5D\u0C60\u0C61\u0C66-\u0C6F\u0C78-\u0C7E\u0C80\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDD\u0CDE\u0CE0\u0CE1\u0CE6-\u0CEF\u0CF1\u0CF2\u0D04-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D54-\u0D56\u0D58-\u0D61\u0D66-\u0D78\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0DE6-\u0DEF\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E50-\u0E59\u0E81\u0E82\u0E84\u0E86-\u0E8A\u0E8C-\u0EA3\u0EA5\u0EA7-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0ED0-\u0ED9\u0EDC-\u0EDF\u0F00\u0F20-\u0F33\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F-\u1049\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u1090-\u1099\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1369-\u137C\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u1711\u171F-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u17E0-\u17E9\u17F0-\u17F9\u1810-\u1819\u1820-\u1878\u1880-\u1884\u1887-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1946-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u19D0-\u19DA\u1A00-\u1A16\u1A20-\u1A54\u1A80-\u1A89\u1A90-\u1A99\u1AA7\u1B05-\u1B33\u1B45-\u1B4C\u1B50-\u1B59\u1B83-\u1BA0\u1BAE-\u1BE5\u1C00-\u1C23\u1C40-\u1C49\u1C4D-\u1C7D\u1C80-\u1C88\u1C90-\u1CBA\u1CBD-\u1CBF\u1CE9-\u1CEC\u1CEE-\u1CF3\u1CF5\u1CF6\u1CFA\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2070\u2071\u2074-\u2079\u207F-\u2089\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2150-\u2189\u2460-\u249B\u24EA-\u24FF\u2776-\u2793\u2C00-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2CFD\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312F\u3131-\u318E\u3192-\u3195\u31A0-\u31BF\u31F0-\u31FF\u3220-\u3229\u3248-\u324F\u3251-\u325F\u3280-\u3289\u32B1-\u32BF\u3400-\u4DBF\u4E00-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6EF\uA717-\uA71F\uA722-\uA788\uA78B-\uA7CA\uA7D0\uA7D1\uA7D3\uA7D5-\uA7D9\uA7F2-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA830-\uA835\uA840-\uA873\uA882-\uA8B3\uA8D0-\uA8D9\uA8F2-\uA8F7\uA8FB\uA8FD\uA8FE\uA900-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF-\uA9D9\uA9E0-\uA9E4\uA9E6-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA50-\uAA59\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB69\uAB70-\uABE2\uABF0-\uABF9\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]|\uD800[\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDD07-\uDD33\uDD40-\uDD78\uDD8A\uDD8B\uDE80-\uDE9C\uDEA0-\uDED0\uDEE1-\uDEFB\uDF00-\uDF23\uDF2D-\uDF4A\uDF50-\uDF75\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF\uDFD1-\uDFD5]|\uD801[\uDC00-\uDC9D\uDCA0-\uDCA9\uDCB0-\uDCD3\uDCD8-\uDCFB\uDD00-\uDD27\uDD30-\uDD63\uDD70-\uDD7A\uDD7C-\uDD8A\uDD8C-\uDD92\uDD94\uDD95\uDD97-\uDDA1\uDDA3-\uDDB1\uDDB3-\uDDB9\uDDBB\uDDBC\uDE00-\uDF36\uDF40-\uDF55\uDF60-\uDF67\uDF80-\uDF85\uDF87-\uDFB0\uDFB2-\uDFBA]|\uD802[\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDC58-\uDC76\uDC79-\uDC9E\uDCA7-\uDCAF\uDCE0-\uDCF2\uDCF4\uDCF5\uDCFB-\uDD1B\uDD20-\uDD39\uDD80-\uDDB7\uDDBC-\uDDCF\uDDD2-\uDE00\uDE10-\uDE13\uDE15-\uDE17\uDE19-\uDE35\uDE40-\uDE48\uDE60-\uDE7E\uDE80-\uDE9F\uDEC0-\uDEC7\uDEC9-\uDEE4\uDEEB-\uDEEF\uDF00-\uDF35\uDF40-\uDF55\uDF58-\uDF72\uDF78-\uDF91\uDFA9-\uDFAF]|\uD803[\uDC00-\uDC48\uDC80-\uDCB2\uDCC0-\uDCF2\uDCFA-\uDD23\uDD30-\uDD39\uDE60-\uDE7E\uDE80-\uDEA9\uDEB0\uDEB1\uDF00-\uDF27\uDF30-\uDF45\uDF51-\uDF54\uDF70-\uDF81\uDFB0-\uDFCB\uDFE0-\uDFF6]|\uD804[\uDC03-\uDC37\uDC52-\uDC6F\uDC71\uDC72\uDC75\uDC83-\uDCAF\uDCD0-\uDCE8\uDCF0-\uDCF9\uDD03-\uDD26\uDD36-\uDD3F\uDD44\uDD47\uDD50-\uDD72\uDD76\uDD83-\uDDB2\uDDC1-\uDDC4\uDDD0-\uDDDA\uDDDC\uDDE1-\uDDF4\uDE00-\uDE11\uDE13-\uDE2B\uDE80-\uDE86\uDE88\uDE8A-\uDE8D\uDE8F-\uDE9D\uDE9F-\uDEA8\uDEB0-\uDEDE\uDEF0-\uDEF9\uDF05-\uDF0C\uDF0F\uDF10\uDF13-\uDF28\uDF2A-\uDF30\uDF32\uDF33\uDF35-\uDF39\uDF3D\uDF50\uDF5D-\uDF61]|\uD805[\uDC00-\uDC34\uDC47-\uDC4A\uDC50-\uDC59\uDC5F-\uDC61\uDC80-\uDCAF\uDCC4\uDCC5\uDCC7\uDCD0-\uDCD9\uDD80-\uDDAE\uDDD8-\uDDDB\uDE00-\uDE2F\uDE44\uDE50-\uDE59\uDE80-\uDEAA\uDEB8\uDEC0-\uDEC9\uDF00-\uDF1A\uDF30-\uDF3B\uDF40-\uDF46]|\uD806[\uDC00-\uDC2B\uDCA0-\uDCF2\uDCFF-\uDD06\uDD09\uDD0C-\uDD13\uDD15\uDD16\uDD18-\uDD2F\uDD3F\uDD41\uDD50-\uDD59\uDDA0-\uDDA7\uDDAA-\uDDD0\uDDE1\uDDE3\uDE00\uDE0B-\uDE32\uDE3A\uDE50\uDE5C-\uDE89\uDE9D\uDEB0-\uDEF8]|\uD807[\uDC00-\uDC08\uDC0A-\uDC2E\uDC40\uDC50-\uDC6C\uDC72-\uDC8F\uDD00-\uDD06\uDD08\uDD09\uDD0B-\uDD30\uDD46\uDD50-\uDD59\uDD60-\uDD65\uDD67\uDD68\uDD6A-\uDD89\uDD98\uDDA0-\uDDA9\uDEE0-\uDEF2\uDFB0\uDFC0-\uDFD4]|\uD808[\uDC00-\uDF99]|\uD809[\uDC00-\uDC6E\uDC80-\uDD43]|\uD80B[\uDF90-\uDFF0]|[\uD80C\uD81C-\uD820\uD822\uD840-\uD868\uD86A-\uD86C\uD86F-\uD872\uD874-\uD879\uD880-\uD883][\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E]|\uD811[\uDC00-\uDE46]|\uD81A[\uDC00-\uDE38\uDE40-\uDE5E\uDE60-\uDE69\uDE70-\uDEBE\uDEC0-\uDEC9\uDED0-\uDEED\uDF00-\uDF2F\uDF40-\uDF43\uDF50-\uDF59\uDF5B-\uDF61\uDF63-\uDF77\uDF7D-\uDF8F]|\uD81B[\uDE40-\uDE96\uDF00-\uDF4A\uDF50\uDF93-\uDF9F\uDFE0\uDFE1\uDFE3]|\uD821[\uDC00-\uDFF7]|\uD823[\uDC00-\uDCD5\uDD00-\uDD08]|\uD82B[\uDFF0-\uDFF3\uDFF5-\uDFFB\uDFFD\uDFFE]|\uD82C[\uDC00-\uDD22\uDD50-\uDD52\uDD64-\uDD67\uDD70-\uDEFB]|\uD82F[\uDC00-\uDC6A\uDC70-\uDC7C\uDC80-\uDC88\uDC90-\uDC99]|\uD834[\uDEE0-\uDEF3\uDF60-\uDF78]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB\uDFCE-\uDFFF]|\uD837[\uDF00-\uDF1E]|\uD838[\uDD00-\uDD2C\uDD37-\uDD3D\uDD40-\uDD49\uDD4E\uDE90-\uDEAD\uDEC0-\uDEEB\uDEF0-\uDEF9]|\uD839[\uDFE0-\uDFE6\uDFE8-\uDFEB\uDFED\uDFEE\uDFF0-\uDFFE]|\uD83A[\uDC00-\uDCC4\uDCC7-\uDCCF\uDD00-\uDD43\uDD4B\uDD50-\uDD59]|\uD83B[\uDC71-\uDCAB\uDCAD-\uDCAF\uDCB1-\uDCB4\uDD01-\uDD2D\uDD2F-\uDD3D\uDE00-\uDE03\uDE05-\uDE1F\uDE21\uDE22\uDE24\uDE27\uDE29-\uDE32\uDE34-\uDE37\uDE39\uDE3B\uDE42\uDE47\uDE49\uDE4B\uDE4D-\uDE4F\uDE51\uDE52\uDE54\uDE57\uDE59\uDE5B\uDE5D\uDE5F\uDE61\uDE62\uDE64\uDE67-\uDE6A\uDE6C-\uDE72\uDE74-\uDE77\uDE79-\uDE7C\uDE7E\uDE80-\uDE89\uDE8B-\uDE9B\uDEA1-\uDEA3\uDEA5-\uDEA9\uDEAB-\uDEBB]|\uD83C[\uDD00-\uDD0C]|\uD83E[\uDFF0-\uDFF9]|\uD869[\uDC00-\uDEDF\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF38\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D\uDC20-\uDFFF]|\uD873[\uDC00-\uDEA1\uDEB0-\uDFFF]|\uD87A[\uDC00-\uDFE0]|\uD87E[\uDC00-\uDE1D]|\uD884[\uDC00-\uDF4A])/))){var r=n[1]||n[2]||"";if(!r||""===u||this.rules.inline.punctuation.exec(u)){var i,s=n[0].length-1,l=s,a=0,D="*"===n[0][0]?this.rules.inline.emStrong.rDelimAst:this.rules.inline.emStrong.rDelimUnd;for(D.lastIndex=0,t=t.slice(-1*e.length+s);null!=(n=D.exec(t));)if(i=n[1]||n[2]||n[3]||n[4]||n[5]||n[6])if(i=i.length,n[3]||n[4])l+=i;else if(!((n[5]||n[6])&&s%3)||(s+i)%3){if(!(0<(l-=i))){if(i=Math.min(i,i+l+a),Math.min(s,i)%2){var o=e.slice(1,s+n.index+i);return{type:"em",raw:e.slice(0,s+n.index+i+1),text:o,tokens:this.lexer.inlineTokens(o,[])}}o=e.slice(2,s+n.index+i-1);return{type:"strong",raw:e.slice(0,s+n.index+i+1),text:o,tokens:this.lexer.inlineTokens(o,[])}}}else a+=i}}},t.codespan=function(e){var t=this.rules.inline.code.exec(e);if(t){var u=t[2].replace(/\n/g," "),n=/[^ ]/.test(u),e=/^ /.test(u)&&/ $/.test(u),u=c(u=n&&e?u.substring(1,u.length-1):u,!0);return{type:"codespan",raw:t[0],text:u}}},t.br=function(e){e=this.rules.inline.br.exec(e);if(e)return{type:"br",raw:e[0]}},t.del=function(e){e=this.rules.inline.del.exec(e);if(e)return{type:"del",raw:e[0],text:e[2],tokens:this.lexer.inlineTokens(e[2],[])}},t.autolink=function(e,t){e=this.rules.inline.autolink.exec(e);if(e){var u,t="@"===e[2]?"mailto:"+(u=c(this.options.mangle?t(e[1]):e[1])):u=c(e[1]);return{type:"link",raw:e[0],text:u,href:t,tokens:[{type:"text",raw:u,text:u}]}}},t.url=function(e,t){var u,n,r,i;if(u=this.rules.inline.url.exec(e)){if("@"===u[2])r="mailto:"+(n=c(this.options.mangle?t(u[0]):u[0]));else{for(;i=u[0],u[0]=this.rules.inline._backpedal.exec(u[0])[0],i!==u[0];);n=c(u[0]),r="www."===u[1]?"http://"+n:n}return{type:"link",raw:u[0],text:n,href:r,tokens:[{type:"text",raw:n,text:n}]}}},t.inlineText=function(e,t){e=this.rules.inline.text.exec(e);if(e){t=this.lexer.state.inRawBlock?this.options.sanitize?this.options.sanitizer?this.options.sanitizer(e[0]):c(e[0]):e[0]:c(this.options.smartypants?t(e[0]):e[0]);return{type:"text",raw:e[0],text:t}}},e}(),$={newline:/^(?: *(?:\n|$))+/,code:/^( {4}[^\n]+(?:\n(?: *(?:\n|$))*)?)+/,fences:/^ {0,3}(`{3,}(?=[^`\n]*\n)|~{3,})([^\n]*)\n(?:|([\s\S]*?)\n)(?: {0,3}\1[~`]* *(?=\n|$)|$)/,hr:/^ {0,3}((?:- *){3,}|(?:_ *){3,}|(?:\* *){3,})(?:\n+|$)/,heading:/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,blockquote:/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/,list:/^( {0,3}bull)( [^\n]+?)?(?:\n|$)/,html:"^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n *)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n *)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n *)+\\n|$))",def:/^ {0,3}\[(label)\]: *\n? *<?([^\s>]+)>?(?:(?: +\n? *| *\n *)(title))? *(?:\n+|$)/,table:m,lheading:/^([^\n]+)\n {0,3}(=+|-+) *(?:\n+|$)/,_paragraph:/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html| +\n)[^\n]+)*)/,text:/^[^\n]+/,_label:/(?!\s*\])(?:\\[\[\]]|[^\[\]])+/,_title:/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/};$.def=f($.def).replace("label",$._label).replace("title",$._title).getRegex(),$.bullet=/(?:[*+-]|\d{1,9}[.)])/,$.listItemStart=f(/^( *)(bull) */).replace("bull",$.bullet).getRegex(),$.list=f($.list).replace(/bull/g,$.bullet).replace("hr","\\n+(?=\\1?(?:(?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$))").replace("def","\\n+(?="+$.def.source+")").getRegex(),$._tag="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|section|source|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",$._comment=/<!--(?!-?>)[\s\S]*?(?:-->|$)/,$.html=f($.html,"i").replace("comment",$._comment).replace("tag",$._tag).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),$.paragraph=f($._paragraph).replace("hr",$.hr).replace("heading"," {0,3}#{1,6} ").replace("|lheading","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",$._tag).getRegex(),$.blockquote=f($.blockquote).replace("paragraph",$.paragraph).getRegex(),$.normal=B({},$),$.gfm=B({},$.normal,{table:"^ *([^\\n ].*\\|.*)\\n {0,3}(?:\\| *)?(:?-+:? *(?:\\| *:?-+:? *)*)(?:\\| *)?(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)"}),$.gfm.table=f($.gfm.table).replace("hr",$.hr).replace("heading"," {0,3}#{1,6} ").replace("blockquote"," {0,3}>").replace("code"," {4}[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",$._tag).getRegex(),$.pedantic=B({},$.normal,{html:f("^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:\"[^\"]*\"|'[^']*'|\\s[^'\"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))").replace("comment",$._comment).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:m,paragraph:f($.normal._paragraph).replace("hr",$.hr).replace("heading"," *#{1,6} *[^\n]").replace("lheading",$.lheading).replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").getRegex()});var S={escape:/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,autolink:/^<(scheme:[^\s\x00-\x1f<>]*|email)>/,url:m,tag:"^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>",link:/^!?\[(label)\]\(\s*(href)(?:\s+(title))?\s*\)/,reflink:/^!?\[(label)\]\[(?!\s*\])((?:\\[\[\]]?|[^\[\]\\])+)\]/,nolink:/^!?\[(?!\s*\])((?:\[[^\[\]]*\]|\\[\[\]]|[^\[\]])*)\](?:\[\])?/,reflinkSearch:"reflink|nolink(?!\\()",emStrong:{lDelim:/^(?:\*+(?:([punct_])|[^\s*]))|^_+(?:([punct*])|([^\s_]))/,rDelimAst:/^[^_*]*?\_\_[^_*]*?\*[^_*]*?(?=\_\_)|[punct_](\*+)(?=[\s]|$)|[^punct*_\s](\*+)(?=[punct_\s]|$)|[punct_\s](\*+)(?=[^punct*_\s])|[\s](\*+)(?=[punct_])|[punct_](\*+)(?=[punct_])|[^punct*_\s](\*+)(?=[^punct*_\s])/,rDelimUnd:/^[^_*]*?\*\*[^_*]*?\_[^_*]*?(?=\*\*)|[punct*](\_+)(?=[\s]|$)|[^punct*_\s](\_+)(?=[punct*\s]|$)|[punct*\s](\_+)(?=[^punct*_\s])|[\s](\_+)(?=[punct*])|[punct*](\_+)(?=[punct*])/},code:/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,br:/^( {2,}|\\)\n(?!\s*$)/,del:m,text:/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,punctuation:/^([\spunctuation])/};function T(e){return e.replace(/---/g,"—").replace(/--/g,"–").replace(/(^|[-\u2014/(\[{"\s])'/g,"$1‘").replace(/'/g,"’").replace(/(^|[-\u2014/(\[{\u2018\s])"/g,"$1“").replace(/"/g,"”").replace(/\.{3}/g,"…")}function R(e){for(var t,u="",n=e.length,r=0;r<n;r++)t=e.charCodeAt(r),u+="&#"+(t=.5<Math.random()?"x"+t.toString(16):t)+";";return u}S._punctuation="!\"#$%&'()+\\-.,/:;<=>?@\\[\\]`^{|}~",S.punctuation=f(S.punctuation).replace(/punctuation/g,S._punctuation).getRegex(),S.blockSkip=/\[[^\]]*?\]\([^\)]*?\)|`[^`]*?`|<[^>]*?>/g,S.escapedEmSt=/\\\*|\\_/g,S._comment=f($._comment).replace("(?:--\x3e|$)","--\x3e").getRegex(),S.emStrong.lDelim=f(S.emStrong.lDelim).replace(/punct/g,S._punctuation).getRegex(),S.emStrong.rDelimAst=f(S.emStrong.rDelimAst,"g").replace(/punct/g,S._punctuation).getRegex(),S.emStrong.rDelimUnd=f(S.emStrong.rDelimUnd,"g").replace(/punct/g,S._punctuation).getRegex(),S._escapes=/\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/g,S._scheme=/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/,S._email=/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/,S.autolink=f(S.autolink).replace("scheme",S._scheme).replace("email",S._email).getRegex(),S._attribute=/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/,S.tag=f(S.tag).replace("comment",S._comment).replace("attribute",S._attribute).getRegex(),S._label=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,S._href=/<(?:\\.|[^\n<>\\])+>|[^\s\x00-\x1f]*/,S._title=/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/,S.link=f(S.link).replace("label",S._label).replace("href",S._href).replace("title",S._title).getRegex(),S.reflink=f(S.reflink).replace("label",S._label).getRegex(),S.reflinkSearch=f(S.reflinkSearch,"g").replace("reflink",S.reflink).replace("nolink",S.nolink).getRegex(),S.normal=B({},S),S.pedantic=B({},S.normal,{strong:{start:/^__|\*\*/,middle:/^__(?=\S)([\s\S]*?\S)__(?!_)|^\*\*(?=\S)([\s\S]*?\S)\*\*(?!\*)/,endAst:/\*\*(?!\*)/g,endUnd:/__(?!_)/g},em:{start:/^_|\*/,middle:/^()\*(?=\S)([\s\S]*?\S)\*(?!\*)|^_(?=\S)([\s\S]*?\S)_(?!_)/,endAst:/\*(?!\*)/g,endUnd:/_(?!_)/g},link:f(/^!?\[(label)\]\((.*?)\)/).replace("label",S._label).getRegex(),reflink:f(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",S._label).getRegex()}),S.gfm=B({},S.normal,{escape:f(S.escape).replace("])","~|])").getRegex(),_extended_email:/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/,url:/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,_backpedal:/(?:[^?!.,:;*_~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])([\s\S]*?[^\s~])\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/}),S.gfm.url=f(S.gfm.url,"i").replace("email",S.gfm._extended_email).getRegex(),S.breaks=B({},S.gfm,{br:f(S.br).replace("{2,}","*").getRegex(),text:f(S.gfm.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()});var I=function(){function u(e){this.tokens=[],this.tokens.links=Object.create(null),this.options=e||r.defaults,this.options.tokenizer=this.options.tokenizer||new z,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,(this.tokenizer.lexer=this).inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};e={block:$.normal,inline:S.normal};this.options.pedantic?(e.block=$.pedantic,e.inline=S.pedantic):this.options.gfm&&(e.block=$.gfm,this.options.breaks?e.inline=S.breaks:e.inline=S.gfm),this.tokenizer.rules=e}u.lex=function(e,t){return new u(t).lex(e)},u.lexInline=function(e,t){return new u(t).inlineTokens(e)};var e,t,n=u.prototype;return n.lex=function(e){var t;for(e=e.replace(/\r\n|\r/g,"\n").replace(/\t/g,"    "),this.blockTokens(e,this.tokens);t=this.inlineQueue.shift();)this.inlineTokens(t.src,t.tokens);return this.tokens},n.blockTokens=function(r,t){var u,e,i,n,s=this;for(void 0===t&&(t=[]),this.options.pedantic&&(r=r.replace(/^ +$/gm,""));r;)if(!(this.options.extensions&&this.options.extensions.block&&this.options.extensions.block.some(function(e){return!!(u=e.call({lexer:s},r,t))&&(r=r.substring(u.raw.length),t.push(u),!0)})))if(u=this.tokenizer.space(r))r=r.substring(u.raw.length),u.type&&t.push(u);else if(u=this.tokenizer.code(r))r=r.substring(u.raw.length),!(e=t[t.length-1])||"paragraph"!==e.type&&"text"!==e.type?t.push(u):(e.raw+="\n"+u.raw,e.text+="\n"+u.text,this.inlineQueue[this.inlineQueue.length-1].src=e.text);else if(u=this.tokenizer.fences(r))r=r.substring(u.raw.length),t.push(u);else if(u=this.tokenizer.heading(r))r=r.substring(u.raw.length),t.push(u);else if(u=this.tokenizer.hr(r))r=r.substring(u.raw.length),t.push(u);else if(u=this.tokenizer.blockquote(r))r=r.substring(u.raw.length),t.push(u);else if(u=this.tokenizer.list(r))r=r.substring(u.raw.length),t.push(u);else if(u=this.tokenizer.html(r))r=r.substring(u.raw.length),t.push(u);else if(u=this.tokenizer.def(r))r=r.substring(u.raw.length),!(e=t[t.length-1])||"paragraph"!==e.type&&"text"!==e.type?this.tokens.links[u.tag]||(this.tokens.links[u.tag]={href:u.href,title:u.title}):(e.raw+="\n"+u.raw,e.text+="\n"+u.raw,this.inlineQueue[this.inlineQueue.length-1].src=e.text);else if(u=this.tokenizer.table(r))r=r.substring(u.raw.length),t.push(u);else if(u=this.tokenizer.lheading(r))r=r.substring(u.raw.length),t.push(u);else if(i=r,this.options.extensions&&this.options.extensions.startBlock&&function(){var t,u=1/0,n=r.slice(1);s.options.extensions.startBlock.forEach(function(e){"number"==typeof(t=e.call({lexer:this},n))&&0<=t&&(u=Math.min(u,t))}),u<1/0&&0<=u&&(i=r.substring(0,u+1))}(),this.state.top&&(u=this.tokenizer.paragraph(i)))e=t[t.length-1],n&&"paragraph"===e.type?(e.raw+="\n"+u.raw,e.text+="\n"+u.text,this.inlineQueue.pop(),this.inlineQueue[this.inlineQueue.length-1].src=e.text):t.push(u),n=i.length!==r.length,r=r.substring(u.raw.length);else if(u=this.tokenizer.text(r))r=r.substring(u.raw.length),(e=t[t.length-1])&&"text"===e.type?(e.raw+="\n"+u.raw,e.text+="\n"+u.text,this.inlineQueue.pop(),this.inlineQueue[this.inlineQueue.length-1].src=e.text):t.push(u);else if(r){var l="Infinite loop on byte: "+r.charCodeAt(0);if(this.options.silent){console.error(l);break}throw new Error(l)}return this.state.top=!0,t},n.inline=function(e,t){this.inlineQueue.push({src:e,tokens:t})},n.inlineTokens=function(r,t){var u,e,i,s=this;void 0===t&&(t=[]);var n,l,a,D=r;if(this.tokens.links){var o=Object.keys(this.tokens.links);if(0<o.length)for(;null!=(n=this.tokenizer.rules.inline.reflinkSearch.exec(D));)o.includes(n[0].slice(n[0].lastIndexOf("[")+1,-1))&&(D=D.slice(0,n.index)+"["+y("a",n[0].length-2)+"]"+D.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;null!=(n=this.tokenizer.rules.inline.blockSkip.exec(D));)D=D.slice(0,n.index)+"["+y("a",n[0].length-2)+"]"+D.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);for(;null!=(n=this.tokenizer.rules.inline.escapedEmSt.exec(D));)D=D.slice(0,n.index)+"++"+D.slice(this.tokenizer.rules.inline.escapedEmSt.lastIndex);for(;r;)if(l||(a=""),l=!1,!(this.options.extensions&&this.options.extensions.inline&&this.options.extensions.inline.some(function(e){return!!(u=e.call({lexer:s},r,t))&&(r=r.substring(u.raw.length),t.push(u),!0)})))if(u=this.tokenizer.escape(r))r=r.substring(u.raw.length),t.push(u);else if(u=this.tokenizer.tag(r))r=r.substring(u.raw.length),(e=t[t.length-1])&&"text"===u.type&&"text"===e.type?(e.raw+=u.raw,e.text+=u.text):t.push(u);else if(u=this.tokenizer.link(r))r=r.substring(u.raw.length),t.push(u);else if(u=this.tokenizer.reflink(r,this.tokens.links))r=r.substring(u.raw.length),(e=t[t.length-1])&&"text"===u.type&&"text"===e.type?(e.raw+=u.raw,e.text+=u.text):t.push(u);else if(u=this.tokenizer.emStrong(r,D,a))r=r.substring(u.raw.length),t.push(u);else if(u=this.tokenizer.codespan(r))r=r.substring(u.raw.length),t.push(u);else if(u=this.tokenizer.br(r))r=r.substring(u.raw.length),t.push(u);else if(u=this.tokenizer.del(r))r=r.substring(u.raw.length),t.push(u);else if(u=this.tokenizer.autolink(r,R))r=r.substring(u.raw.length),t.push(u);else if(this.state.inLink||!(u=this.tokenizer.url(r,R))){if(i=r,this.options.extensions&&this.options.extensions.startInline&&function(){var t,u=1/0,n=r.slice(1);s.options.extensions.startInline.forEach(function(e){"number"==typeof(t=e.call({lexer:this},n))&&0<=t&&(u=Math.min(u,t))}),u<1/0&&0<=u&&(i=r.substring(0,u+1))}(),u=this.tokenizer.inlineText(i,T))r=r.substring(u.raw.length),"_"!==u.raw.slice(-1)&&(a=u.raw.slice(-1)),l=!0,(e=t[t.length-1])&&"text"===e.type?(e.raw+=u.raw,e.text+=u.text):t.push(u);else if(r){var c="Infinite loop on byte: "+r.charCodeAt(0);if(this.options.silent){console.error(c);break}throw new Error(c)}}else r=r.substring(u.raw.length),t.push(u);return t},e=u,t=[{key:"rules",get:function(){return{block:$,inline:S}}}],(n=null)&&i(e.prototype,n),t&&i(e,t),u}(),Z=function(){function e(e){this.options=e||r.defaults}var t=e.prototype;return t.code=function(e,t,u){var n=(t||"").match(/\S*/)[0];return!this.options.highlight||null!=(t=this.options.highlight(e,n))&&t!==e&&(u=!0,e=t),e=e.replace(/\n$/,"")+"\n",n?'<pre><code class="'+this.options.langPrefix+c(n,!0)+'">'+(u?e:c(e,!0))+"</code></pre>\n":"<pre><code>"+(u?e:c(e,!0))+"</code></pre>\n"},t.blockquote=function(e){return"<blockquote>\n"+e+"</blockquote>\n"},t.html=function(e){return e},t.heading=function(e,t,u,n){return this.options.headerIds?"<h"+t+' id="'+this.options.headerPrefix+n.slug(u)+'">'+e+"</h"+t+">\n":"<h"+t+">"+e+"</h"+t+">\n"},t.hr=function(){return this.options.xhtml?"<hr/>\n":"<hr>\n"},t.list=function(e,t,u){var n=t?"ol":"ul";return"<"+n+(t&&1!==u?' start="'+u+'"':"")+">\n"+e+"</"+n+">\n"},t.listitem=function(e){return"<li>"+e+"</li>\n"},t.checkbox=function(e){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox"'+(this.options.xhtml?" /":"")+"> "},t.paragraph=function(e){return"<p>"+e+"</p>\n"},t.table=function(e,t){return"<table>\n<thead>\n"+e+"</thead>\n"+(t=t&&"<tbody>"+t+"</tbody>")+"</table>\n"},t.tablerow=function(e){return"<tr>\n"+e+"</tr>\n"},t.tablecell=function(e,t){var u=t.header?"th":"td";return(t.align?"<"+u+' align="'+t.align+'">':"<"+u+">")+e+"</"+u+">\n"},t.strong=function(e){return"<strong>"+e+"</strong>"},t.em=function(e){return"<em>"+e+"</em>"},t.codespan=function(e){return"<code>"+e+"</code>"},t.br=function(){return this.options.xhtml?"<br/>":"<br>"},t.del=function(e){return"<del>"+e+"</del>"},t.link=function(e,t,u){if(null===(e=A(this.options.sanitize,this.options.baseUrl,e)))return u;e='<a href="'+c(e)+'"';return t&&(e+=' title="'+t+'"'),e+=">"+u+"</a>"},t.image=function(e,t,u){if(null===(e=A(this.options.sanitize,this.options.baseUrl,e)))return u;u='<img src="'+e+'" alt="'+u+'"';return t&&(u+=' title="'+t+'"'),u+=this.options.xhtml?"></img>":">"},t.text=function(e){return e},e}(),O=function(){function e(){}var t=e.prototype;return t.strong=function(e){return e},t.em=function(e){return e},t.codespan=function(e){return e},t.del=function(e){return e},t.html=function(e){return e},t.text=function(e){return e},t.link=function(e,t,u){return""+u},t.image=function(e,t,u){return""+u},t.br=function(){return""},e}(),q=function(){function e(){this.seen={}}var t=e.prototype;return t.serialize=function(e){return e.toLowerCase().trim().replace(/<[!\/a-z].*?>/gi,"").replace(/[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,./:;<=>?@[\]^`{|}~]/g,"").replace(/\s/g,"-")},t.getNextSafeSlug=function(e,t){var u=e,n=0;if(this.seen.hasOwnProperty(u))for(n=this.seen[e];u=e+"-"+ ++n,this.seen.hasOwnProperty(u););return t||(this.seen[e]=n,this.seen[u]=0),u},t.slug=function(e,t){void 0===t&&(t={});var u=this.serialize(e);return this.getNextSafeSlug(u,t.dryrun)},e}(),j=function(){function u(e){this.options=e||r.defaults,this.options.renderer=this.options.renderer||new Z,this.renderer=this.options.renderer,this.renderer.options=this.options,this.textRenderer=new O,this.slugger=new q}u.parse=function(e,t){return new u(t).parse(e)},u.parseInline=function(e,t){return new u(t).parseInline(e)};var e=u.prototype;return e.parse=function(e,t){void 0===t&&(t=!0);for(var u,n,r,i,s,l,a,D,o,c,h,p,f,F,g,A,C="",d=e.length,k=0;k<d;k++)if(D=e[k],!(this.options.extensions&&this.options.extensions.renderers&&this.options.extensions.renderers[D.type])||!1===(A=this.options.extensions.renderers[D.type].call({parser:this},D))&&["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(D.type))switch(D.type){case"space":continue;case"hr":C+=this.renderer.hr();continue;case"heading":C+=this.renderer.heading(this.parseInline(D.tokens),D.depth,x(this.parseInline(D.tokens,this.textRenderer)),this.slugger);continue;case"code":C+=this.renderer.code(D.text,D.lang,D.escaped);continue;case"table":for(l=o="",r=D.header.length,u=0;u<r;u++)l+=this.renderer.tablecell(this.parseInline(D.header[u].tokens),{header:!0,align:D.align[u]});for(o+=this.renderer.tablerow(l),a="",r=D.rows.length,u=0;u<r;u++){for(l="",i=(s=D.rows[u]).length,n=0;n<i;n++)l+=this.renderer.tablecell(this.parseInline(s[n].tokens),{header:!1,align:D.align[n]});a+=this.renderer.tablerow(l)}C+=this.renderer.table(o,a);continue;case"blockquote":a=this.parse(D.tokens),C+=this.renderer.blockquote(a);continue;case"list":for(o=D.ordered,E=D.start,c=D.loose,r=D.items.length,a="",u=0;u<r;u++)f=(p=D.items[u]).checked,F=p.task,h="",p.task&&(g=this.renderer.checkbox(f),c?0<p.tokens.length&&"paragraph"===p.tokens[0].type?(p.tokens[0].text=g+" "+p.tokens[0].text,p.tokens[0].tokens&&0<p.tokens[0].tokens.length&&"text"===p.tokens[0].tokens[0].type&&(p.tokens[0].tokens[0].text=g+" "+p.tokens[0].tokens[0].text)):p.tokens.unshift({type:"text",text:g}):h+=g),h+=this.parse(p.tokens,c),a+=this.renderer.listitem(h,F,f);C+=this.renderer.list(a,o,E);continue;case"html":C+=this.renderer.html(D.text);continue;case"paragraph":C+=this.renderer.paragraph(this.parseInline(D.tokens));continue;case"text":for(a=D.tokens?this.parseInline(D.tokens):D.text;k+1<d&&"text"===e[k+1].type;)a+="\n"+((D=e[++k]).tokens?this.parseInline(D.tokens):D.text);C+=t?this.renderer.paragraph(a):a;continue;default:var E='Token with "'+D.type+'" type was not found.';if(this.options.silent)return void console.error(E);throw new Error(E)}else C+=A||"";return C},e.parseInline=function(e,t){t=t||this.renderer;for(var u,n,r="",i=e.length,s=0;s<i;s++)if(u=e[s],!(this.options.extensions&&this.options.extensions.renderers&&this.options.extensions.renderers[u.type])||!1===(n=this.options.extensions.renderers[u.type].call({parser:this},u))&&["escape","html","link","image","strong","em","codespan","br","del","text"].includes(u.type))switch(u.type){case"escape":r+=t.text(u.text);break;case"html":r+=t.html(u.text);break;case"link":r+=t.link(u.href,u.title,this.parseInline(u.tokens,t));break;case"image":r+=t.image(u.href,u.title,u.text);break;case"strong":r+=t.strong(this.parseInline(u.tokens,t));break;case"em":r+=t.em(this.parseInline(u.tokens,t));break;case"codespan":r+=t.codespan(u.text);break;case"br":r+=t.br();break;case"del":r+=t.del(this.parseInline(u.tokens,t));break;case"text":r+=t.text(u.text);break;default:var l='Token with "'+u.type+'" type was not found.';if(this.options.silent)return void console.error(l);throw new Error(l)}else r+=n||"";return r},u}();function L(e,u,n){if(null==e)throw new Error("marked(): input parameter is undefined or null");if("string"!=typeof e)throw new Error("marked(): input parameter is of type "+Object.prototype.toString.call(e)+", string expected");if("function"==typeof u&&(n=u,u=null),v(u=B({},L.defaults,u||{})),n){var r,i=u.highlight;try{r=I.lex(e,u)}catch(e){return n(e)}var s=function(t){var e;if(!t)try{u.walkTokens&&L.walkTokens(r,u.walkTokens),e=j.parse(r,u)}catch(e){t=e}return u.highlight=i,t?n(t):n(null,e)};if(!i||i.length<3)return s();if(delete u.highlight,!r.length)return s();var l=0;return L.walkTokens(r,function(u){"code"===u.type&&(l++,setTimeout(function(){i(u.text,u.lang,function(e,t){return e?s(e):(null!=t&&t!==u.text&&(u.text=t,u.escaped=!0),void(0===--l&&s()))})},0))}),void(0===l&&s())}try{var t=I.lex(e,u);return u.walkTokens&&L.walkTokens(t,u.walkTokens),j.parse(t,u)}catch(e){if(e.message+="\nPlease report this to https://github.com/markedjs/marked.",u.silent)return"<p>An error occurred:</p><pre>"+c(e.message+"",!0)+"</pre>";throw e}}L.options=L.setOptions=function(e){return B(L.defaults,e),e=L.defaults,r.defaults=e,L},L.getDefaults=e,L.defaults=r.defaults,L.use=function(){for(var e=arguments.length,t=new Array(e),u=0;u<e;u++)t[u]=arguments[u];var n,r=B.apply(void 0,[{}].concat(t)),s=L.defaults.extensions||{renderers:{},childTokens:{}};t.forEach(function(l){var t;l.extensions&&(n=!0,l.extensions.forEach(function(r){if(!r.name)throw new Error("extension name required");var i;if(r.renderer&&(i=s.renderers?s.renderers[r.name]:null,s.renderers[r.name]=i?function(){for(var e=arguments.length,t=new Array(e),u=0;u<e;u++)t[u]=arguments[u];var n=r.renderer.apply(this,t);return n=!1===n?i.apply(this,t):n}:r.renderer),r.tokenizer){if(!r.level||"block"!==r.level&&"inline"!==r.level)throw new Error("extension level must be 'block' or 'inline'");s[r.level]?s[r.level].unshift(r.tokenizer):s[r.level]=[r.tokenizer],r.start&&("block"===r.level?s.startBlock?s.startBlock.push(r.start):s.startBlock=[r.start]:"inline"===r.level&&(s.startInline?s.startInline.push(r.start):s.startInline=[r.start]))}r.childTokens&&(s.childTokens[r.name]=r.childTokens)})),l.renderer&&function(){var e,s=L.defaults.renderer||new Z;for(e in l.renderer)!function(r){var i=s[r];s[r]=function(){for(var e=arguments.length,t=new Array(e),u=0;u<e;u++)t[u]=arguments[u];var n=l.renderer[r].apply(s,t);return n=!1===n?i.apply(s,t):n}}(e);r.renderer=s}(),l.tokenizer&&function(){var e,s=L.defaults.tokenizer||new z;for(e in l.tokenizer)!function(r){var i=s[r];s[r]=function(){for(var e=arguments.length,t=new Array(e),u=0;u<e;u++)t[u]=arguments[u];var n=l.tokenizer[r].apply(s,t);return n=!1===n?i.apply(s,t):n}}(e);r.tokenizer=s}(),l.walkTokens&&(t=L.defaults.walkTokens,r.walkTokens=function(e){l.walkTokens.call(this,e),t&&t.call(this,e)}),n&&(r.extensions=s),L.setOptions(r)})},L.walkTokens=function(e,l){for(var a,t=D(e);!(a=t()).done;)!function(){var t=a.value;switch(l.call(L,t),t.type){case"table":for(var e=D(t.header);!(u=e()).done;){var u=u.value;L.walkTokens(u.tokens,l)}for(var n,r=D(t.rows);!(n=r()).done;)for(var i=D(n.value);!(s=i()).done;){var s=s.value;L.walkTokens(s.tokens,l)}break;case"list":L.walkTokens(t.items,l);break;default:L.defaults.extensions&&L.defaults.extensions.childTokens&&L.defaults.extensions.childTokens[t.type]?L.defaults.extensions.childTokens[t.type].forEach(function(e){L.walkTokens(t[e],l)}):t.tokens&&L.walkTokens(t.tokens,l)}}()},L.parseInline=function(e,t){if(null==e)throw new Error("marked.parseInline(): input parameter is undefined or null");if("string"!=typeof e)throw new Error("marked.parseInline(): input parameter is of type "+Object.prototype.toString.call(e)+", string expected");v(t=B({},L.defaults,t||{}));try{var u=I.lexInline(e,t);return t.walkTokens&&L.walkTokens(u,t.walkTokens),j.parseInline(u,t)}catch(e){if(e.message+="\nPlease report this to https://github.com/markedjs/marked.",t.silent)return"<p>An error occurred:</p><pre>"+c(e.message+"",!0)+"</pre>";throw e}},L.Parser=j,L.parser=j.parse,L.Renderer=Z,L.TextRenderer=O,L.Lexer=I,L.lexer=I.lex,L.Tokenizer=z,L.Slugger=q;var P=(L.parse=L).options,Q=L.setOptions,U=L.use,M=L.walkTokens,N=L.parseInline,X=L,G=j.parse,m=I.lex;r.Lexer=I,r.Parser=j,r.Renderer=Z,r.Slugger=q,r.TextRenderer=O,r.Tokenizer=z,r.getDefaults=e,r.lexer=m,r.marked=L,r.options=P,r.parse=X,r.parseInline=N,r.parser=G,r.setOptions=Q,r.use=U,r.walkTokens=M,Object.defineProperty(r,"__esModule",{value:!0})});if(!UC_API.Prefs.get("sine.env-key").exists() || (UC_API.Prefs.get("sine.env-key").exists() && !UC_API.Prefs.get("sine.env-key").value.includes("env:tangentx44-dev:"))){UC_API.Prefs.set("sine.enable-tangent",false);}
const markedStyles = `@media (prefers-color-scheme:dark){.markdown-body{color-scheme:dark;--color-prettylights-syntax-comment:#929aa4;--color-prettylights-syntax-constant:#80c4ff;--color-prettylights-syntax-entity:#d7b1ff;--color-prettylights-syntax-storage-modifier-import:#ced5dd;--color-prettylights-syntax-entity-tag:#82eb8a;--color-prettylights-syntax-keyword:#ff817a;--color-prettylights-syntax-string:#abd9ff;--color-prettylights-syntax-variable:#ffac60;--color-prettylights-syntax-brackethighlighter-unmatched:#f95a52;--color-prettylights-syntax-invalid-illegal-text:#f3f8fd;--color-prettylights-syntax-invalid-illegal-bg:#941a1e;--color-prettylights-syntax-carriage-return-text:#f3f8fd;--color-prettylights-syntax-carriage-return-bg:#bb2829;--color-prettylights-syntax-string-regexp:#82eb8a;--color-prettylights-syntax-markup-list:#f5d06a;--color-prettylights-syntax-markup-heading:#2474f0;--color-prettylights-syntax-markup-italic:#ced5dd;--color-prettylights-syntax-markup-bold:#ced5dd;--color-prettylights-syntax-markup-deleted-text:#ffe0db;--color-prettylights-syntax-markup-deleted-bg:#6e0a12;--color-prettylights-syntax-markup-inserted-text:#b3f7b9;--color-prettylights-syntax-markup-inserted-bg:#063e1a;--color-prettylights-syntax-markup-changed-text:#ffe2bb;--color-prettylights-syntax-markup-changed-bg:#5f2305;--color-prettylights-syntax-markup-ignored-text:#ced5dd;--color-prettylights-syntax-markup-ignored-bg:#145ecc;--color-prettylights-syntax-meta-diff-range:#d7b1ff;--color-prettylights-syntax-brackethighlighter-angle:#929aa4;--color-prettylights-syntax-sublimelinter-gutter-mark:#4e555e;--color-prettylights-syntax-constant-other-reference-link:#abd9ff;--color-fg-default:#ced5dd;--color-fg-muted:#929aa4;--color-fg-subtle:#4e555e;--color-canvas-default:#1e1f1f;--color-canvas-subtle:#252727;--color-border-default:#353b42;--color-border-muted:#282d34;--color-neutral-muted:rgba(115,123,134,0.4);--color-accent-fg:#5eb0ff;--color-accent-emphasis:#2474f0;--color-attention-subtle:rgba(192,135,15,0.15);--color-danger-fg:#f95a52}}@media (prefers-color-scheme:light){.markdown-body{color-scheme:light;--color-prettylights-syntax-comment:#6e7781;--color-prettylights-syntax-constant:#0550ae;--color-prettylights-syntax-entity:#8250df;--color-prettylights-syntax-storage-modifier-import:#24292f;--color-prettylights-syntax-entity-tag:#116329;--color-prettylights-syntax-keyword:#cf222e;--color-prettylights-syntax-string:#0a3069;--color-prettylights-syntax-variable:#953800;--color-prettylights-syntax-brackethighlighter-unmatched:#82071e;--color-prettylights-syntax-invalid-illegal-text:#f6f8fa;--color-prettylights-syntax-invalid-illegal-bg:#82071e;--color-prettylights-syntax-carriage-return-text:#f6f8fa;--color-prettylights-syntax-carriage-return-bg:#cf222e;--color-prettylights-syntax-string-regexp:#116329;--color-prettylights-syntax-markup-list:#3b2300;--color-prettylights-syntax-markup-heading:#0550ae;--color-prettylights-syntax-markup-italic:#24292f;--color-prettylights-syntax-markup-bold:#24292f;--color-prettylights-syntax-markup-deleted-text:#82071e;--color-prettylights-syntax-markup-deleted-bg:#FFEBE9;--color-prettylights-syntax-markup-inserted-text:#116329;--color-prettylights-syntax-markup-inserted-bg:#dafbe1;--color-prettylights-syntax-markup-changed-text:#953800;--color-prettylights-syntax-markup-changed-bg:#ffd8b5;--color-prettylights-syntax-markup-ignored-text:#eaeef2;--color-prettylights-syntax-markup-ignored-bg:#0550ae;--color-prettylights-syntax-meta-diff-range:#8250df;--color-prettylights-syntax-brackethighlighter-angle:#57606a;--color-prettylights-syntax-sublimelinter-gutter-mark:#8c959f;--color-prettylights-syntax-constant-other-reference-link:#0a3069;--color-fg-default:#24292f;--color-fg-muted:#57606a;--color-fg-subtle:#6e7781;--color-canvas-default:#ffffff;--color-canvas-subtle:#f6f8fa;--color-border-default:#d0d7de;--color-border-muted:hsla(210,18%,87%,1);--color-neutral-muted:rgba(175,184,193,0.2);--color-accent-fg:#0969da;--color-accent-emphasis:#0969da;--color-attention-subtle:#fff8c5;--color-danger-fg:#cf222e}}.markdown-body{-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;margin:0;color:var(--color-fg-default);background-color:var(--color-canvas-default);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji";font-size:16px;line-height:1.5;word-wrap:break-word}.markdown-body h1:hover .anchor .octicon-link:before,.markdown-body h2:hover .anchor .octicon-link:before,.markdown-body h3:hover .anchor .octicon-link:before,.markdown-body h4:hover .anchor .octicon-link:before,.markdown-body h5:hover .anchor .octicon-link:before,.markdown-body h6:hover .anchor .octicon-link:before{width:16px;height:16px;content:' ';display:inline-block;background-color:currentColor;-webkit-mask-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' version='1.1' aria-hidden='true'><path fill-rule='evenodd' d='M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 010-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25a.75.75 0 00-1.06-1.06l-1.25 1.25a2 2 0 01-2.83 0z'></path></svg>");mask-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' version='1.1' aria-hidden='true'><path fill-rule='evenodd' d='M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 010-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25a.75.75 0 00-1.06-1.06l-1.25 1.25a2 2 0 01-2.83 0z'></path></svg>")}.markdown-body [data-catalyst],.markdown-body details,.markdown-body figcaption,.markdown-body figure{display:block}.markdown-body summary{display:list-item}.markdown-body [hidden],.markdown-body details:not([open])>:not(summary){display:none!important}.markdown-body a{background-color:transparent;color:var(--color-accent-fg);text-decoration:none}.markdown-body a:active,.markdown-body a:hover{outline-width:0}.markdown-body abbr[title]{border-bottom:none;text-decoration:underline dotted}.markdown-body .pl-corl,.markdown-body a:hover{text-decoration:underline}.markdown-body b,.markdown-body strong,.markdown-body table th{font-weight:600}.markdown-body dfn{font-style:italic}.markdown-body h1{margin:.67em 0;padding-bottom:.3em;font-size:2em;border-bottom:1px solid var(--color-border-muted)}.markdown-body mark{background-color:var(--color-attention-subtle);color:var(--color-text-primary)}.markdown-body img,.markdown-body table tr{background-color:var(--color-canvas-default)}.markdown-body small{font-size:90%}.markdown-body sub,.markdown-body sup{font-size:75%;line-height:0;position:relative;vertical-align:baseline}.markdown-body sub{bottom:-.25em}.markdown-body sup{top:-.5em}.markdown-body img{border-style:none;max-width:100%;box-sizing:content-box}.markdown-body code,.markdown-body kbd,.markdown-body pre,.markdown-body samp{font-family:monospace,monospace;font-size:1em}.markdown-body figure{margin:1em 40px}.markdown-body hr{box-sizing:content-box;overflow:hidden;background:0 0;border-bottom:1px solid var(--color-border-muted);height:.25em;padding:0;margin:24px 0;background-color:var(--color-border-default);border:0}.markdown-body kbd,.markdown-body table tr:nth-child(2n){background-color:var(--color-canvas-subtle)}.markdown-body input{font:inherit;margin:0;overflow:visible;font-family:inherit;font-size:inherit;line-height:inherit}.markdown-body [type=button],.markdown-body [type=reset],.markdown-body [type=submit]{-webkit-appearance:button}.markdown-body [type=button]::-moz-focus-inner,.markdown-body [type=reset]::-moz-focus-inner,.markdown-body [type=submit]::-moz-focus-inner{border-style:none;padding:0}.markdown-body [type=button]:-moz-focusring,.markdown-body [type=reset]:-moz-focusring,.markdown-body [type=submit]:-moz-focusring{outline:ButtonText dotted 1px}.markdown-body [type=checkbox],.markdown-body [type=radio]{box-sizing:border-box;padding:0}.markdown-body [type=number]::-webkit-inner-spin-button,.markdown-body [type=number]::-webkit-outer-spin-button{height:auto}.markdown-body [type=search]{-webkit-appearance:textfield;outline-offset:-2px}.markdown-body [type=search]::-webkit-search-cancel-button,.markdown-body [type=search]::-webkit-search-decoration{-webkit-appearance:none}.markdown-body ::-webkit-input-placeholder{color:inherit;opacity:.54}.markdown-body ::-webkit-file-upload-button{-webkit-appearance:button;font:inherit}.markdown-body hr::before,.markdown-body::before{display:table;content:""}.markdown-body hr::after,.markdown-body::after{display:table;clear:both;content:""}.markdown-body table{border-spacing:0;border-collapse:collapse;display:block;width:max-content;max-width:100%;overflow:auto}.markdown-body dl,.markdown-body td,.markdown-body th{padding:0}.markdown-body .task-list-item.enabled label,.markdown-body details summary{cursor:pointer}.markdown-body kbd{display:inline-block;padding:3px 5px;font:11px/10px ui-monospace,SFMono-Regular,SF Mono,Menlo,Consolas,Liberation Mono,monospace;color:var(--color-fg-default);vertical-align:middle;border:solid 1px var(--color-neutral-muted);border-bottom-color:var(--color-neutral-muted);border-radius:6px;box-shadow:inset 0 -1px 0 var(--color-neutral-muted)}.markdown-body code,.markdown-body pre,.markdown-body tt{font-family:ui-monospace,SFMono-Regular,SF Mono,Menlo,Consolas,Liberation Mono,monospace}.markdown-body h1,.markdown-body h2,.markdown-body h3,.markdown-body h4,.markdown-body h5,.markdown-body h6{margin-top:24px;margin-bottom:16px;font-weight:600;line-height:1.25}.markdown-body h2{font-weight:600;padding-bottom:.3em;font-size:1.5em;border-bottom:1px solid var(--color-border-muted)}.markdown-body h3{font-weight:600;font-size:1.25em}.markdown-body h4{font-weight:600;font-size:1em}.markdown-body h5{font-weight:600;font-size:.875em}.markdown-body h6{font-weight:600;font-size:.85em;color:var(--color-fg-muted)}.markdown-body blockquote{margin:0;padding:0 1em;color:var(--color-fg-muted);border-left:.25em solid var(--color-border-default)}.markdown-body ol,.markdown-body ul{padding-left:2em}.markdown-body ol ol,.markdown-body ol[type=i],.markdown-body ul ol{list-style-type:lower-roman}.markdown-body ol ol ol,.markdown-body ol ul ol,.markdown-body ol[type=a],.markdown-body ul ol ol,.markdown-body ul ul ol{list-style-type:lower-alpha}.markdown-body dd{margin-left:0}.markdown-body pre{word-wrap:normal}.markdown-body .octicon{fill:currentColor;display:inline-block;overflow:visible!important;vertical-align:text-bottom;fill:currentColor}.markdown-body ::placeholder{color:var(--color-fg-subtle);opacity:1}.markdown-body input::-webkit-inner-spin-button,.markdown-body input::-webkit-outer-spin-button{margin:0;-webkit-appearance:none;appearance:none}.markdown-body .pl-c{color:var(--color-prettylights-syntax-comment)}.markdown-body .pl-c1,.markdown-body .pl-s .pl-v{color:var(--color-prettylights-syntax-constant)}.markdown-body .pl-e,.markdown-body .pl-en{color:var(--color-prettylights-syntax-entity)}.markdown-body .pl-s .pl-s1,.markdown-body .pl-smi{color:var(--color-prettylights-syntax-storage-modifier-import)}.markdown-body .pl-ent{color:var(--color-prettylights-syntax-entity-tag)}.markdown-body .pl-k{color:var(--color-prettylights-syntax-keyword)}.markdown-body .pl-pds,.markdown-body .pl-s,.markdown-body .pl-s .pl-pse .pl-s1,.markdown-body .pl-sr,.markdown-body .pl-sr .pl-cce,.markdown-body .pl-sr .pl-sra,.markdown-body .pl-sr .pl-sre{color:var(--color-prettylights-syntax-string)}.markdown-body .pl-smw,.markdown-body .pl-v{color:var(--color-prettylights-syntax-variable)}.markdown-body .pl-bu{color:var(--color-prettylights-syntax-brackethighlighter-unmatched)}.markdown-body .pl-ii{color:var(--color-prettylights-syntax-invalid-illegal-text);background-color:var(--color-prettylights-syntax-invalid-illegal-bg)}.markdown-body .pl-c2{color:var(--color-prettylights-syntax-carriage-return-text);background-color:var(--color-prettylights-syntax-carriage-return-bg)}.markdown-body .pl-sr .pl-cce{font-weight:700;color:var(--color-prettylights-syntax-string-regexp)}.markdown-body .pl-ml{color:var(--color-prettylights-syntax-markup-list)}.markdown-body .pl-mh,.markdown-body .pl-mh .pl-en,.markdown-body .pl-ms{font-weight:700;color:var(--color-prettylights-syntax-markup-heading)}.markdown-body .pl-mi{font-style:italic;color:var(--color-prettylights-syntax-markup-italic)}.markdown-body .pl-mb{font-weight:700;color:var(--color-prettylights-syntax-markup-bold)}.markdown-body .pl-md{color:var(--color-prettylights-syntax-markup-deleted-text);background-color:var(--color-prettylights-syntax-markup-deleted-bg)}.markdown-body .pl-mi1{color:var(--color-prettylights-syntax-markup-inserted-text);background-color:var(--color-prettylights-syntax-markup-inserted-bg)}.markdown-body .pl-mc{color:var(--color-prettylights-syntax-markup-changed-text);background-color:var(--color-prettylights-syntax-markup-changed-bg)}.markdown-body .pl-mi2{color:var(--color-prettylights-syntax-markup-ignored-text);background-color:var(--color-prettylights-syntax-markup-ignored-bg)}.markdown-body .pl-mdr{font-weight:700;color:var(--color-prettylights-syntax-meta-diff-range)}.markdown-body .pl-ba{color:var(--color-prettylights-syntax-brackethighlighter-angle)}.markdown-body .pl-sg{color:var(--color-prettylights-syntax-sublimelinter-gutter-mark)}.markdown-body .pl-corl{color:var(--color-prettylights-syntax-constant-other-reference-link)}.markdown-body g-emoji{font-family:"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol";font-size:1em;font-style:normal!important;font-weight:400;line-height:1;vertical-align:-.075em}.markdown-body g-emoji img{width:1em;height:1em}.markdown-body>:first-child{margin-top:0!important}.markdown-body>:last-child{margin-bottom:0!important}.markdown-body a:not([href]){color:inherit;text-decoration:none}.markdown-body .absent{color:var(--color-danger-fg)}.markdown-body .anchor{float:left;padding-right:4px;margin-left:-20px;line-height:1}.markdown-body .anchor:focus{outline:0}.markdown-body blockquote,.markdown-body details,.markdown-body dl,.markdown-body ol,.markdown-body p,.markdown-body pre,.markdown-body table,.markdown-body ul{margin-top:0;margin-bottom:16px}.markdown-body blockquote>:first-child{margin-top:0}.markdown-body blockquote>:last-child{margin-bottom:0}.markdown-body sup>a::before{content:"["}.markdown-body sup>a::after{content:"]"}.markdown-body h1 .octicon-link,.markdown-body h2 .octicon-link,.markdown-body h3 .octicon-link,.markdown-body h4 .octicon-link,.markdown-body h5 .octicon-link,.markdown-body h6 .octicon-link{color:var(--color-fg-default);vertical-align:middle;visibility:hidden}.markdown-body h1:hover .anchor,.markdown-body h2:hover .anchor,.markdown-body h3:hover .anchor,.markdown-body h4:hover .anchor,.markdown-body h5:hover .anchor,.markdown-body h6:hover .anchor{text-decoration:none}.markdown-body h1:hover .anchor .octicon-link,.markdown-body h2:hover .anchor .octicon-link,.markdown-body h3:hover .anchor .octicon-link,.markdown-body h4:hover .anchor .octicon-link,.markdown-body h5:hover .anchor .octicon-link,.markdown-body h6:hover .anchor .octicon-link{visibility:visible}.markdown-body h1 code,.markdown-body h1 tt,.markdown-body h2 code,.markdown-body h2 tt,.markdown-body h3 code,.markdown-body h3 tt,.markdown-body h4 code,.markdown-body h4 tt,.markdown-body h5 code,.markdown-body h5 tt,.markdown-body h6 code,.markdown-body h6 tt{padding:0 .2em;font-size:inherit}.markdown-body ol.no-list,.markdown-body ul.no-list{padding:0;list-style-type:none}.markdown-body div>ol:not([type]),.markdown-body ol[type="1"]{list-style-type:decimal}.markdown-body ol ol,.markdown-body ol ul,.markdown-body ul ol,.markdown-body ul ul{margin-top:0;margin-bottom:0}.markdown-body li>p{margin-top:16px}.markdown-body li+li{margin-top:.25em}.markdown-body dl dt{padding:0;margin-top:16px;font-size:1em;font-style:italic;font-weight:600}.markdown-body dl dd{padding:0 16px;margin-bottom:16px}.markdown-body table td,.markdown-body table th{padding:6px 13px;border:1px solid var(--color-border-default)}.markdown-body table tr{border-top:1px solid var(--color-border-muted)}.markdown-body .emoji,.markdown-body table img{background-color:transparent}.markdown-body img[align=right]{padding-left:20px}.markdown-body img[align=left]{padding-right:20px}.markdown-body .emoji{max-width:none;vertical-align:text-top}.markdown-body span.frame{display:block;overflow:hidden}.markdown-body span.frame>span{display:block;float:left;width:auto;padding:7px;margin:13px 0 0;overflow:hidden;border:1px solid var(--color-border-default)}.markdown-body span.frame span img{display:block;float:left}.markdown-body span.frame span span{display:block;padding:5px 0 0;clear:both;color:var(--color-fg-default)}.markdown-body span.align-center,.markdown-body span.align-right{display:block;overflow:hidden;clear:both}.markdown-body span.align-center>span{display:block;margin:13px auto 0;overflow:hidden;text-align:center}.markdown-body span.align-center span img{margin:0 auto;text-align:center}.markdown-body span.align-right>span{display:block;margin:13px 0 0;overflow:hidden;text-align:right}.markdown-body span.align-right span img{margin:0;text-align:right}.markdown-body span.float-left{display:block;float:left;margin-right:13px;overflow:hidden}.markdown-body span.float-left span{margin:13px 0 0}.markdown-body span.float-right{display:block;float:right;margin-left:13px;overflow:hidden}.markdown-body span.float-right>span{display:block;margin:13px auto 0;overflow:hidden;text-align:right}.markdown-body code,.markdown-body tt{padding:.2em .4em;margin:0;font-size:85%;background-color:var(--color-neutral-muted);border-radius:6px}.markdown-body .task-list-item .handle,.markdown-body code br,.markdown-body tt br{display:none}.markdown-body del code{text-decoration:inherit}.markdown-body pre code{font-size:100%}.markdown-body pre>code{padding:0;margin:0;word-break:normal;white-space:pre;background:0 0;border:0}.markdown-body .highlight{margin-bottom:16px}.markdown-body .highlight pre{margin-bottom:0;word-break:normal}.markdown-body .highlight pre,.markdown-body pre{padding:16px;overflow:auto;font-size:85%;line-height:1.45;background-color:var(--color-canvas-subtle);border-radius:6px}.markdown-body pre code,.markdown-body pre tt{display:inline;max-width:auto;padding:0;margin:0;overflow:visible;line-height:inherit;word-wrap:normal;background-color:transparent;border:0}.markdown-body .csv-data td,.markdown-body .csv-data th{padding:5px;overflow:hidden;font-size:12px;line-height:1;text-align:left;white-space:nowrap}.markdown-body .csv-data .blob-num{padding:10px 8px 9px;text-align:right;background:var(--color-canvas-default);border:0}.markdown-body .csv-data tr{border-top:0}.markdown-body .csv-data th{font-weight:600;background:var(--color-canvas-subtle);border-top:0}.markdown-body .footnotes{font-size:12px;color:var(--color-fg-muted);border-top:1px solid var(--color-border-default)}.markdown-body .footnotes ol{padding-left:16px}.markdown-body .footnotes li{position:relative}.markdown-body .footnotes li:target::before{position:absolute;top:-8px;right:-8px;bottom:-8px;left:-24px;pointer-events:none;content:"";border:2px solid var(--color-accent-emphasis);border-radius:6px}.markdown-body .footnotes li:target{color:var(--color-fg-default)}.markdown-body .footnotes .data-footnote-backref g-emoji{font-family:monospace}.markdown-body .task-list-item{list-style-type:none}.markdown-body .task-list-item label{font-weight:400}.markdown-body .task-list-item+.task-list-item{margin-top:3px}.markdown-body .task-list-item-checkbox{margin:0 .2em .25em -1.6em;vertical-align:middle}.markdown-body .contains-task-list:dir(rtl) .task-list-item-checkbox{margin:0 -1.6em .25em .2em}.markdown-body ::-webkit-calendar-picker-indicator{filter:invert(50%)}`
var hljs=function(){"use strict";function e(n){return n instanceof Map?n.clear=n.delete=n.set=()=>{throw Error("map is read-only")}:n instanceof Set&&(n.add=n.clear=n.delete=()=>{throw Error("set is read-only")}),Object.freeze(n),Object.getOwnPropertyNames(n).forEach((t=>{const a=n[t],i=typeof a;"object"!==i&&"function"!==i||Object.isFrozen(a)||e(a)})),n}class n{constructor(e){void 0===e.data&&(e.data={}),this.data=e.data,this.isMatchIgnored=!1}ignoreMatch(){this.isMatchIgnored=!0}}function t(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#x27;")}function a(e,...n){const t=Object.create(null);for(const n in e)t[n]=e[n];return n.forEach((e=>{for(const n in e)t[n]=e[n]})),t}const i=e=>!!e.scope;class r{constructor(e,n){this.buffer="",this.classPrefix=n.classPrefix,e.walk(this)}addText(e){this.buffer+=t(e)}openNode(e){if(!i(e))return;const n=((e,{prefix:n})=>{if(e.startsWith("language:"))return e.replace("language:","language-");if(e.includes(".")){const t=e.split(".");return[`${n}${t.shift()}`,...t.map(((e,n)=>`${e}${"_".repeat(n+1)}`))].join(" ")}return`${n}${e}`})(e.scope,{prefix:this.classPrefix});this.span(n)}closeNode(e){i(e)&&(this.buffer+="</span>")}value(){return this.buffer}span(e){this.buffer+=`<span class="${e}">`}}const s=(e={})=>{const n={children:[]};return Object.assign(n,e),n};class o{constructor(){this.rootNode=s(),this.stack=[this.rootNode]}get top(){return this.stack[this.stack.length-1]}get root(){return this.rootNode}add(e){this.top.children.push(e)}openNode(e){const n=s({scope:e});this.add(n),this.stack.push(n)}closeNode(){if(this.stack.length>1)return this.stack.pop()}closeAllNodes(){for(;this.closeNode(););}toJSON(){return JSON.stringify(this.rootNode,null,4)}walk(e){return this.constructor._walk(e,this.rootNode)}static _walk(e,n){return"string"==typeof n?e.addText(n):n.children&&(e.openNode(n),n.children.forEach((n=>this._walk(e,n))),e.closeNode(n)),e}static _collapse(e){"string"!=typeof e&&e.children&&(e.children.every((e=>"string"==typeof e))?e.children=[e.children.join("")]:e.children.forEach((e=>{o._collapse(e)})))}}class l extends o{constructor(e){super(),this.options=e}addText(e){""!==e&&this.add(e)}startScope(e){this.openNode(e)}endScope(){this.closeNode()}__addSublanguage(e,n){const t=e.root;n&&(t.scope="language:"+n),this.add(t)}toHTML(){return new r(this,this.options).value()}finalize(){return this.closeAllNodes(),!0}}function c(e){return e?"string"==typeof e?e:e.source:null}function d(e){return b("(?=",e,")")}function g(e){return b("(?:",e,")*")}function u(e){return b("(?:",e,")?")}function b(...e){return e.map((e=>c(e))).join("")}function m(...e){const n=(e=>{const n=e[e.length-1];return"object"==typeof n&&n.constructor===Object?(e.splice(e.length-1,1),n):{}})(e);return"("+(n.capture?"":"?:")+e.map((e=>c(e))).join("|")+")"}function p(e){return RegExp(e.toString()+"|").exec("").length-1}const _=/\[(?:[^\\\]]|\\.)*\]|\(\??|\\([1-9][0-9]*)|\\./;function h(e,{joinWith:n}){let t=0;return e.map((e=>{t+=1;const n=t;let a=c(e),i="";for(;a.length>0;){const e=_.exec(a);if(!e){i+=a;break}i+=a.substring(0,e.index),a=a.substring(e.index+e[0].length),"\\"===e[0][0]&&e[1]?i+="\\"+(Number(e[1])+n):(i+=e[0],"("===e[0]&&t++)}return i})).map((e=>`(${e})`)).join(n)}const f="[a-zA-Z]\\w*",E="[a-zA-Z_]\\w*",y="\\b\\d+(\\.\\d+)?",w="(-?)(\\b0[xX][a-fA-F0-9]+|(\\b\\d+(\\.\\d*)?|\\.\\d+)([eE][-+]?\\d+)?)",v="\\b(0b[01]+)",N={begin:"\\\\[\\s\\S]",relevance:0},k={scope:"string",begin:"'",end:"'",illegal:"\\n",contains:[N]},x={scope:"string",begin:'"',end:'"',illegal:"\\n",contains:[N]},O=(e,n,t={})=>{const i=a({scope:"comment",begin:e,end:n,contains:[]},t);i.contains.push({scope:"doctag",begin:"[ ]*(?=(TODO|FIXME|NOTE|BUG|OPTIMIZE|HACK|XXX):)",end:/(TODO|FIXME|NOTE|BUG|OPTIMIZE|HACK|XXX):/,excludeBegin:!0,relevance:0});const r=m("I","a","is","so","us","to","at","if","in","it","on",/[A-Za-z]+['](d|ve|re|ll|t|s|n)/,/[A-Za-z]+[-][a-z]+/,/[A-Za-z][a-z]{2,}/);return i.contains.push({begin:b(/[ ]+/,"(",r,/[.]?[:]?([.][ ]|[ ])/,"){3}")}),i},M=O("//","$"),A=O("/\\*","\\*/"),S=O("#","$");var C=Object.freeze({__proto__:null,APOS_STRING_MODE:k,BACKSLASH_ESCAPE:N,BINARY_NUMBER_MODE:{scope:"number",begin:v,relevance:0},BINARY_NUMBER_RE:v,COMMENT:O,C_BLOCK_COMMENT_MODE:A,C_LINE_COMMENT_MODE:M,C_NUMBER_MODE:{scope:"number",begin:w,relevance:0},C_NUMBER_RE:w,END_SAME_AS_BEGIN:e=>Object.assign(e,{"on:begin":(e,n)=>{n.data._beginMatch=e[1]},"on:end":(e,n)=>{n.data._beginMatch!==e[1]&&n.ignoreMatch()}}),HASH_COMMENT_MODE:S,IDENT_RE:f,MATCH_NOTHING_RE:/\b\B/,METHOD_GUARD:{begin:"\\.\\s*"+E,relevance:0},NUMBER_MODE:{scope:"number",begin:y,relevance:0},NUMBER_RE:y,PHRASAL_WORDS_MODE:{begin:/\b(a|an|the|are|I'm|isn't|don't|doesn't|won't|but|just|should|pretty|simply|enough|gonna|going|wtf|so|such|will|you|your|they|like|more)\b/},QUOTE_STRING_MODE:x,REGEXP_MODE:{scope:"regexp",begin:/\/(?=[^/\n]*\/)/,end:/\/[gimuy]*/,contains:[N,{begin:/\[/,end:/\]/,relevance:0,contains:[N]}]},RE_STARTERS_RE:"!|!=|!==|%|%=|&|&&|&=|\\*|\\*=|\\+|\\+=|,|-|-=|/=|/|:|;|<<|<<=|<=|<|===|==|=|>>>=|>>=|>=|>>>|>>|>|\\?|\\[|\\{|\\(|\\^|\\^=|\\||\\|=|\\|\\||~",SHEBANG:(e={})=>{const n=/^#![ ]*\//;return e.binary&&(e.begin=b(n,/.*\b/,e.binary,/\b.*/)),a({scope:"meta",begin:n,end:/$/,relevance:0,"on:begin":(e,n)=>{0!==e.index&&n.ignoreMatch()}},e)},TITLE_MODE:{scope:"title",begin:f,relevance:0},UNDERSCORE_IDENT_RE:E,UNDERSCORE_TITLE_MODE:{scope:"title",begin:E,relevance:0}});function T(e,n){"."===e.input[e.index-1]&&n.ignoreMatch()}function R(e,n){void 0!==e.className&&(e.scope=e.className,delete e.className)}function D(e,n){n&&e.beginKeywords&&(e.begin="\\b("+e.beginKeywords.split(" ").join("|")+")(?!\\.)(?=\\b|\\s)",e.__beforeBegin=T,e.keywords=e.keywords||e.beginKeywords,delete e.beginKeywords,void 0===e.relevance&&(e.relevance=0))}function I(e,n){Array.isArray(e.illegal)&&(e.illegal=m(...e.illegal))}function L(e,n){if(e.match){if(e.begin||e.end)throw Error("begin & end are not supported with match");e.begin=e.match,delete e.match}}function B(e,n){void 0===e.relevance&&(e.relevance=1)}const $=(e,n)=>{if(!e.beforeMatch)return;if(e.starts)throw Error("beforeMatch cannot be used with starts");const t=Object.assign({},e);Object.keys(e).forEach((n=>{delete e[n]})),e.keywords=t.keywords,e.begin=b(t.beforeMatch,d(t.begin)),e.starts={relevance:0,contains:[Object.assign(t,{endsParent:!0})]},e.relevance=0,delete t.beforeMatch},F=["of","and","for","in","not","or","if","then","parent","list","value"];function z(e,n,t="keyword"){const a=Object.create(null);return"string"==typeof e?i(t,e.split(" ")):Array.isArray(e)?i(t,e):Object.keys(e).forEach((t=>{Object.assign(a,z(e[t],n,t))})),a;function i(e,t){n&&(t=t.map((e=>e.toLowerCase()))),t.forEach((n=>{const t=n.split("|");a[t[0]]=[e,j(t[0],t[1])]}))}}function j(e,n){return n?Number(n):(e=>F.includes(e.toLowerCase()))(e)?0:1}const U={},P=e=>{console.error(e)},K=(e,...n)=>{console.log("WARN: "+e,...n)},q=(e,n)=>{U[`${e}/${n}`]||(console.log(`Deprecated as of ${e}. ${n}`),U[`${e}/${n}`]=!0)},H=Error();function G(e,n,{key:t}){let a=0;const i=e[t],r={},s={};for(let e=1;e<=n.length;e++)s[e+a]=i[e],r[e+a]=!0,a+=p(n[e-1]);e[t]=s,e[t]._emit=r,e[t]._multi=!0}function Z(e){(e=>{e.scope&&"object"==typeof e.scope&&null!==e.scope&&(e.beginScope=e.scope,delete e.scope)})(e),"string"==typeof e.beginScope&&(e.beginScope={_wrap:e.beginScope}),"string"==typeof e.endScope&&(e.endScope={_wrap:e.endScope}),(e=>{if(Array.isArray(e.begin)){if(e.skip||e.excludeBegin||e.returnBegin)throw P("skip, excludeBegin, returnBegin not compatible with beginScope: {}"),H;if("object"!=typeof e.beginScope||null===e.beginScope)throw P("beginScope must be object"),H;G(e,e.begin,{key:"beginScope"}),e.begin=h(e.begin,{joinWith:""})}})(e),(e=>{if(Array.isArray(e.end)){if(e.skip||e.excludeEnd||e.returnEnd)throw P("skip, excludeEnd, returnEnd not compatible with endScope: {}"),H;if("object"!=typeof e.endScope||null===e.endScope)throw P("endScope must be object"),H;G(e,e.end,{key:"endScope"}),e.end=h(e.end,{joinWith:""})}})(e)}function W(e){function n(n,t){return RegExp(c(n),"m"+(e.case_insensitive?"i":"")+(e.unicodeRegex?"u":"")+(t?"g":""))}class t{constructor(){this.matchIndexes={},this.regexes=[],this.matchAt=1,this.position=0}addRule(e,n){n.position=this.position++,this.matchIndexes[this.matchAt]=n,this.regexes.push([n,e]),this.matchAt+=p(e)+1}compile(){0===this.regexes.length&&(this.exec=()=>null);const e=this.regexes.map((e=>e[1]));this.matcherRe=n(h(e,{joinWith:"|"}),!0),this.lastIndex=0}exec(e){this.matcherRe.lastIndex=this.lastIndex;const n=this.matcherRe.exec(e);if(!n)return null;const t=n.findIndex(((e,n)=>n>0&&void 0!==e)),a=this.matchIndexes[t];return n.splice(0,t),Object.assign(n,a)}}class i{constructor(){this.rules=[],this.multiRegexes=[],this.count=0,this.lastIndex=0,this.regexIndex=0}getMatcher(e){if(this.multiRegexes[e])return this.multiRegexes[e];const n=new t;return this.rules.slice(e).forEach((([e,t])=>n.addRule(e,t))),n.compile(),this.multiRegexes[e]=n,n}resumingScanAtSamePosition(){return 0!==this.regexIndex}considerAll(){this.regexIndex=0}addRule(e,n){this.rules.push([e,n]),"begin"===n.type&&this.count++}exec(e){const n=this.getMatcher(this.regexIndex);n.lastIndex=this.lastIndex;let t=n.exec(e);if(this.resumingScanAtSamePosition())if(t&&t.index===this.lastIndex);else{const n=this.getMatcher(0);n.lastIndex=this.lastIndex+1,t=n.exec(e)}return t&&(this.regexIndex+=t.position+1,this.regexIndex===this.count&&this.considerAll()),t}}if(e.compilerExtensions||(e.compilerExtensions=[]),e.contains&&e.contains.includes("self"))throw Error("ERR: contains `self` is not supported at the top-level of a language.  See documentation.");return e.classNameAliases=a(e.classNameAliases||{}),function t(r,s){const o=r;if(r.isCompiled)return o;[R,L,Z,$].forEach((e=>e(r,s))),e.compilerExtensions.forEach((e=>e(r,s))),r.__beforeBegin=null,[D,I,B].forEach((e=>e(r,s))),r.isCompiled=!0;let l=null;return"object"==typeof r.keywords&&r.keywords.$pattern&&(r.keywords=Object.assign({},r.keywords),l=r.keywords.$pattern,delete r.keywords.$pattern),l=l||/\w+/,r.keywords&&(r.keywords=z(r.keywords,e.case_insensitive)),o.keywordPatternRe=n(l,!0),s&&(r.begin||(r.begin=/\B|\b/),o.beginRe=n(o.begin),r.end||r.endsWithParent||(r.end=/\B|\b/),r.end&&(o.endRe=n(o.end)),o.terminatorEnd=c(o.end)||"",r.endsWithParent&&s.terminatorEnd&&(o.terminatorEnd+=(r.end?"|":"")+s.terminatorEnd)),r.illegal&&(o.illegalRe=n(r.illegal)),r.contains||(r.contains=[]),r.contains=[].concat(...r.contains.map((e=>(e=>(e.variants&&!e.cachedVariants&&(e.cachedVariants=e.variants.map((n=>a(e,{variants:null},n)))),e.cachedVariants?e.cachedVariants:Q(e)?a(e,{starts:e.starts?a(e.starts):null}):Object.isFrozen(e)?a(e):e))("self"===e?r:e)))),r.contains.forEach((e=>{t(e,o)})),r.starts&&t(r.starts,s),o.matcher=(e=>{const n=new i;return e.contains.forEach((e=>n.addRule(e.begin,{rule:e,type:"begin"}))),e.terminatorEnd&&n.addRule(e.terminatorEnd,{type:"end"}),e.illegal&&n.addRule(e.illegal,{type:"illegal"}),n})(o),o}(e)}function Q(e){return!!e&&(e.endsWithParent||Q(e.starts))}class X extends Error{constructor(e,n){super(e),this.name="HTMLInjectionError",this.html=n}}const V=t,J=a,Y=Symbol("nomatch"),ee=t=>{const a=Object.create(null),i=Object.create(null),r=[];let s=!0;const o="Could not find the language '{}', did you forget to load/include a language module?",c={disableAutodetect:!0,name:"Plain text",contains:[]};let p={ignoreUnescapedHTML:!1,throwUnescapedHTML:!1,noHighlightRe:/^(no-?highlight)$/i,languageDetectRe:/\blang(?:uage)?-([\w-]+)\b/i,classPrefix:"hljs-",cssSelector:"pre code",languages:null,__emitter:l};function _(e){return p.noHighlightRe.test(e)}function h(e,n,t){let a="",i="";"object"==typeof n?(a=e,t=n.ignoreIllegals,i=n.language):(q("10.7.0","highlight(lang, code, ...args) has been deprecated."),q("10.7.0","Please use highlight(code, options) instead.\nhttps://github.com/highlightjs/highlight.js/issues/2277"),i=e,a=n),void 0===t&&(t=!0);const r={code:a,language:i};O("before:highlight",r);const s=r.result?r.result:f(r.language,r.code,t);return s.code=r.code,O("after:highlight",s),s}function f(e,t,i,r){const l=Object.create(null);function c(){if(!O.keywords)return void A.addText(S);let e=0;O.keywordPatternRe.lastIndex=0;let n=O.keywordPatternRe.exec(S),t="";for(;n;){t+=S.substring(e,n.index);const i=v.case_insensitive?n[0].toLowerCase():n[0],r=(a=i,O.keywords[a]);if(r){const[e,a]=r;if(A.addText(t),t="",l[i]=(l[i]||0)+1,l[i]<=7&&(C+=a),e.startsWith("_"))t+=n[0];else{const t=v.classNameAliases[e]||e;g(n[0],t)}}else t+=n[0];e=O.keywordPatternRe.lastIndex,n=O.keywordPatternRe.exec(S)}var a;t+=S.substring(e),A.addText(t)}function d(){null!=O.subLanguage?(()=>{if(""===S)return;let e=null;if("string"==typeof O.subLanguage){if(!a[O.subLanguage])return void A.addText(S);e=f(O.subLanguage,S,!0,M[O.subLanguage]),M[O.subLanguage]=e._top}else e=E(S,O.subLanguage.length?O.subLanguage:null);O.relevance>0&&(C+=e.relevance),A.__addSublanguage(e._emitter,e.language)})():c(),S=""}function g(e,n){""!==e&&(A.startScope(n),A.addText(e),A.endScope())}function u(e,n){let t=1;const a=n.length-1;for(;t<=a;){if(!e._emit[t]){t++;continue}const a=v.classNameAliases[e[t]]||e[t],i=n[t];a?g(i,a):(S=i,c(),S=""),t++}}function b(e,n){return e.scope&&"string"==typeof e.scope&&A.openNode(v.classNameAliases[e.scope]||e.scope),e.beginScope&&(e.beginScope._wrap?(g(S,v.classNameAliases[e.beginScope._wrap]||e.beginScope._wrap),S=""):e.beginScope._multi&&(u(e.beginScope,n),S="")),O=Object.create(e,{parent:{value:O}}),O}function m(e,t,a){let i=((e,n)=>{const t=e&&e.exec(n);return t&&0===t.index})(e.endRe,a);if(i){if(e["on:end"]){const a=new n(e);e["on:end"](t,a),a.isMatchIgnored&&(i=!1)}if(i){for(;e.endsParent&&e.parent;)e=e.parent;return e}}if(e.endsWithParent)return m(e.parent,t,a)}function _(e){return 0===O.matcher.regexIndex?(S+=e[0],1):(D=!0,0)}function h(e){const n=e[0],a=t.substring(e.index),i=m(O,e,a);if(!i)return Y;const r=O;O.endScope&&O.endScope._wrap?(d(),g(n,O.endScope._wrap)):O.endScope&&O.endScope._multi?(d(),u(O.endScope,e)):r.skip?S+=n:(r.returnEnd||r.excludeEnd||(S+=n),d(),r.excludeEnd&&(S=n));do{O.scope&&A.closeNode(),O.skip||O.subLanguage||(C+=O.relevance),O=O.parent}while(O!==i.parent);return i.starts&&b(i.starts,e),r.returnEnd?0:n.length}let y={};function w(a,r){const o=r&&r[0];if(S+=a,null==o)return d(),0;if("begin"===y.type&&"end"===r.type&&y.index===r.index&&""===o){if(S+=t.slice(r.index,r.index+1),!s){const n=Error(`0 width match regex (${e})`);throw n.languageName=e,n.badRule=y.rule,n}return 1}if(y=r,"begin"===r.type)return(e=>{const t=e[0],a=e.rule,i=new n(a),r=[a.__beforeBegin,a["on:begin"]];for(const n of r)if(n&&(n(e,i),i.isMatchIgnored))return _(t);return a.skip?S+=t:(a.excludeBegin&&(S+=t),d(),a.returnBegin||a.excludeBegin||(S=t)),b(a,e),a.returnBegin?0:t.length})(r);if("illegal"===r.type&&!i){const e=Error('Illegal lexeme "'+o+'" for mode "'+(O.scope||"<unnamed>")+'"');throw e.mode=O,e}if("end"===r.type){const e=h(r);if(e!==Y)return e}if("illegal"===r.type&&""===o)return S+="\n",1;if(R>1e5&&R>3*r.index)throw Error("potential infinite loop, way more iterations than matches");return S+=o,o.length}const v=N(e);if(!v)throw P(o.replace("{}",e)),Error('Unknown language: "'+e+'"');const k=W(v);let x="",O=r||k;const M={},A=new p.__emitter(p);(()=>{const e=[];for(let n=O;n!==v;n=n.parent)n.scope&&e.unshift(n.scope);e.forEach((e=>A.openNode(e)))})();let S="",C=0,T=0,R=0,D=!1;try{if(v.__emitTokens)v.__emitTokens(t,A);else{for(O.matcher.considerAll();;){R++,D?D=!1:O.matcher.considerAll(),O.matcher.lastIndex=T;const e=O.matcher.exec(t);if(!e)break;const n=w(t.substring(T,e.index),e);T=e.index+n}w(t.substring(T))}return A.finalize(),x=A.toHTML(),{language:e,value:x,relevance:C,illegal:!1,_emitter:A,_top:O}}catch(n){if(n.message&&n.message.includes("Illegal"))return{language:e,value:V(t),illegal:!0,relevance:0,_illegalBy:{message:n.message,index:T,context:t.slice(T-100,T+100),mode:n.mode,resultSoFar:x},_emitter:A};if(s)return{language:e,value:V(t),illegal:!1,relevance:0,errorRaised:n,_emitter:A,_top:O};throw n}}function E(e,n){n=n||p.languages||Object.keys(a);const t=(e=>{const n={value:V(e),illegal:!1,relevance:0,_top:c,_emitter:new p.__emitter(p)};return n._emitter.addText(e),n})(e),i=n.filter(N).filter(x).map((n=>f(n,e,!1)));i.unshift(t);const r=i.sort(((e,n)=>{if(e.relevance!==n.relevance)return n.relevance-e.relevance;if(e.language&&n.language){if(N(e.language).supersetOf===n.language)return 1;if(N(n.language).supersetOf===e.language)return-1}return 0})),[s,o]=r,l=s;return l.secondBest=o,l}function y(e){let n=null;const t=(e=>{let n=e.className+" ";n+=e.parentNode?e.parentNode.className:"";const t=p.languageDetectRe.exec(n);if(t){const n=N(t[1]);return n||(K(o.replace("{}",t[1])),K("Falling back to no-highlight mode for this block.",e)),n?t[1]:"no-highlight"}return n.split(/\s+/).find((e=>_(e)||N(e)))})(e);if(_(t))return;if(O("before:highlightElement",{el:e,language:t}),e.dataset.highlighted)return void console.log("Element previously highlighted. To highlight again, first unset `dataset.highlighted`.",e);if(e.children.length>0&&(p.ignoreUnescapedHTML||(console.warn("One of your code blocks includes unescaped HTML. This is a potentially serious security risk."),console.warn("https://github.com/highlightjs/highlight.js/wiki/security"),console.warn("The element with unescaped HTML:"),console.warn(e)),p.throwUnescapedHTML))throw new X("One of your code blocks includes unescaped HTML.",e.innerHTML);n=e;const a=n.textContent,r=t?h(a,{language:t,ignoreIllegals:!0}):E(a);e.innerHTML=r.value,e.dataset.highlighted="yes",((e,n,t)=>{const a=n&&i[n]||t;e.classList.add("hljs"),e.classList.add("language-"+a)})(e,t,r.language),e.result={language:r.language,re:r.relevance,relevance:r.relevance},r.secondBest&&(e.secondBest={language:r.secondBest.language,relevance:r.secondBest.relevance}),O("after:highlightElement",{el:e,result:r,text:a})}let w=!1;function v(){if("loading"===document.readyState)return w||window.addEventListener("DOMContentLoaded",(()=>{v()}),!1),void(w=!0);document.querySelectorAll(p.cssSelector).forEach(y)}function N(e){return e=(e||"").toLowerCase(),a[e]||a[i[e]]}function k(e,{languageName:n}){"string"==typeof e&&(e=[e]),e.forEach((e=>{i[e.toLowerCase()]=n}))}function x(e){const n=N(e);return n&&!n.disableAutodetect}function O(e,n){const t=e;r.forEach((e=>{e[t]&&e[t](n)}))}Object.assign(t,{highlight:h,highlightAuto:E,highlightAll:v,highlightElement:y,highlightBlock:e=>(q("10.7.0","highlightBlock will be removed entirely in v12.0"),q("10.7.0","Please use highlightElement now."),y(e)),configure:e=>{p=J(p,e)},initHighlighting:()=>{v(),q("10.6.0","initHighlighting() deprecated.  Use highlightAll() now.")},initHighlightingOnLoad:()=>{v(),q("10.6.0","initHighlightingOnLoad() deprecated.  Use highlightAll() now.")},registerLanguage:(e,n)=>{let i=null;try{i=n(t)}catch(n){if(P("Language definition for '{}' could not be registered.".replace("{}",e)),!s)throw n;P(n),i=c}i.name||(i.name=e),a[e]=i,i.rawDefinition=n.bind(null,t),i.aliases&&k(i.aliases,{languageName:e})},unregisterLanguage:e=>{delete a[e];for(const n of Object.keys(i))i[n]===e&&delete i[n]},listLanguages:()=>Object.keys(a),getLanguage:N,registerAliases:k,autoDetection:x,inherit:J,addPlugin:e=>{(e=>{e["before:highlightBlock"]&&!e["before:highlightElement"]&&(e["before:highlightElement"]=n=>{e["before:highlightBlock"](Object.assign({block:n.el},n))}),e["after:highlightBlock"]&&!e["after:highlightElement"]&&(e["after:highlightElement"]=n=>{e["after:highlightBlock"](Object.assign({block:n.el},n))})})(e),r.push(e)},removePlugin:e=>{const n=r.indexOf(e);-1!==n&&r.splice(n,1)}}),t.debugMode=()=>{s=!1},t.safeMode=()=>{s=!0},t.versionString="11.11.1",t.regex={concat:b,lookahead:d,either:m,optional:u,anyNumberOfTimes:g};for(const n in C)"object"==typeof C[n]&&e(C[n]);return Object.assign(t,C),t},ne=ee({});ne.newInstance=()=>ee({});const te=e=>({IMPORTANT:{scope:"meta",begin:"!important"},BLOCK_COMMENT:e.C_BLOCK_COMMENT_MODE,HEXCOLOR:{scope:"number",begin:/#(([0-9a-fA-F]{3,4})|(([0-9a-fA-F]{2}){3,4}))\b/},FUNCTION_DISPATCH:{className:"built_in",begin:/[\w-]+(?=\()/},ATTRIBUTE_SELECTOR_MODE:{scope:"selector-attr",begin:/\[/,end:/\]/,illegal:"$",contains:[e.APOS_STRING_MODE,e.QUOTE_STRING_MODE]},CSS_NUMBER_MODE:{scope:"number",begin:e.NUMBER_RE+"(%|em|ex|ch|rem|vw|vh|vmin|vmax|cm|mm|in|pt|pc|px|deg|grad|rad|turn|s|ms|Hz|kHz|dpi|dpcm|dppx)?",relevance:0},CSS_VARIABLE:{className:"attr",begin:/--[A-Za-z_][A-Za-z0-9_-]*/}}),ae=["a","abbr","address","article","aside","audio","b","blockquote","body","button","canvas","caption","cite","code","dd","del","details","dfn","div","dl","dt","em","fieldset","figcaption","figure","footer","form","h1","h2","h3","h4","h5","h6","header","hgroup","html","i","iframe","img","input","ins","kbd","label","legend","li","main","mark","menu","nav","object","ol","optgroup","option","p","picture","q","quote","samp","section","select","source","span","strong","summary","sup","table","tbody","td","textarea","tfoot","th","thead","time","tr","ul","var","video","defs","g","marker","mask","pattern","svg","switch","symbol","feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feFlood","feGaussianBlur","feImage","feMerge","feMorphology","feOffset","feSpecularLighting","feTile","feTurbulence","linearGradient","radialGradient","stop","circle","ellipse","image","line","path","polygon","polyline","rect","text","use","textPath","tspan","foreignObject","clipPath"],ie=["any-hover","any-pointer","aspect-ratio","color","color-gamut","color-index","device-aspect-ratio","device-height","device-width","display-mode","forced-colors","grid","height","hover","inverted-colors","monochrome","orientation","overflow-block","overflow-inline","pointer","prefers-color-scheme","prefers-contrast","prefers-reduced-motion","prefers-reduced-transparency","resolution","scan","scripting","update","width","min-width","max-width","min-height","max-height"].sort().reverse(),re=["active","any-link","blank","checked","current","default","defined","dir","disabled","drop","empty","enabled","first","first-child","first-of-type","fullscreen","future","focus","focus-visible","focus-within","has","host","host-context","hover","indeterminate","in-range","invalid","is","lang","last-child","last-of-type","left","link","local-link","not","nth-child","nth-col","nth-last-child","nth-last-col","nth-last-of-type","nth-of-type","only-child","only-of-type","optional","out-of-range","past","placeholder-shown","read-only","read-write","required","right","root","scope","target","target-within","user-invalid","valid","visited","where"].sort().reverse(),se=["after","backdrop","before","cue","cue-region","first-letter","first-line","grammar-error","marker","part","placeholder","selection","slotted","spelling-error"].sort().reverse(),oe=["accent-color","align-content","align-items","align-self","alignment-baseline","all","anchor-name","animation","animation-composition","animation-delay","animation-direction","animation-duration","animation-fill-mode","animation-iteration-count","animation-name","animation-play-state","animation-range","animation-range-end","animation-range-start","animation-timeline","animation-timing-function","appearance","aspect-ratio","backdrop-filter","backface-visibility","background","background-attachment","background-blend-mode","background-clip","background-color","background-image","background-origin","background-position","background-position-x","background-position-y","background-repeat","background-size","baseline-shift","block-size","border","border-block","border-block-color","border-block-end","border-block-end-color","border-block-end-style","border-block-end-width","border-block-start","border-block-start-color","border-block-start-style","border-block-start-width","border-block-style","border-block-width","border-bottom","border-bottom-color","border-bottom-left-radius","border-bottom-right-radius","border-bottom-style","border-bottom-width","border-collapse","border-color","border-end-end-radius","border-end-start-radius","border-image","border-image-outset","border-image-repeat","border-image-slice","border-image-source","border-image-width","border-inline","border-inline-color","border-inline-end","border-inline-end-color","border-inline-end-style","border-inline-end-width","border-inline-start","border-inline-start-color","border-inline-start-style","border-inline-start-width","border-inline-style","border-inline-width","border-left","border-left-color","border-left-style","border-left-width","border-radius","border-right","border-right-color","border-right-style","border-right-width","border-spacing","border-start-end-radius","border-start-start-radius","border-style","border-top","border-top-color","border-top-left-radius","border-top-right-radius","border-top-style","border-top-width","border-width","bottom","box-align","box-decoration-break","box-direction","box-flex","box-flex-group","box-lines","box-ordinal-group","box-orient","box-pack","box-shadow","box-sizing","break-after","break-before","break-inside","caption-side","caret-color","clear","clip","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","color-scheme","column-count","column-fill","column-gap","column-rule","column-rule-color","column-rule-style","column-rule-width","column-span","column-width","columns","contain","contain-intrinsic-block-size","contain-intrinsic-height","contain-intrinsic-inline-size","contain-intrinsic-size","contain-intrinsic-width","container","container-name","container-type","content","content-visibility","counter-increment","counter-reset","counter-set","cue","cue-after","cue-before","cursor","cx","cy","direction","display","dominant-baseline","empty-cells","enable-background","field-sizing","fill","fill-opacity","fill-rule","filter","flex","flex-basis","flex-direction","flex-flow","flex-grow","flex-shrink","flex-wrap","float","flood-color","flood-opacity","flow","font","font-display","font-family","font-feature-settings","font-kerning","font-language-override","font-optical-sizing","font-palette","font-size","font-size-adjust","font-smooth","font-smoothing","font-stretch","font-style","font-synthesis","font-synthesis-position","font-synthesis-small-caps","font-synthesis-style","font-synthesis-weight","font-variant","font-variant-alternates","font-variant-caps","font-variant-east-asian","font-variant-emoji","font-variant-ligatures","font-variant-numeric","font-variant-position","font-variation-settings","font-weight","forced-color-adjust","gap","glyph-orientation-horizontal","glyph-orientation-vertical","grid","grid-area","grid-auto-columns","grid-auto-flow","grid-auto-rows","grid-column","grid-column-end","grid-column-start","grid-gap","grid-row","grid-row-end","grid-row-start","grid-template","grid-template-areas","grid-template-columns","grid-template-rows","hanging-punctuation","height","hyphenate-character","hyphenate-limit-chars","hyphens","icon","image-orientation","image-rendering","image-resolution","ime-mode","initial-letter","initial-letter-align","inline-size","inset","inset-area","inset-block","inset-block-end","inset-block-start","inset-inline","inset-inline-end","inset-inline-start","isolation","justify-content","justify-items","justify-self","kerning","left","letter-spacing","lighting-color","line-break","line-height","line-height-step","list-style","list-style-image","list-style-position","list-style-type","margin","margin-block","margin-block-end","margin-block-start","margin-bottom","margin-inline","margin-inline-end","margin-inline-start","margin-left","margin-right","margin-top","margin-trim","marker","marker-end","marker-mid","marker-start","marks","mask","mask-border","mask-border-mode","mask-border-outset","mask-border-repeat","mask-border-slice","mask-border-source","mask-border-width","mask-clip","mask-composite","mask-image","mask-mode","mask-origin","mask-position","mask-repeat","mask-size","mask-type","masonry-auto-flow","math-depth","math-shift","math-style","max-block-size","max-height","max-inline-size","max-width","min-block-size","min-height","min-inline-size","min-width","mix-blend-mode","nav-down","nav-index","nav-left","nav-right","nav-up","none","normal","object-fit","object-position","offset","offset-anchor","offset-distance","offset-path","offset-position","offset-rotate","opacity","order","orphans","outline","outline-color","outline-offset","outline-style","outline-width","overflow","overflow-anchor","overflow-block","overflow-clip-margin","overflow-inline","overflow-wrap","overflow-x","overflow-y","overlay","overscroll-behavior","overscroll-behavior-block","overscroll-behavior-inline","overscroll-behavior-x","overscroll-behavior-y","padding","padding-block","padding-block-end","padding-block-start","padding-bottom","padding-inline","padding-inline-end","padding-inline-start","padding-left","padding-right","padding-top","page","page-break-after","page-break-before","page-break-inside","paint-order","pause","pause-after","pause-before","perspective","perspective-origin","place-content","place-items","place-self","pointer-events","position","position-anchor","position-visibility","print-color-adjust","quotes","r","resize","rest","rest-after","rest-before","right","rotate","row-gap","ruby-align","ruby-position","scale","scroll-behavior","scroll-margin","scroll-margin-block","scroll-margin-block-end","scroll-margin-block-start","scroll-margin-bottom","scroll-margin-inline","scroll-margin-inline-end","scroll-margin-inline-start","scroll-margin-left","scroll-margin-right","scroll-margin-top","scroll-padding","scroll-padding-block","scroll-padding-block-end","scroll-padding-block-start","scroll-padding-bottom","scroll-padding-inline","scroll-padding-inline-end","scroll-padding-inline-start","scroll-padding-left","scroll-padding-right","scroll-padding-top","scroll-snap-align","scroll-snap-stop","scroll-snap-type","scroll-timeline","scroll-timeline-axis","scroll-timeline-name","scrollbar-color","scrollbar-gutter","scrollbar-width","shape-image-threshold","shape-margin","shape-outside","shape-rendering","speak","speak-as","src","stop-color","stop-opacity","stroke","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke-width","tab-size","table-layout","text-align","text-align-all","text-align-last","text-anchor","text-combine-upright","text-decoration","text-decoration-color","text-decoration-line","text-decoration-skip","text-decoration-skip-ink","text-decoration-style","text-decoration-thickness","text-emphasis","text-emphasis-color","text-emphasis-position","text-emphasis-style","text-indent","text-justify","text-orientation","text-overflow","text-rendering","text-shadow","text-size-adjust","text-transform","text-underline-offset","text-underline-position","text-wrap","text-wrap-mode","text-wrap-style","timeline-scope","top","touch-action","transform","transform-box","transform-origin","transform-style","transition","transition-behavior","transition-delay","transition-duration","transition-property","transition-timing-function","translate","unicode-bidi","user-modify","user-select","vector-effect","vertical-align","view-timeline","view-timeline-axis","view-timeline-inset","view-timeline-name","view-transition-name","visibility","voice-balance","voice-duration","voice-family","voice-pitch","voice-range","voice-rate","voice-stress","voice-volume","white-space","white-space-collapse","widows","width","will-change","word-break","word-spacing","word-wrap","writing-mode","x","y","z-index","zoom"].sort().reverse(),le=re.concat(se).sort().reverse();var ce="[0-9](_*[0-9])*",de=`\\.(${ce})`,ge="[0-9a-fA-F](_*[0-9a-fA-F])*",ue={className:"number",variants:[{begin:`(\\b(${ce})((${de})|\\.)?|(${de}))[eE][+-]?(${ce})[fFdD]?\\b`},{begin:`\\b(${ce})((${de})[fFdD]?\\b|\\.([fFdD]\\b)?)`},{begin:`(${de})[fFdD]?\\b`},{begin:`\\b(${ce})[fFdD]\\b`},{begin:`\\b0[xX]((${ge})\\.?|(${ge})?\\.(${ge}))[pP][+-]?(${ce})[fFdD]?\\b`},{begin:"\\b(0|[1-9](_*[0-9])*)[lL]?\\b"},{begin:`\\b0[xX](${ge})[lL]?\\b`},{begin:"\\b0(_*[0-7])*[lL]?\\b"},{begin:"\\b0[bB][01](_*[01])*[lL]?\\b"}],relevance:0};function be(e,n,t){return-1===t?"":e.replace(n,(a=>be(e,n,t-1)))}const me="[A-Za-z$_][0-9A-Za-z$_]*",pe=["as","in","of","if","for","while","finally","var","new","function","do","return","void","else","break","catch","instanceof","with","throw","case","default","try","switch","continue","typeof","delete","let","yield","const","class","debugger","async","await","static","import","from","export","extends","using"],_e=["true","false","null","undefined","NaN","Infinity"],he=["Object","Function","Boolean","Symbol","Math","Date","Number","BigInt","String","RegExp","Array","Float32Array","Float64Array","Int8Array","Uint8Array","Uint8ClampedArray","Int16Array","Int32Array","Uint16Array","Uint32Array","BigInt64Array","BigUint64Array","Set","Map","WeakSet","WeakMap","ArrayBuffer","SharedArrayBuffer","Atomics","DataView","JSON","Promise","Generator","GeneratorFunction","AsyncFunction","Reflect","Proxy","Intl","WebAssembly"],fe=["Error","EvalError","InternalError","RangeError","ReferenceError","SyntaxError","TypeError","URIError"],Ee=["setInterval","setTimeout","clearInterval","clearTimeout","require","exports","eval","isFinite","isNaN","parseFloat","parseInt","decodeURI","decodeURIComponent","encodeURI","encodeURIComponent","escape","unescape"],ye=["arguments","this","super","console","window","document","localStorage","sessionStorage","module","global"],we=[].concat(Ee,he,fe);function ve(e){const n=e.regex,t=me,a={begin:/<[A-Za-z0-9\\._:-]+/,end:/\/[A-Za-z0-9\\._:-]+>|\/>/,isTrulyOpeningTag:(e,n)=>{const t=e[0].length+e.index,a=e.input[t];if("<"===a||","===a)return void n.ignoreMatch();let i;">"===a&&(((e,{after:n})=>{const t="</"+e[0].slice(1);return-1!==e.input.indexOf(t,n)})(e,{after:t})||n.ignoreMatch());const r=e.input.substring(t);((i=r.match(/^\s*=/))||(i=r.match(/^\s+extends\s+/))&&0===i.index)&&n.ignoreMatch()}},i={$pattern:me,keyword:pe,literal:_e,built_in:we,"variable.language":ye},r="[0-9](_?[0-9])*",s=`\\.(${r})`,o="0|[1-9](_?[0-9])*|0[0-7]*[89][0-9]*",l={className:"number",variants:[{begin:`(\\b(${o})((${s})|\\.)?|(${s}))[eE][+-]?(${r})\\b`},{begin:`\\b(${o})\\b((${s})\\b|\\.)?|(${s})\\b`},{begin:"\\b(0|[1-9](_?[0-9])*)n\\b"},{begin:"\\b0[xX][0-9a-fA-F](_?[0-9a-fA-F])*n?\\b"},{begin:"\\b0[bB][0-1](_?[0-1])*n?\\b"},{begin:"\\b0[oO][0-7](_?[0-7])*n?\\b"},{begin:"\\b0[0-7]+n?\\b"}],relevance:0},c={className:"subst",begin:"\\$\\{",end:"\\}",keywords:i,contains:[]},d={begin:".?html`",end:"",starts:{end:"`",returnEnd:!1,contains:[e.BACKSLASH_ESCAPE,c],subLanguage:"xml"}},g={begin:".?css`",end:"",starts:{end:"`",returnEnd:!1,contains:[e.BACKSLASH_ESCAPE,c],subLanguage:"css"}},u={begin:".?gql`",end:"",starts:{end:"`",returnEnd:!1,contains:[e.BACKSLASH_ESCAPE,c],subLanguage:"graphql"}},b={className:"string",begin:"`",end:"`",contains:[e.BACKSLASH_ESCAPE,c]},m={className:"comment",variants:[e.COMMENT(/\/\*\*(?!\/)/,"\\*/",{relevance:0,contains:[{begin:"(?=@[A-Za-z]+)",relevance:0,contains:[{className:"doctag",begin:"@[A-Za-z]+"},{className:"type",begin:"\\{",end:"\\}",excludeEnd:!0,excludeBegin:!0,relevance:0},{className:"variable",begin:t+"(?=\\s*(-)|$)",endsParent:!0,relevance:0},{begin:/(?=[^\n])\s/,relevance:0}]}]}),e.C_BLOCK_COMMENT_MODE,e.C_LINE_COMMENT_MODE]},p=[e.APOS_STRING_MODE,e.QUOTE_STRING_MODE,d,g,u,b,{match:/\$\d+/},l];c.contains=p.concat({begin:/\{/,end:/\}/,keywords:i,contains:["self"].concat(p)});const _=[].concat(m,c.contains),h=_.concat([{begin:/(\s*)\(/,end:/\)/,keywords:i,contains:["self"].concat(_)}]),f={className:"params",begin:/(\s*)\(/,end:/\)/,excludeBegin:!0,excludeEnd:!0,keywords:i,contains:h},E={variants:[{match:[/class/,/\s+/,t,/\s+/,/extends/,/\s+/,n.concat(t,"(",n.concat(/\./,t),")*")],scope:{1:"keyword",3:"title.class",5:"keyword",7:"title.class.inherited"}},{match:[/class/,/\s+/,t],scope:{1:"keyword",3:"title.class"}}]},y={relevance:0,match:n.either(/\bJSON/,/\b[A-Z][a-z]+([A-Z][a-z]*|\d)*/,/\b[A-Z]{2,}([A-Z][a-z]+|\d)+([A-Z][a-z]*)*/,/\b[A-Z]{2,}[a-z]+([A-Z][a-z]+|\d)*([A-Z][a-z]*)*/),className:"title.class",keywords:{_:[...he,...fe]}},w={variants:[{match:[/function/,/\s+/,t,/(?=\s*\()/]},{match:[/function/,/\s*(?=\()/]}],className:{1:"keyword",3:"title.function"},label:"func.def",contains:[f],illegal:/%/},v={match:n.concat(/\b/,(N=[...Ee,"super","import"].map((e=>e+"\\s*\\(")),n.concat("(?!",N.join("|"),")")),t,n.lookahead(/\s*\(/)),className:"title.function",relevance:0};var N;const k={begin:n.concat(/\./,n.lookahead(n.concat(t,/(?![0-9A-Za-z$_(])/))),end:t,excludeBegin:!0,keywords:"prototype",className:"property",relevance:0},x={match:[/get|set/,/\s+/,t,/(?=\()/],className:{1:"keyword",3:"title.function"},contains:[{begin:/\(\)/},f]},O="(\\([^()]*(\\([^()]*(\\([^()]*\\)[^()]*)*\\)[^()]*)*\\)|"+e.UNDERSCORE_IDENT_RE+")\\s*=>",M={match:[/const|var|let/,/\s+/,t,/\s*/,/=\s*/,/(async\s*)?/,n.lookahead(O)],keywords:"async",className:{1:"keyword",3:"title.function"},contains:[f]};return{name:"JavaScript",aliases:["js","jsx","mjs","cjs"],keywords:i,exports:{PARAMS_CONTAINS:h,CLASS_REFERENCE:y},illegal:/#(?![$_A-z])/,contains:[e.SHEBANG({label:"shebang",binary:"node",relevance:5}),{label:"use_strict",className:"meta",relevance:10,begin:/^\s*['"]use (strict|asm)['"]/},e.APOS_STRING_MODE,e.QUOTE_STRING_MODE,d,g,u,b,m,{match:/\$\d+/},l,y,{scope:"attr",match:t+n.lookahead(":"),relevance:0},M,{begin:"("+e.RE_STARTERS_RE+"|\\b(case|return|throw)\\b)\\s*",keywords:"return throw case",relevance:0,contains:[m,e.REGEXP_MODE,{className:"function",begin:O,returnBegin:!0,end:"\\s*=>",contains:[{className:"params",variants:[{begin:e.UNDERSCORE_IDENT_RE,relevance:0},{className:null,begin:/\(\s*\)/,skip:!0},{begin:/(\s*)\(/,end:/\)/,excludeBegin:!0,excludeEnd:!0,keywords:i,contains:h}]}]},{begin:/,/,relevance:0},{match:/\s+/,relevance:0},{variants:[{begin:"<>",end:"</>"},{match:/<[A-Za-z0-9\\._:-]+\s*\/>/},{begin:a.begin,"on:begin":a.isTrulyOpeningTag,end:a.end}],subLanguage:"xml",contains:[{begin:a.begin,end:a.end,skip:!0,contains:["self"]}]}]},w,{beginKeywords:"while if switch catch for"},{begin:"\\b(?!function)"+e.UNDERSCORE_IDENT_RE+"\\([^()]*(\\([^()]*(\\([^()]*\\)[^()]*)*\\)[^()]*)*\\)\\s*\\{",returnBegin:!0,label:"func.def",contains:[f,e.inherit(e.TITLE_MODE,{begin:t,className:"title.function"})]},{match:/\.\.\./,relevance:0},k,{match:"\\$"+t,relevance:0},{match:[/\bconstructor(?=\s*\()/],className:{1:"title.function"},contains:[f]},v,{relevance:0,match:/\b[A-Z][A-Z_0-9]+\b/,className:"variable.constant"},E,x,{match:/\$[(.]/}]}}const Ne=e=>b(/\b/,e,/\w$/.test(e)?/\b/:/\B/),ke=["Protocol","Type"].map(Ne),xe=["init","self"].map(Ne),Oe=["Any","Self"],Me=["actor","any","associatedtype","async","await",/as\?/,/as!/,"as","borrowing","break","case","catch","class","consume","consuming","continue","convenience","copy","default","defer","deinit","didSet","distributed","do","dynamic","each","else","enum","extension","fallthrough",/fileprivate\(set\)/,"fileprivate","final","for","func","get","guard","if","import","indirect","infix",/init\?/,/init!/,"inout",/internal\(set\)/,"internal","in","is","isolated","nonisolated","lazy","let","macro","mutating","nonmutating",/open\(set\)/,"open","operator","optional","override","package","postfix","precedencegroup","prefix",/private\(set\)/,"private","protocol",/public\(set\)/,"public","repeat","required","rethrows","return","set","some","static","struct","subscript","super","switch","throws","throw",/try\?/,/try!/,"try","typealias",/unowned\(safe\)/,/unowned\(unsafe\)/,"unowned","var","weak","where","while","willSet"],Ae=["false","nil","true"],Se=["assignment","associativity","higherThan","left","lowerThan","none","right"],Ce=["#colorLiteral","#column","#dsohandle","#else","#elseif","#endif","#error","#file","#fileID","#fileLiteral","#filePath","#function","#if","#imageLiteral","#keyPath","#line","#selector","#sourceLocation","#warning"],Te=["abs","all","any","assert","assertionFailure","debugPrint","dump","fatalError","getVaList","isKnownUniquelyReferenced","max","min","numericCast","pointwiseMax","pointwiseMin","precondition","preconditionFailure","print","readLine","repeatElement","sequence","stride","swap","swift_unboxFromSwiftValueWithType","transcode","type","unsafeBitCast","unsafeDowncast","withExtendedLifetime","withUnsafeMutablePointer","withUnsafePointer","withVaList","withoutActuallyEscaping","zip"],Re=m(/[/=\-+!*%<>&|^~?]/,/[\u00A1-\u00A7]/,/[\u00A9\u00AB]/,/[\u00AC\u00AE]/,/[\u00B0\u00B1]/,/[\u00B6\u00BB\u00BF\u00D7\u00F7]/,/[\u2016-\u2017]/,/[\u2020-\u2027]/,/[\u2030-\u203E]/,/[\u2041-\u2053]/,/[\u2055-\u205E]/,/[\u2190-\u23FF]/,/[\u2500-\u2775]/,/[\u2794-\u2BFF]/,/[\u2E00-\u2E7F]/,/[\u3001-\u3003]/,/[\u3008-\u3020]/,/[\u3030]/),De=m(Re,/[\u0300-\u036F]/,/[\u1DC0-\u1DFF]/,/[\u20D0-\u20FF]/,/[\uFE00-\uFE0F]/,/[\uFE20-\uFE2F]/),Ie=b(Re,De,"*"),Le=m(/[a-zA-Z_]/,/[\u00A8\u00AA\u00AD\u00AF\u00B2-\u00B5\u00B7-\u00BA]/,/[\u00BC-\u00BE\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]/,/[\u0100-\u02FF\u0370-\u167F\u1681-\u180D\u180F-\u1DBF]/,/[\u1E00-\u1FFF]/,/[\u200B-\u200D\u202A-\u202E\u203F-\u2040\u2054\u2060-\u206F]/,/[\u2070-\u20CF\u2100-\u218F\u2460-\u24FF\u2776-\u2793]/,/[\u2C00-\u2DFF\u2E80-\u2FFF]/,/[\u3004-\u3007\u3021-\u302F\u3031-\u303F\u3040-\uD7FF]/,/[\uF900-\uFD3D\uFD40-\uFDCF\uFDF0-\uFE1F\uFE30-\uFE44]/,/[\uFE47-\uFEFE\uFF00-\uFFFD]/),Be=m(Le,/\d/,/[\u0300-\u036F\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]/),$e=b(Le,Be,"*"),Fe=b(/[A-Z]/,Be,"*"),ze=["attached","autoclosure",b(/convention\(/,m("swift","block","c"),/\)/),"discardableResult","dynamicCallable","dynamicMemberLookup","escaping","freestanding","frozen","GKInspectable","IBAction","IBDesignable","IBInspectable","IBOutlet","IBSegueAction","inlinable","main","nonobjc","NSApplicationMain","NSCopying","NSManaged",b(/objc\(/,$e,/\)/),"objc","objcMembers","propertyWrapper","requires_stored_property_inits","resultBuilder","Sendable","testable","UIApplicationMain","unchecked","unknown","usableFromInline","warn_unqualified_access"],je=["iOS","iOSApplicationExtension","macOS","macOSApplicationExtension","macCatalyst","macCatalystApplicationExtension","watchOS","watchOSApplicationExtension","tvOS","tvOSApplicationExtension","swift"];var Ue=Object.freeze({__proto__:null,grmr_bash:e=>{const n=e.regex,t={},a={begin:/\$\{/,end:/\}/,contains:["self",{begin:/:-/,contains:[t]}]};Object.assign(t,{className:"variable",variants:[{begin:n.concat(/\$[\w\d#@][\w\d_]*/,"(?![\\w\\d])(?![$])")},a]});const i={className:"subst",begin:/\$\(/,end:/\)/,contains:[e.BACKSLASH_ESCAPE]},r=e.inherit(e.COMMENT(),{match:[/(^|\s)/,/#.*$/],scope:{2:"comment"}}),s={begin:/<<-?\s*(?=\w+)/,starts:{contains:[e.END_SAME_AS_BEGIN({begin:/(\w+)/,end:/(\w+)/,className:"string"})]}},o={className:"string",begin:/"/,end:/"/,contains:[e.BACKSLASH_ESCAPE,t,i]};i.contains.push(o);const l={begin:/\$?\(\(/,end:/\)\)/,contains:[{begin:/\d+#[0-9a-f]+/,className:"number"},e.NUMBER_MODE,t]},c=e.SHEBANG({binary:"(fish|bash|zsh|sh|csh|ksh|tcsh|dash|scsh)",relevance:10}),d={className:"function",begin:/\w[\w\d_]*\s*\(\s*\)\s*\{/,returnBegin:!0,contains:[e.inherit(e.TITLE_MODE,{begin:/\w[\w\d_]*/})],relevance:0};return{name:"Bash",aliases:["sh","zsh"],keywords:{$pattern:/\b[a-z][a-z0-9._-]+\b/,keyword:["if","then","else","elif","fi","time","for","while","until","in","do","done","case","esac","coproc","function","select"],literal:["true","false"],built_in:["break","cd","continue","eval","exec","exit","export","getopts","hash","pwd","readonly","return","shift","test","times","trap","umask","unset","alias","bind","builtin","caller","command","declare","echo","enable","help","let","local","logout","mapfile","printf","read","readarray","source","sudo","type","typeset","ulimit","unalias","set","shopt","autoload","bg","bindkey","bye","cap","chdir","clone","comparguments","compcall","compctl","compdescribe","compfiles","compgroups","compquote","comptags","comptry","compvalues","dirs","disable","disown","echotc","echoti","emulate","fc","fg","float","functions","getcap","getln","history","integer","jobs","kill","limit","log","noglob","popd","print","pushd","pushln","rehash","sched","setcap","setopt","stat","suspend","ttyctl","unfunction","unhash","unlimit","unsetopt","vared","wait","whence","where","which","zcompile","zformat","zftp","zle","zmodload","zparseopts","zprof","zpty","zregexparse","zsocket","zstyle","ztcp","chcon","chgrp","chown","chmod","cp","dd","df","dir","dircolors","ln","ls","mkdir","mkfifo","mknod","mktemp","mv","realpath","rm","rmdir","shred","sync","touch","truncate","vdir","b2sum","base32","base64","cat","cksum","comm","csplit","cut","expand","fmt","fold","head","join","md5sum","nl","numfmt","od","paste","ptx","pr","sha1sum","sha224sum","sha256sum","sha384sum","sha512sum","shuf","sort","split","sum","tac","tail","tr","tsort","unexpand","uniq","wc","arch","basename","chroot","date","dirname","du","echo","env","expr","factor","groups","hostid","id","link","logname","nice","nohup","nproc","pathchk","pinky","printenv","printf","pwd","readlink","runcon","seq","sleep","stat","stdbuf","stty","tee","test","timeout","tty","uname","unlink","uptime","users","who","whoami","yes"]},contains:[c,e.SHEBANG(),d,l,r,s,{match:/(\/[a-z._-]+)+/},o,{match:/\\"/},{className:"string",begin:/'/,end:/'/},{match:/\\'/},t]}},grmr_c:e=>{const n=e.regex,t=e.COMMENT("//","$",{contains:[{begin:/\\\n/}]}),a="decltype\\(auto\\)",i="[a-zA-Z_]\\w*::",r="("+a+"|"+n.optional(i)+"[a-zA-Z_]\\w*"+n.optional("<[^<>]+>")+")",s={className:"type",variants:[{begin:"\\b[a-z\\d_]*_t\\b"},{match:/\batomic_[a-z]{3,6}\b/}]},o={className:"string",variants:[{begin:'(u8?|U|L)?"',end:'"',illegal:"\\n",contains:[e.BACKSLASH_ESCAPE]},{begin:"(u8?|U|L)?'(\\\\(x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4,8}|[0-7]{3}|\\S)|.)",end:"'",illegal:"."},e.END_SAME_AS_BEGIN({begin:/(?:u8?|U|L)?R"([^()\\ ]{0,16})\(/,end:/\)([^()\\ ]{0,16})"/})]},l={className:"number",variants:[{match:/\b(0b[01']+)/},{match:/(-?)\b([\d']+(\.[\d']*)?|\.[\d']+)((ll|LL|l|L)(u|U)?|(u|U)(ll|LL|l|L)?|f|F|b|B)/},{match:/(-?)\b(0[xX][a-fA-F0-9]+(?:'[a-fA-F0-9]+)*(?:\.[a-fA-F0-9]*(?:'[a-fA-F0-9]*)*)?(?:[pP][-+]?[0-9]+)?(l|L)?(u|U)?)/},{match:/(-?)\b\d+(?:'\d+)*(?:\.\d*(?:'\d*)*)?(?:[eE][-+]?\d+)?/}],relevance:0},c={className:"meta",begin:/#\s*[a-z]+\b/,end:/$/,keywords:{keyword:"if else elif endif define undef warning error line pragma _Pragma ifdef ifndef elifdef elifndef include"},contains:[{begin:/\\\n/,relevance:0},e.inherit(o,{className:"string"}),{className:"string",begin:/<.*?>/},t,e.C_BLOCK_COMMENT_MODE]},d={className:"title",begin:n.optional(i)+e.IDENT_RE,relevance:0},g=n.optional(i)+e.IDENT_RE+"\\s*\\(",u={keyword:["asm","auto","break","case","continue","default","do","else","enum","extern","for","fortran","goto","if","inline","register","restrict","return","sizeof","typeof","typeof_unqual","struct","switch","typedef","union","volatile","while","_Alignas","_Alignof","_Atomic","_Generic","_Noreturn","_Static_assert","_Thread_local","alignas","alignof","noreturn","static_assert","thread_local","_Pragma"],type:["float","double","signed","unsigned","int","short","long","char","void","_Bool","_BitInt","_Complex","_Imaginary","_Decimal32","_Decimal64","_Decimal96","_Decimal128","_Decimal64x","_Decimal128x","_Float16","_Float32","_Float64","_Float128","_Float32x","_Float64x","_Float128x","const","static","constexpr","complex","bool","imaginary"],literal:"true false NULL",built_in:"std string wstring cin cout cerr clog stdin stdout stderr stringstream istringstream ostringstream auto_ptr deque list queue stack vector map set pair bitset multiset multimap unordered_set unordered_map unordered_multiset unordered_multimap priority_queue make_pair array shared_ptr abort terminate abs acos asin atan2 atan calloc ceil cosh cos exit exp fabs floor fmod fprintf fputs free frexp fscanf future isalnum isalpha iscntrl isdigit isgraph islower isprint ispunct isspace isupper isxdigit tolower toupper labs ldexp log10 log malloc realloc memchr memcmp memcpy memset modf pow printf putchar puts scanf sinh sin snprintf sprintf sqrt sscanf strcat strchr strcmp strcpy strcspn strlen strncat strncmp strncpy strpbrk strrchr strspn strstr tanh tan vfprintf vprintf vsprintf endl initializer_list unique_ptr"},b=[c,s,t,e.C_BLOCK_COMMENT_MODE,l,o],m={variants:[{begin:/=/,end:/;/},{begin:/\(/,end:/\)/},{beginKeywords:"new throw return else",end:/;/}],keywords:u,contains:b.concat([{begin:/\(/,end:/\)/,keywords:u,contains:b.concat(["self"]),relevance:0}]),relevance:0},p={begin:"("+r+"[\\*&\\s]+)+"+g,returnBegin:!0,end:/[{;=]/,excludeEnd:!0,keywords:u,illegal:/[^\w\s\*&:<>.]/,contains:[{begin:a,keywords:u,relevance:0},{begin:g,returnBegin:!0,contains:[e.inherit(d,{className:"title.function"})],relevance:0},{relevance:0,match:/,/},{className:"params",begin:/\(/,end:/\)/,keywords:u,relevance:0,contains:[t,e.C_BLOCK_COMMENT_MODE,o,l,s,{begin:/\(/,end:/\)/,keywords:u,relevance:0,contains:["self",t,e.C_BLOCK_COMMENT_MODE,o,l,s]}]},s,t,e.C_BLOCK_COMMENT_MODE,c]};return{name:"C",aliases:["h"],keywords:u,disableAutodetect:!0,illegal:"</",contains:[].concat(m,p,b,[c,{begin:e.IDENT_RE+"::",keywords:u},{className:"class",beginKeywords:"enum class struct union",end:/[{;:<>=]/,contains:[{beginKeywords:"final class struct"},e.TITLE_MODE]}]),exports:{preprocessor:c,strings:o,keywords:u}}},grmr_cpp:e=>{const n=e.regex,t=e.COMMENT("//","$",{contains:[{begin:/\\\n/}]}),a="decltype\\(auto\\)",i="[a-zA-Z_]\\w*::",r="(?!struct)("+a+"|"+n.optional(i)+"[a-zA-Z_]\\w*"+n.optional("<[^<>]+>")+")",s={className:"type",begin:"\\b[a-z\\d_]*_t\\b"},o={className:"string",variants:[{begin:'(u8?|U|L)?"',end:'"',illegal:"\\n",contains:[e.BACKSLASH_ESCAPE]},{begin:"(u8?|U|L)?'(\\\\(x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4,8}|[0-7]{3}|\\S)|.)",end:"'",illegal:"."},e.END_SAME_AS_BEGIN({begin:/(?:u8?|U|L)?R"([^()\\ ]{0,16})\(/,end:/\)([^()\\ ]{0,16})"/})]},l={className:"number",variants:[{begin:"[+-]?(?:(?:[0-9](?:'?[0-9])*\\.(?:[0-9](?:'?[0-9])*)?|\\.[0-9](?:'?[0-9])*)(?:[Ee][+-]?[0-9](?:'?[0-9])*)?|[0-9](?:'?[0-9])*[Ee][+-]?[0-9](?:'?[0-9])*|0[Xx](?:[0-9A-Fa-f](?:'?[0-9A-Fa-f])*(?:\\.(?:[0-9A-Fa-f](?:'?[0-9A-Fa-f])*)?)?|\\.[0-9A-Fa-f](?:'?[0-9A-Fa-f])*)[Pp][+-]?[0-9](?:'?[0-9])*)(?:[Ff](?:16|32|64|128)?|(BF|bf)16|[Ll]|)"},{begin:"[+-]?\\b(?:0[Bb][01](?:'?[01])*|0[Xx][0-9A-Fa-f](?:'?[0-9A-Fa-f])*|0(?:'?[0-7])*|[1-9](?:'?[0-9])*)(?:[Uu](?:LL?|ll?)|[Uu][Zz]?|(?:LL?|ll?)[Uu]?|[Zz][Uu]|)"}],relevance:0},c={className:"meta",begin:/#\s*[a-z]+\b/,end:/$/,keywords:{keyword:"if else elif endif define undef warning error line pragma _Pragma ifdef ifndef include"},contains:[{begin:/\\\n/,relevance:0},e.inherit(o,{className:"string"}),{className:"string",begin:/<.*?>/},t,e.C_BLOCK_COMMENT_MODE]},d={className:"title",begin:n.optional(i)+e.IDENT_RE,relevance:0},g=n.optional(i)+e.IDENT_RE+"\\s*\\(",u={type:["bool","char","char16_t","char32_t","char8_t","double","float","int","long","short","void","wchar_t","unsigned","signed","const","static"],keyword:["alignas","alignof","and","and_eq","asm","atomic_cancel","atomic_commit","atomic_noexcept","auto","bitand","bitor","break","case","catch","class","co_await","co_return","co_yield","compl","concept","const_cast|10","consteval","constexpr","constinit","continue","decltype","default","delete","do","dynamic_cast|10","else","enum","explicit","export","extern","false","final","for","friend","goto","if","import","inline","module","mutable","namespace","new","noexcept","not","not_eq","nullptr","operator","or","or_eq","override","private","protected","public","reflexpr","register","reinterpret_cast|10","requires","return","sizeof","static_assert","static_cast|10","struct","switch","synchronized","template","this","thread_local","throw","transaction_safe","transaction_safe_dynamic","true","try","typedef","typeid","typename","union","using","virtual","volatile","while","xor","xor_eq"],literal:["NULL","false","nullopt","nullptr","true"],built_in:["_Pragma"],_type_hints:["any","auto_ptr","barrier","binary_semaphore","bitset","complex","condition_variable","condition_variable_any","counting_semaphore","deque","false_type","flat_map","flat_set","future","imaginary","initializer_list","istringstream","jthread","latch","lock_guard","multimap","multiset","mutex","optional","ostringstream","packaged_task","pair","promise","priority_queue","queue","recursive_mutex","recursive_timed_mutex","scoped_lock","set","shared_future","shared_lock","shared_mutex","shared_timed_mutex","shared_ptr","stack","string_view","stringstream","timed_mutex","thread","true_type","tuple","unique_lock","unique_ptr","unordered_map","unordered_multimap","unordered_multiset","unordered_set","variant","vector","weak_ptr","wstring","wstring_view"]},b={className:"function.dispatch",relevance:0,keywords:{_hint:["abort","abs","acos","apply","as_const","asin","atan","atan2","calloc","ceil","cerr","cin","clog","cos","cosh","cout","declval","endl","exchange","exit","exp","fabs","floor","fmod","forward","fprintf","fputs","free","frexp","fscanf","future","invoke","isalnum","isalpha","iscntrl","isdigit","isgraph","islower","isprint","ispunct","isspace","isupper","isxdigit","labs","launder","ldexp","log","log10","make_pair","make_shared","make_shared_for_overwrite","make_tuple","make_unique","malloc","memchr","memcmp","memcpy","memset","modf","move","pow","printf","putchar","puts","realloc","scanf","sin","sinh","snprintf","sprintf","sqrt","sscanf","std","stderr","stdin","stdout","strcat","strchr","strcmp","strcpy","strcspn","strlen","strncat","strncmp","strncpy","strpbrk","strrchr","strspn","strstr","swap","tan","tanh","terminate","to_underlying","tolower","toupper","vfprintf","visit","vprintf","vsprintf"]},begin:n.concat(/\b/,/(?!decltype)/,/(?!if)/,/(?!for)/,/(?!switch)/,/(?!while)/,e.IDENT_RE,n.lookahead(/(<[^<>]+>|)\s*\(/))},m=[b,c,s,t,e.C_BLOCK_COMMENT_MODE,l,o],p={variants:[{begin:/=/,end:/;/},{begin:/\(/,end:/\)/},{beginKeywords:"new throw return else",end:/;/}],keywords:u,contains:m.concat([{begin:/\(/,end:/\)/,keywords:u,contains:m.concat(["self"]),relevance:0}]),relevance:0},_={className:"function",begin:"("+r+"[\\*&\\s]+)+"+g,returnBegin:!0,end:/[{;=]/,excludeEnd:!0,keywords:u,illegal:/[^\w\s\*&:<>.]/,contains:[{begin:a,keywords:u,relevance:0},{begin:g,returnBegin:!0,contains:[d],relevance:0},{begin:/::/,relevance:0},{begin:/:/,endsWithParent:!0,contains:[o,l]},{relevance:0,match:/,/},{className:"params",begin:/\(/,end:/\)/,keywords:u,relevance:0,contains:[t,e.C_BLOCK_COMMENT_MODE,o,l,s,{begin:/\(/,end:/\)/,keywords:u,relevance:0,contains:["self",t,e.C_BLOCK_COMMENT_MODE,o,l,s]}]},s,t,e.C_BLOCK_COMMENT_MODE,c]};return{name:"C++",aliases:["cc","c++","h++","hpp","hh","hxx","cxx"],keywords:u,illegal:"</",classNameAliases:{"function.dispatch":"built_in"},contains:[].concat(p,_,b,m,[c,{begin:"\\b(deque|list|queue|priority_queue|pair|stack|vector|map|set|bitset|multiset|multimap|unordered_map|unordered_set|unordered_multiset|unordered_multimap|array|tuple|optional|variant|function|flat_map|flat_set)\\s*<(?!<)",end:">",keywords:u,contains:["self",s]},{begin:e.IDENT_RE+"::",keywords:u},{match:[/\b(?:enum(?:\s+(?:class|struct))?|class|struct|union)/,/\s+/,/\w+/],className:{1:"keyword",3:"title.class"}}])}},grmr_csharp:e=>{const n={keyword:["abstract","as","base","break","case","catch","class","const","continue","do","else","event","explicit","extern","finally","fixed","for","foreach","goto","if","implicit","in","interface","internal","is","lock","namespace","new","operator","out","override","params","private","protected","public","readonly","record","ref","return","scoped","sealed","sizeof","stackalloc","static","struct","switch","this","throw","try","typeof","unchecked","unsafe","using","virtual","void","volatile","while"].concat(["add","alias","and","ascending","args","async","await","by","descending","dynamic","equals","file","from","get","global","group","init","into","join","let","nameof","not","notnull","on","or","orderby","partial","record","remove","required","scoped","select","set","unmanaged","value|0","var","when","where","with","yield"]),built_in:["bool","byte","char","decimal","delegate","double","dynamic","enum","float","int","long","nint","nuint","object","sbyte","short","string","ulong","uint","ushort"],literal:["default","false","null","true"]},t=e.inherit(e.TITLE_MODE,{begin:"[a-zA-Z](\\.?\\w)*"}),a={className:"number",variants:[{begin:"\\b(0b[01']+)"},{begin:"(-?)\\b([\\d']+(\\.[\\d']*)?|\\.[\\d']+)(u|U|l|L|ul|UL|f|F|b|B)"},{begin:"(-?)(\\b0[xX][a-fA-F0-9']+|(\\b[\\d']+(\\.[\\d']*)?|\\.[\\d']+)([eE][-+]?[\\d']+)?)"}],relevance:0},i={className:"string",begin:'@"',end:'"',contains:[{begin:'""'}]},r=e.inherit(i,{illegal:/\n/}),s={className:"subst",begin:/\{/,end:/\}/,keywords:n},o=e.inherit(s,{illegal:/\n/}),l={className:"string",begin:/\$"/,end:'"',illegal:/\n/,contains:[{begin:/\{\{/},{begin:/\}\}/},e.BACKSLASH_ESCAPE,o]},c={className:"string",begin:/\$@"/,end:'"',contains:[{begin:/\{\{/},{begin:/\}\}/},{begin:'""'},s]},d=e.inherit(c,{illegal:/\n/,contains:[{begin:/\{\{/},{begin:/\}\}/},{begin:'""'},o]});s.contains=[c,l,i,e.APOS_STRING_MODE,e.QUOTE_STRING_MODE,a,e.C_BLOCK_COMMENT_MODE],o.contains=[d,l,r,e.APOS_STRING_MODE,e.QUOTE_STRING_MODE,a,e.inherit(e.C_BLOCK_COMMENT_MODE,{illegal:/\n/})];const g={variants:[{className:"string",begin:/"""("*)(?!")(.|\n)*?"""\1/,relevance:1},c,l,i,e.APOS_STRING_MODE,e.QUOTE_STRING_MODE]},u={begin:"<",end:">",contains:[{beginKeywords:"in out"},t]},b=e.IDENT_RE+"(<"+e.IDENT_RE+"(\\s*,\\s*"+e.IDENT_RE+")*>)?(\\[\\])?",m={begin:"@"+e.IDENT_RE,relevance:0};return{name:"C#",aliases:["cs","c#"],keywords:n,illegal:/::/,contains:[e.COMMENT("///","$",{returnBegin:!0,contains:[{className:"doctag",variants:[{begin:"///",relevance:0},{begin:"\x3c!--|--\x3e"},{begin:"</?",end:">"}]}]}),e.C_LINE_COMMENT_MODE,e.C_BLOCK_COMMENT_MODE,{className:"meta",begin:"#",end:"$",keywords:{keyword:"if else elif endif define undef warning error line region endregion pragma checksum"}},g,a,{beginKeywords:"class interface",relevance:0,end:/[{;=]/,illegal:/[^\s:,]/,contains:[{beginKeywords:"where class"},t,u,e.C_LINE_COMMENT_MODE,e.C_BLOCK_COMMENT_MODE]},{beginKeywords:"namespace",relevance:0,end:/[{;=]/,illegal:/[^\s:]/,contains:[t,e.C_LINE_COMMENT_MODE,e.C_BLOCK_COMMENT_MODE]},{beginKeywords:"record",relevance:0,end:/[{;=]/,illegal:/[^\s:]/,contains:[t,u,e.C_LINE_COMMENT_MODE,e.C_BLOCK_COMMENT_MODE]},{className:"meta",begin:"^\\s*\\[(?=[\\w])",excludeBegin:!0,end:"\\]",excludeEnd:!0,contains:[{className:"string",begin:/"/,end:/"/}]},{beginKeywords:"new return throw await else",relevance:0},{className:"function",begin:"("+b+"\\s+)+"+e.IDENT_RE+"\\s*(<[^=]+>\\s*)?\\(",returnBegin:!0,end:/\s*[{;=]/,excludeEnd:!0,keywords:n,contains:[{beginKeywords:"public private protected static internal protected abstract async extern override unsafe virtual new sealed partial",relevance:0},{begin:e.IDENT_RE+"\\s*(<[^=]+>\\s*)?\\(",returnBegin:!0,contains:[e.TITLE_MODE,u],relevance:0},{match:/\(\)/},{className:"params",begin:/\(/,end:/\)/,excludeBegin:!0,excludeEnd:!0,keywords:n,relevance:0,contains:[g,a,e.C_BLOCK_COMMENT_MODE]},e.C_LINE_COMMENT_MODE,e.C_BLOCK_COMMENT_MODE]},m]}},grmr_css:e=>{const n=e.regex,t=te(e),a=[e.APOS_STRING_MODE,e.QUOTE_STRING_MODE];return{name:"CSS",case_insensitive:!0,illegal:/[=|'\$]/,keywords:{keyframePosition:"from to"},classNameAliases:{keyframePosition:"selector-tag"},contains:[t.BLOCK_COMMENT,{begin:/-(webkit|moz|ms|o)-(?=[a-z])/},t.CSS_NUMBER_MODE,{className:"selector-id",begin:/#[A-Za-z0-9_-]+/,relevance:0},{className:"selector-class",begin:"\\.[a-zA-Z-][a-zA-Z0-9_-]*",relevance:0},t.ATTRIBUTE_SELECTOR_MODE,{className:"selector-pseudo",variants:[{begin:":("+re.join("|")+")"},{begin:":(:)?("+se.join("|")+")"}]},t.CSS_VARIABLE,{className:"attribute",begin:"\\b("+oe.join("|")+")\\b"},{begin:/:/,end:/[;}{]/,contains:[t.BLOCK_COMMENT,t.HEXCOLOR,t.IMPORTANT,t.CSS_NUMBER_MODE,...a,{begin:/(url|data-uri)\(/,end:/\)/,relevance:0,keywords:{built_in:"url data-uri"},contains:[...a,{className:"string",begin:/[^)]/,endsWithParent:!0,excludeEnd:!0}]},t.FUNCTION_DISPATCH]},{begin:n.lookahead(/@/),end:"[{;]",relevance:0,illegal:/:/,contains:[{className:"keyword",begin:/@-?\w[\w]*(-\w+)*/},{begin:/\s/,endsWithParent:!0,excludeEnd:!0,relevance:0,keywords:{$pattern:/[a-z-]+/,keyword:"and or not only",attribute:ie.join(" ")},contains:[{begin:/[a-z-]+(?=:)/,className:"attribute"},...a,t.CSS_NUMBER_MODE]}]},{className:"selector-tag",begin:"\\b("+ae.join("|")+")\\b"}]}},grmr_diff:e=>{const n=e.regex;return{name:"Diff",aliases:["patch"],contains:[{className:"meta",relevance:10,match:n.either(/^@@ +-\d+,\d+ +\+\d+,\d+ +@@/,/^\*\*\* +\d+,\d+ +\*\*\*\*$/,/^--- +\d+,\d+ +----$/)},{className:"comment",variants:[{begin:n.either(/Index: /,/^index/,/={3,}/,/^-{3}/,/^\*{3} /,/^\+{3}/,/^diff --git/),end:/$/},{match:/^\*{15}$/}]},{className:"addition",begin:/^\+/,end:/$/},{className:"deletion",begin:/^-/,end:/$/},{className:"addition",begin:/^!/,end:/$/}]}},grmr_go:e=>{const n={keyword:["break","case","chan","const","continue","default","defer","else","fallthrough","for","func","go","goto","if","import","interface","map","package","range","return","select","struct","switch","type","var"],type:["bool","byte","complex64","complex128","error","float32","float64","int8","int16","int32","int64","string","uint8","uint16","uint32","uint64","int","uint","uintptr","rune"],literal:["true","false","iota","nil"],built_in:["append","cap","close","complex","copy","imag","len","make","new","panic","print","println","real","recover","delete"]};return{name:"Go",aliases:["golang"],keywords:n,illegal:"</",contains:[e.C_LINE_COMMENT_MODE,e.C_BLOCK_COMMENT_MODE,{className:"string",variants:[e.QUOTE_STRING_MODE,e.APOS_STRING_MODE,{begin:"`",end:"`"}]},{className:"number",variants:[{match:/-?\b0[xX]\.[a-fA-F0-9](_?[a-fA-F0-9])*[pP][+-]?\d(_?\d)*i?/,relevance:0},{match:/-?\b0[xX](_?[a-fA-F0-9])+((\.([a-fA-F0-9](_?[a-fA-F0-9])*)?)?[pP][+-]?\d(_?\d)*)?i?/,relevance:0},{match:/-?\b0[oO](_?[0-7])*i?/,relevance:0},{match:/-?\.\d(_?\d)*([eE][+-]?\d(_?\d)*)?i?/,relevance:0},{match:/-?\b\d(_?\d)*(\.(\d(_?\d)*)?)?([eE][+-]?\d(_?\d)*)?i?/,relevance:0}]},{begin:/:=/},{className:"function",beginKeywords:"func",end:"\\s*(\\{|$)",excludeEnd:!0,contains:[e.TITLE_MODE,{className:"params",begin:/\(/,end:/\)/,endsParent:!0,keywords:n,illegal:/["']/}]}]}},grmr_graphql:e=>{const n=e.regex;return{name:"GraphQL",aliases:["gql"],case_insensitive:!0,disableAutodetect:!1,keywords:{keyword:["query","mutation","subscription","type","input","schema","directive","interface","union","scalar","fragment","enum","on"],literal:["true","false","null"]},contains:[e.HASH_COMMENT_MODE,e.QUOTE_STRING_MODE,e.NUMBER_MODE,{scope:"punctuation",match:/[.]{3}/,relevance:0},{scope:"punctuation",begin:/[\!\(\)\:\=\[\]\{\|\}]{1}/,relevance:0},{scope:"variable",begin:/\$/,end:/\W/,excludeEnd:!0,relevance:0},{scope:"meta",match:/@\w+/,excludeEnd:!0},{scope:"symbol",begin:n.concat(/[_A-Za-z][_0-9A-Za-z]*/,n.lookahead(/\s*:/)),relevance:0}],illegal:[/[;<']/,/BEGIN/]}},grmr_ini:e=>{const n=e.regex,t={className:"number",relevance:0,variants:[{begin:/([+-]+)?[\d]+_[\d_]+/},{begin:e.NUMBER_RE}]},a=e.COMMENT();a.variants=[{begin:/;/,end:/$/},{begin:/#/,end:/$/}];const i={className:"variable",variants:[{begin:/\$[\w\d"][\w\d_]*/},{begin:/\$\{(.*?)\}/}]},r={className:"literal",begin:/\bon|off|true|false|yes|no\b/},s={className:"string",contains:[e.BACKSLASH_ESCAPE],variants:[{begin:"'''",end:"'''",relevance:10},{begin:'"""',end:'"""',relevance:10},{begin:'"',end:'"'},{begin:"'",end:"'"}]},o={begin:/\[/,end:/\]/,contains:[a,r,i,s,t,"self"],relevance:0},l=n.either(/[A-Za-z0-9_-]+/,/"(\\"|[^"])*"/,/'[^']*'/);return{name:"TOML, also INI",aliases:["toml"],case_insensitive:!0,illegal:/\S/,contains:[a,{className:"section",begin:/\[+/,end:/\]+/},{begin:n.concat(l,"(\\s*\\.\\s*",l,")*",n.lookahead(/\s*=\s*[^#\s]/)),className:"attr",starts:{end:/$/,contains:[a,o,r,i,s,t]}}]}},grmr_java:e=>{const n=e.regex,t="[\xc0-\u02b8a-zA-Z_$][\xc0-\u02b8a-zA-Z_$0-9]*",a=t+be("(?:<"+t+"~~~(?:\\s*,\\s*"+t+"~~~)*>)?",/~~~/g,2),i={keyword:["synchronized","abstract","private","var","static","if","const ","for","while","strictfp","finally","protected","import","native","final","void","enum","else","break","transient","catch","instanceof","volatile","case","assert","package","default","public","try","switch","continue","throws","protected","public","private","module","requires","exports","do","sealed","yield","permits","goto","when"],literal:["false","true","null"],type:["char","boolean","long","float","int","byte","short","double"],built_in:["super","this"]},r={className:"meta",begin:"@"+t,contains:[{begin:/\(/,end:/\)/,contains:["self"]}]},s={className:"params",begin:/\(/,end:/\)/,keywords:i,relevance:0,contains:[e.C_BLOCK_COMMENT_MODE],endsParent:!0};return{name:"Java",aliases:["jsp"],keywords:i,illegal:/<\/|#/,contains:[e.COMMENT("/\\*\\*","\\*/",{relevance:0,contains:[{begin:/\w+@/,relevance:0},{className:"doctag",begin:"@[A-Za-z]+"}]}),{begin:/import java\.[a-z]+\./,keywords:"import",relevance:2},e.C_LINE_COMMENT_MODE,e.C_BLOCK_COMMENT_MODE,{begin:/"""/,end:/"""/,className:"string",contains:[e.BACKSLASH_ESCAPE]},e.APOS_STRING_MODE,e.QUOTE_STRING_MODE,{match:[/\b(?:class|interface|enum|extends|implements|new)/,/\s+/,t],className:{1:"keyword",3:"title.class"}},{match:/non-sealed/,scope:"keyword"},{begin:[n.concat(/(?!else)/,t),/\s+/,t,/\s+/,/=(?!=)/],className:{1:"type",3:"variable",5:"operator"}},{begin:[/record/,/\s+/,t],className:{1:"keyword",3:"title.class"},contains:[s,e.C_LINE_COMMENT_MODE,e.C_BLOCK_COMMENT_MODE]},{beginKeywords:"new throw return else",relevance:0},{begin:["(?:"+a+"\\s+)",e.UNDERSCORE_IDENT_RE,/\s*(?=\()/],className:{2:"title.function"},keywords:i,contains:[{className:"params",begin:/\(/,end:/\)/,keywords:i,relevance:0,contains:[r,e.APOS_STRING_MODE,e.QUOTE_STRING_MODE,ue,e.C_BLOCK_COMMENT_MODE]},e.C_LINE_COMMENT_MODE,e.C_BLOCK_COMMENT_MODE]},ue,r]}},grmr_javascript:ve,grmr_json:e=>{const n=["true","false","null"],t={scope:"literal",beginKeywords:n.join(" ")};return{name:"JSON",aliases:["jsonc"],keywords:{literal:n},contains:[{className:"attr",begin:/"(\\.|[^\\"\r\n])*"(?=\s*:)/,relevance:1.01},{match:/[{}[\],:]/,className:"punctuation",relevance:0},e.QUOTE_STRING_MODE,t,e.C_NUMBER_MODE,e.C_LINE_COMMENT_MODE,e.C_BLOCK_COMMENT_MODE],illegal:"\\S"}},grmr_kotlin:e=>{const n={keyword:"abstract as val var vararg get set class object open private protected public noinline crossinline dynamic final enum if else do while for when throw try catch finally import package is in fun override companion reified inline lateinit init interface annotation data sealed internal infix operator out by constructor super tailrec where const inner suspend typealias external expect actual",built_in:"Byte Short Char Int Long Boolean Float Double Void Unit Nothing",literal:"true false null"},t={className:"symbol",begin:e.UNDERSCORE_IDENT_RE+"@"},a={className:"subst",begin:/\$\{/,end:/\}/,contains:[e.C_NUMBER_MODE]},i={className:"variable",begin:"\\$"+e.UNDERSCORE_IDENT_RE},r={className:"string",variants:[{begin:'"""',end:'"""(?=[^"])',contains:[i,a]},{begin:"'",end:"'",illegal:/\n/,contains:[e.BACKSLASH_ESCAPE]},{begin:'"',end:'"',illegal:/\n/,contains:[e.BACKSLASH_ESCAPE,i,a]}]};a.contains.push(r);const s={className:"meta",begin:"@(?:file|property|field|get|set|receiver|param|setparam|delegate)\\s*:(?:\\s*"+e.UNDERSCORE_IDENT_RE+")?"},o={className:"meta",begin:"@"+e.UNDERSCORE_IDENT_RE,contains:[{begin:/\(/,end:/\)/,contains:[e.inherit(r,{className:"string"}),"self"]}]},l=ue,c=e.COMMENT("/\\*","\\*/",{contains:[e.C_BLOCK_COMMENT_MODE]}),d={variants:[{className:"type",begin:e.UNDERSCORE_IDENT_RE},{begin:/\(/,end:/\)/,contains:[]}]},g=d;return g.variants[1].contains=[d],d.variants[1].contains=[g],{name:"Kotlin",aliases:["kt","kts"],keywords:n,contains:[e.COMMENT("/\\*\\*","\\*/",{relevance:0,contains:[{className:"doctag",begin:"@[A-Za-z]+"}]}),e.C_LINE_COMMENT_MODE,c,{className:"keyword",begin:/\b(break|continue|return|this)\b/,starts:{contains:[{className:"symbol",begin:/@\w+/}]}},t,s,o,{className:"function",beginKeywords:"fun",end:"[(]|$",returnBegin:!0,excludeEnd:!0,keywords:n,relevance:5,contains:[{begin:e.UNDERSCORE_IDENT_RE+"\\s*\\(",returnBegin:!0,relevance:0,contains:[e.UNDERSCORE_TITLE_MODE]},{className:"type",begin:/</,end:/>/,keywords:"reified",relevance:0},{className:"params",begin:/\(/,end:/\)/,endsParent:!0,keywords:n,relevance:0,contains:[{begin:/:/,end:/[=,\/]/,endsWithParent:!0,contains:[d,e.C_LINE_COMMENT_MODE,c],relevance:0},e.C_LINE_COMMENT_MODE,c,s,o,r,e.C_NUMBER_MODE]},c]},{begin:[/class|interface|trait/,/\s+/,e.UNDERSCORE_IDENT_RE],beginScope:{3:"title.class"},keywords:"class interface trait",end:/[:\{(]|$/,excludeEnd:!0,illegal:"extends implements",contains:[{beginKeywords:"public protected internal private constructor"},e.UNDERSCORE_TITLE_MODE,{className:"type",begin:/</,end:/>/,excludeBegin:!0,excludeEnd:!0,relevance:0},{className:"type",begin:/[,:]\s*/,end:/[<\(,){\s]|$/,excludeBegin:!0,returnEnd:!0},s,o]},r,{className:"meta",begin:"^#!/usr/bin/env",end:"$",illegal:"\n"},l]}},grmr_less:e=>{const n=te(e),t=le,a="[\\w-]+",i="("+a+"|@\\{"+a+"\\})",r=[],s=[],o=e=>({className:"string",begin:"~?"+e+".*?"+e}),l=(e,n,t)=>({className:e,begin:n,relevance:t}),c={$pattern:/[a-z-]+/,keyword:"and or not only",attribute:ie.join(" ")},d={begin:"\\(",end:"\\)",contains:s,keywords:c,relevance:0};s.push(e.C_LINE_COMMENT_MODE,e.C_BLOCK_COMMENT_MODE,o("'"),o('"'),n.CSS_NUMBER_MODE,{begin:"(url|data-uri)\\(",starts:{className:"string",end:"[\\)\\n]",excludeEnd:!0}},n.HEXCOLOR,d,l("variable","@@?"+a,10),l("variable","@\\{"+a+"\\}"),l("built_in","~?`[^`]*?`"),{className:"attribute",begin:a+"\\s*:",end:":",returnBegin:!0,excludeEnd:!0},n.IMPORTANT,{beginKeywords:"and not"},n.FUNCTION_DISPATCH);const g=s.concat({begin:/\{/,end:/\}/,contains:r}),u={beginKeywords:"when",endsWithParent:!0,contains:[{beginKeywords:"and not"}].concat(s)},b={begin:i+"\\s*:",returnBegin:!0,end:/[;}]/,relevance:0,contains:[{begin:/-(webkit|moz|ms|o)-/},n.CSS_VARIABLE,{className:"attribute",begin:"\\b("+oe.join("|")+")\\b",end:/(?=:)/,starts:{endsWithParent:!0,illegal:"[<=$]",relevance:0,contains:s}}]},m={className:"keyword",begin:"@(import|media|charset|font-face|(-[a-z]+-)?keyframes|supports|document|namespace|page|viewport|host)\\b",starts:{end:"[;{}]",keywords:c,returnEnd:!0,contains:s,relevance:0}},p={className:"variable",variants:[{begin:"@"+a+"\\s*:",relevance:15},{begin:"@"+a}],starts:{end:"[;}]",returnEnd:!0,contains:g}},_={variants:[{begin:"[\\.#:&\\[>]",end:"[;{}]"},{begin:i,end:/\{/}],returnBegin:!0,returnEnd:!0,illegal:"[<='$\"]",relevance:0,contains:[e.C_LINE_COMMENT_MODE,e.C_BLOCK_COMMENT_MODE,u,l("keyword","all\\b"),l("variable","@\\{"+a+"\\}"),{begin:"\\b("+ae.join("|")+")\\b",className:"selector-tag"},n.CSS_NUMBER_MODE,l("selector-tag",i,0),l("selector-id","#"+i),l("selector-class","\\."+i,0),l("selector-tag","&",0),n.ATTRIBUTE_SELECTOR_MODE,{className:"selector-pseudo",begin:":("+re.join("|")+")"},{className:"selector-pseudo",begin:":(:)?("+se.join("|")+")"},{begin:/\(/,end:/\)/,relevance:0,contains:g},{begin:"!important"},n.FUNCTION_DISPATCH]},h={begin:a+":(:)?"+`(${t.join("|")})`,returnBegin:!0,contains:[_]};return r.push(e.C_LINE_COMMENT_MODE,e.C_BLOCK_COMMENT_MODE,m,p,h,b,_,u,n.FUNCTION_DISPATCH),{name:"Less",case_insensitive:!0,illegal:"[=>'/<($\"]",contains:r}},grmr_lua:e=>{const n="\\[=*\\[",t="\\]=*\\]",a={begin:n,end:t,contains:["self"]},i=[e.COMMENT("--(?!"+n+")","$"),e.COMMENT("--"+n,t,{contains:[a],relevance:10})];return{name:"Lua",aliases:["pluto"],keywords:{$pattern:e.UNDERSCORE_IDENT_RE,literal:"true false nil",keyword:"and break do else elseif end for goto if in local not or repeat return then until while",built_in:"_G _ENV _VERSION __index __newindex __mode __call __metatable __tostring __len __gc __add __sub __mul __div __mod __pow __concat __unm __eq __lt __le assert collectgarbage dofile error getfenv getmetatable ipairs load loadfile loadstring module next pairs pcall print rawequal rawget rawset require select setfenv setmetatable tonumber tostring type unpack xpcall arg self coroutine resume yield status wrap create running debug getupvalue debug sethook getmetatable gethook setmetatable setlocal traceback setfenv getinfo setupvalue getlocal getregistry getfenv io lines write close flush open output type read stderr stdin input stdout popen tmpfile math log max acos huge ldexp pi cos tanh pow deg tan cosh sinh random randomseed frexp ceil floor rad abs sqrt modf asin min mod fmod log10 atan2 exp sin atan os exit setlocale date getenv difftime remove time clock tmpname rename execute package preload loadlib loaded loaders cpath config path seeall string sub upper len gfind rep find match char dump gmatch reverse byte format gsub lower table setn insert getn foreachi maxn foreach concat sort remove"},contains:i.concat([{className:"function",beginKeywords:"function",end:"\\)",contains:[e.inherit(e.TITLE_MODE,{begin:"([_a-zA-Z]\\w*\\.)*([_a-zA-Z]\\w*:)?[_a-zA-Z]\\w*"}),{className:"params",begin:"\\(",endsWithParent:!0,contains:i}].concat(i)},e.C_NUMBER_MODE,e.APOS_STRING_MODE,e.QUOTE_STRING_MODE,{className:"string",begin:n,end:t,contains:[a],relevance:5}])}},grmr_makefile:e=>{const n={className:"variable",variants:[{begin:"\\$\\("+e.UNDERSCORE_IDENT_RE+"\\)",contains:[e.BACKSLASH_ESCAPE]},{begin:/\$[@%<?\^\+\*]/}]},t={className:"string",begin:/"/,end:/"/,contains:[e.BACKSLASH_ESCAPE,n]},a={className:"variable",begin:/\$\([\w-]+\s/,end:/\)/,keywords:{built_in:"subst patsubst strip findstring filter filter-out sort word wordlist firstword lastword dir notdir suffix basename addsuffix addprefix join wildcard realpath abspath error warning shell origin flavor foreach if or and call eval file value"},contains:[n,t]},i={begin:"^"+e.UNDERSCORE_IDENT_RE+"\\s*(?=[:+?]?=)"},r={className:"section",begin:/^[^\s]+:/,end:/$/,contains:[n]};return{name:"Makefile",aliases:["mk","mak","make"],keywords:{$pattern:/[\w-]+/,keyword:"define endef undefine ifdef ifndef ifeq ifneq else endif include -include sinclude override export unexport private vpath"},contains:[e.HASH_COMMENT_MODE,n,t,a,i,{className:"meta",begin:/^\.PHONY:/,end:/$/,keywords:{$pattern:/[\.\w]+/,keyword:".PHONY"}},r]}},grmr_markdown:e=>{const n={begin:/<\/?[A-Za-z_]/,end:">",subLanguage:"xml",relevance:0},t={variants:[{begin:/\[.+?\]\[.*?\]/,relevance:0},{begin:/\[.+?\]\(((data|javascript|mailto):|(?:http|ftp)s?:\/\/).*?\)/,relevance:2},{begin:e.regex.concat(/\[.+?\]\(/,/[A-Za-z][A-Za-z0-9+.-]*/,/:\/\/.*?\)/),relevance:2},{begin:/\[.+?\]\([./?&#].*?\)/,relevance:1},{begin:/\[.*?\]\(.*?\)/,relevance:0}],returnBegin:!0,contains:[{match:/\[(?=\])/},{className:"string",relevance:0,begin:"\\[",end:"\\]",excludeBegin:!0,returnEnd:!0},{className:"link",relevance:0,begin:"\\]\\(",end:"\\)",excludeBegin:!0,excludeEnd:!0},{className:"symbol",relevance:0,begin:"\\]\\[",end:"\\]",excludeBegin:!0,excludeEnd:!0}]},a={className:"strong",contains:[],variants:[{begin:/_{2}(?!\s)/,end:/_{2}/},{begin:/\*{2}(?!\s)/,end:/\*{2}/}]},i={className:"emphasis",contains:[],variants:[{begin:/\*(?![*\s])/,end:/\*/},{begin:/_(?![_\s])/,end:/_/,relevance:0}]},r=e.inherit(a,{contains:[]}),s=e.inherit(i,{contains:[]});a.contains.push(s),i.contains.push(r);let o=[n,t];return[a,i,r,s].forEach((e=>{e.contains=e.contains.concat(o)})),o=o.concat(a,i),{name:"Markdown",aliases:["md","mkdown","mkd"],contains:[{className:"section",variants:[{begin:"^#{1,6}",end:"$",contains:o},{begin:"(?=^.+?\\n[=-]{2,}$)",contains:[{begin:"^[=-]*$"},{begin:"^",end:"\\n",contains:o}]}]},n,{className:"bullet",begin:"^[ \t]*([*+-]|(\\d+\\.))(?=\\s+)",end:"\\s+",excludeEnd:!0},a,i,{className:"quote",begin:"^>\\s+",contains:o,end:"$"},{className:"code",variants:[{begin:"(`{3,})[^`](.|\\n)*?\\1`*[ ]*"},{begin:"(~{3,})[^~](.|\\n)*?\\1~*[ ]*"},{begin:"```",end:"```+[ ]*$"},{begin:"~~~",end:"~~~+[ ]*$"},{begin:"`.+?`"},{begin:"(?=^( {4}|\\t))",contains:[{begin:"^( {4}|\\t)",end:"(\\n)$"}],relevance:0}]},{begin:"^[-\\*]{3,}",end:"$"},t,{begin:/^\[[^\n]+\]:/,returnBegin:!0,contains:[{className:"symbol",begin:/\[/,end:/\]/,excludeBegin:!0,excludeEnd:!0},{className:"link",begin:/:\s*/,end:/$/,excludeBegin:!0}]},{scope:"literal",match:/&([a-zA-Z0-9]+|#[0-9]{1,7}|#[Xx][0-9a-fA-F]{1,6});/}]}},grmr_objectivec:e=>{const n=/[a-zA-Z@][a-zA-Z0-9_]*/,t={$pattern:n,keyword:["@interface","@class","@protocol","@implementation"]};return{name:"Objective-C",aliases:["mm","objc","obj-c","obj-c++","objective-c++"],keywords:{"variable.language":["this","super"],$pattern:n,keyword:["while","export","sizeof","typedef","const","struct","for","union","volatile","static","mutable","if","do","return","goto","enum","else","break","extern","asm","case","default","register","explicit","typename","switch","continue","inline","readonly","assign","readwrite","self","@synchronized","id","typeof","nonatomic","IBOutlet","IBAction","strong","weak","copy","in","out","inout","bycopy","byref","oneway","__strong","__weak","__block","__autoreleasing","@private","@protected","@public","@try","@property","@end","@throw","@catch","@finally","@autoreleasepool","@synthesize","@dynamic","@selector","@optional","@required","@encode","@package","@import","@defs","@compatibility_alias","__bridge","__bridge_transfer","__bridge_retained","__bridge_retain","__covariant","__contravariant","__kindof","_Nonnull","_Nullable","_Null_unspecified","__FUNCTION__","__PRETTY_FUNCTION__","__attribute__","getter","setter","retain","unsafe_unretained","nonnull","nullable","null_unspecified","null_resettable","class","instancetype","NS_DESIGNATED_INITIALIZER","NS_UNAVAILABLE","NS_REQUIRES_SUPER","NS_RETURNS_INNER_POINTER","NS_INLINE","NS_AVAILABLE","NS_DEPRECATED","NS_ENUM","NS_OPTIONS","NS_SWIFT_UNAVAILABLE","NS_ASSUME_NONNULL_BEGIN","NS_ASSUME_NONNULL_END","NS_REFINED_FOR_SWIFT","NS_SWIFT_NAME","NS_SWIFT_NOTHROW","NS_DURING","NS_HANDLER","NS_ENDHANDLER","NS_VALUERETURN","NS_VOIDRETURN"],literal:["false","true","FALSE","TRUE","nil","YES","NO","NULL"],built_in:["dispatch_once_t","dispatch_queue_t","dispatch_sync","dispatch_async","dispatch_once"],type:["int","float","char","unsigned","signed","short","long","double","wchar_t","unichar","void","bool","BOOL","id|0","_Bool"]},illegal:"</",contains:[{className:"built_in",begin:"\\b(AV|CA|CF|CG|CI|CL|CM|CN|CT|MK|MP|MTK|MTL|NS|SCN|SK|UI|WK|XC)\\w+"},e.C_LINE_COMMENT_MODE,e.C_BLOCK_COMMENT_MODE,e.C_NUMBER_MODE,e.QUOTE_STRING_MODE,e.APOS_STRING_MODE,{className:"string",variants:[{begin:'@"',end:'"',illegal:"\\n",contains:[e.BACKSLASH_ESCAPE]}]},{className:"meta",begin:/#\s*[a-z]+\b/,end:/$/,keywords:{keyword:"if else elif endif define undef warning error line pragma ifdef ifndef include"},contains:[{begin:/\\\n/,relevance:0},e.inherit(e.QUOTE_STRING_MODE,{className:"string"}),{className:"string",begin:/<.*?>/,end:/$/,illegal:"\\n"},e.C_LINE_COMMENT_MODE,e.C_BLOCK_COMMENT_MODE]},{className:"class",begin:"("+t.keyword.join("|")+")\\b",end:/(\{|$)/,excludeEnd:!0,keywords:t,contains:[e.UNDERSCORE_TITLE_MODE]},{begin:"\\."+e.UNDERSCORE_IDENT_RE,relevance:0}]}},grmr_perl:e=>{const n=e.regex,t=/[dualxmsipngr]{0,12}/,a={$pattern:/[\w.]+/,keyword:"abs accept alarm and atan2 bind binmode bless break caller chdir chmod chomp chop chown chr chroot class close closedir connect continue cos crypt dbmclose dbmopen defined delete die do dump each else elsif endgrent endhostent endnetent endprotoent endpwent endservent eof eval exec exists exit exp fcntl field fileno flock for foreach fork format formline getc getgrent getgrgid getgrnam gethostbyaddr gethostbyname gethostent getlogin getnetbyaddr getnetbyname getnetent getpeername getpgrp getpriority getprotobyname getprotobynumber getprotoent getpwent getpwnam getpwuid getservbyname getservbyport getservent getsockname getsockopt given glob gmtime goto grep gt hex if index int ioctl join keys kill last lc lcfirst length link listen local localtime log lstat lt ma map method mkdir msgctl msgget msgrcv msgsnd my ne next no not oct open opendir or ord our pack package pipe pop pos print printf prototype push q|0 qq quotemeta qw qx rand read readdir readline readlink readpipe recv redo ref rename require reset return reverse rewinddir rindex rmdir say scalar seek seekdir select semctl semget semop send setgrent sethostent setnetent setpgrp setpriority setprotoent setpwent setservent setsockopt shift shmctl shmget shmread shmwrite shutdown sin sleep socket socketpair sort splice split sprintf sqrt srand stat state study sub substr symlink syscall sysopen sysread sysseek system syswrite tell telldir tie tied time times tr truncate uc ucfirst umask undef unless unlink unpack unshift untie until use utime values vec wait waitpid wantarray warn when while write x|0 xor y|0"},i={className:"subst",begin:"[$@]\\{",end:"\\}",keywords:a},r={begin:/->\{/,end:/\}/},s={scope:"attr",match:/\s+:\s*\w+(\s*\(.*?\))?/},o={scope:"variable",variants:[{begin:/\$\d/},{begin:n.concat(/[$%@](?!")(\^\w\b|#\w+(::\w+)*|\{\w+\}|\w+(::\w*)*)/,"(?![A-Za-z])(?![@$%])")},{begin:/[$%@](?!")[^\s\w{=]|\$=/,relevance:0}],contains:[s]},l={className:"number",variants:[{match:/0?\.[0-9][0-9_]+\b/},{match:/\bv?(0|[1-9][0-9_]*(\.[0-9_]+)?|[1-9][0-9_]*)\b/},{match:/\b0[0-7][0-7_]*\b/},{match:/\b0x[0-9a-fA-F][0-9a-fA-F_]*\b/},{match:/\b0b[0-1][0-1_]*\b/}],relevance:0},c=[e.BACKSLASH_ESCAPE,i,o],d=[/!/,/\//,/\|/,/\?/,/'/,/"/,/#/],g=(e,a,i="\\1")=>{const r="\\1"===i?i:n.concat(i,a);return n.concat(n.concat("(?:",e,")"),a,/(?:\\.|[^\\\/])*?/,r,/(?:\\.|[^\\\/])*?/,i,t)},u=(e,a,i)=>n.concat(n.concat("(?:",e,")"),a,/(?:\\.|[^\\\/])*?/,i,t),b=[o,e.HASH_COMMENT_MODE,e.COMMENT(/^=\w/,/=cut/,{endsWithParent:!0}),r,{className:"string",contains:c,variants:[{begin:"q[qwxr]?\\s*\\(",end:"\\)",relevance:5},{begin:"q[qwxr]?\\s*\\[",end:"\\]",relevance:5},{begin:"q[qwxr]?\\s*\\{",end:"\\}",relevance:5},{begin:"q[qwxr]?\\s*\\|",end:"\\|",relevance:5},{begin:"q[qwxr]?\\s*<",end:">",relevance:5},{begin:"qw\\s+q",end:"q",relevance:5},{begin:"'",end:"'",contains:[e.BACKSLASH_ESCAPE]},{begin:'"',end:'"'},{begin:"`",end:"`",contains:[e.BACKSLASH_ESCAPE]},{begin:/\{\w+\}/,relevance:0},{begin:"-?\\w+\\s*=>",relevance:0}]},l,{begin:"(\\/\\/|"+e.RE_STARTERS_RE+"|\\b(split|return|print|reverse|grep)\\b)\\s*",keywords:"split return print reverse grep",relevance:0,contains:[e.HASH_COMMENT_MODE,{className:"regexp",variants:[{begin:g("s|tr|y",n.either(...d,{capture:!0}))},{begin:g("s|tr|y","\\(","\\)")},{begin:g("s|tr|y","\\[","\\]")},{begin:g("s|tr|y","\\{","\\}")}],relevance:2},{className:"regexp",variants:[{begin:/(m|qr)\/\//,relevance:0},{begin:u("(?:m|qr)?",/\//,/\//)},{begin:u("m|qr",n.either(...d,{capture:!0}),/\1/)},{begin:u("m|qr",/\(/,/\)/)},{begin:u("m|qr",/\[/,/\]/)},{begin:u("m|qr",/\{/,/\}/)}]}]},{className:"function",beginKeywords:"sub method",end:"(\\s*\\(.*?\\))?[;{]",excludeEnd:!0,relevance:5,contains:[e.TITLE_MODE,s]},{className:"class",beginKeywords:"class",end:"[;{]",excludeEnd:!0,relevance:5,contains:[e.TITLE_MODE,s,l]},{begin:"-\\w\\b",relevance:0},{begin:"^__DATA__$",end:"^__END__$",subLanguage:"mojolicious",contains:[{begin:"^@@.*",end:"$",className:"comment"}]}];return i.contains=b,r.contains=b,{name:"Perl",aliases:["pl","pm"],keywords:a,contains:b}},grmr_php:e=>{const n=e.regex,t=/(?![A-Za-z0-9])(?![$])/,a=n.concat(/[a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*/,t),i=n.concat(/(\\?[A-Z][a-z0-9_\x7f-\xff]+|\\?[A-Z]+(?=[A-Z][a-z0-9_\x7f-\xff])){1,}/,t),r=n.concat(/[A-Z]+/,t),s={scope:"variable",match:"\\$+"+a},o={scope:"subst",variants:[{begin:/\$\w+/},{begin:/\{\$/,end:/\}/}]},l=e.inherit(e.APOS_STRING_MODE,{illegal:null}),c="[ \t\n]",d={scope:"string",variants:[e.inherit(e.QUOTE_STRING_MODE,{illegal:null,contains:e.QUOTE_STRING_MODE.contains.concat(o)}),l,{begin:/<<<[ \t]*(?:(\w+)|"(\w+)")\n/,end:/[ \t]*(\w+)\b/,contains:e.QUOTE_STRING_MODE.contains.concat(o),"on:begin":(e,n)=>{n.data._beginMatch=e[1]||e[2]},"on:end":(e,n)=>{n.data._beginMatch!==e[1]&&n.ignoreMatch()}},e.END_SAME_AS_BEGIN({begin:/<<<[ \t]*'(\w+)'\n/,end:/[ \t]*(\w+)\b/})]},g={scope:"number",variants:[{begin:"\\b0[bB][01]+(?:_[01]+)*\\b"},{begin:"\\b0[oO][0-7]+(?:_[0-7]+)*\\b"},{begin:"\\b0[xX][\\da-fA-F]+(?:_[\\da-fA-F]+)*\\b"},{begin:"(?:\\b\\d+(?:_\\d+)*(\\.(?:\\d+(?:_\\d+)*))?|\\B\\.\\d+)(?:[eE][+-]?\\d+)?"}],relevance:0},u=["false","null","true"],b=["__CLASS__","__DIR__","__FILE__","__FUNCTION__","__COMPILER_HALT_OFFSET__","__LINE__","__METHOD__","__NAMESPACE__","__TRAIT__","die","echo","exit","include","include_once","print","require","require_once","array","abstract","and","as","binary","bool","boolean","break","callable","case","catch","class","clone","const","continue","declare","default","do","double","else","elseif","empty","enddeclare","endfor","endforeach","endif","endswitch","endwhile","enum","eval","extends","final","finally","float","for","foreach","from","global","goto","if","implements","instanceof","insteadof","int","integer","interface","isset","iterable","list","match|0","mixed","new","never","object","or","private","protected","public","readonly","real","return","string","switch","throw","trait","try","unset","use","var","void","while","xor","yield"],m=["Error|0","AppendIterator","ArgumentCountError","ArithmeticError","ArrayIterator","ArrayObject","AssertionError","BadFunctionCallException","BadMethodCallException","CachingIterator","CallbackFilterIterator","CompileError","Countable","DirectoryIterator","DivisionByZeroError","DomainException","EmptyIterator","ErrorException","Exception","FilesystemIterator","FilterIterator","GlobIterator","InfiniteIterator","InvalidArgumentException","IteratorIterator","LengthException","LimitIterator","LogicException","MultipleIterator","NoRewindIterator","OutOfBoundsException","OutOfRangeException","OuterIterator","OverflowException","ParentIterator","ParseError","RangeException","RecursiveArrayIterator","RecursiveCachingIterator","RecursiveCallbackFilterIterator","RecursiveDirectoryIterator","RecursiveFilterIterator","RecursiveIterator","RecursiveIteratorIterator","RecursiveRegexIterator","RecursiveTreeIterator","RegexIterator","RuntimeException","SeekableIterator","SplDoublyLinkedList","SplFileInfo","SplFileObject","SplFixedArray","SplHeap","SplMaxHeap","SplMinHeap","SplObjectStorage","SplObserver","SplPriorityQueue","SplQueue","SplStack","SplSubject","SplTempFileObject","TypeError","UnderflowException","UnexpectedValueException","UnhandledMatchError","ArrayAccess","BackedEnum","Closure","Fiber","Generator","Iterator","IteratorAggregate","Serializable","Stringable","Throwable","Traversable","UnitEnum","WeakReference","WeakMap","Directory","__PHP_Incomplete_Class","parent","php_user_filter","self","static","stdClass"],p={keyword:b,literal:(e=>{const n=[];return e.forEach((e=>{n.push(e),e.toLowerCase()===e?n.push(e.toUpperCase()):n.push(e.toLowerCase())})),n})(u),built_in:m},_=e=>e.map((e=>e.replace(/\|\d+$/,""))),h={variants:[{match:[/new/,n.concat(c,"+"),n.concat("(?!",_(m).join("\\b|"),"\\b)"),i],scope:{1:"keyword",4:"title.class"}}]},f=n.concat(a,"\\b(?!\\()"),E={variants:[{match:[n.concat(/::/,n.lookahead(/(?!class\b)/)),f],scope:{2:"variable.constant"}},{match:[/::/,/class/],scope:{2:"variable.language"}},{match:[i,n.concat(/::/,n.lookahead(/(?!class\b)/)),f],scope:{1:"title.class",3:"variable.constant"}},{match:[i,n.concat("::",n.lookahead(/(?!class\b)/))],scope:{1:"title.class"}},{match:[i,/::/,/class/],scope:{1:"title.class",3:"variable.language"}}]},y={scope:"attr",match:n.concat(a,n.lookahead(":"),n.lookahead(/(?!::)/))},w={relevance:0,begin:/\(/,end:/\)/,keywords:p,contains:[y,s,E,e.C_BLOCK_COMMENT_MODE,d,g,h]},v={relevance:0,match:[/\b/,n.concat("(?!fn\\b|function\\b|",_(b).join("\\b|"),"|",_(m).join("\\b|"),"\\b)"),a,n.concat(c,"*"),n.lookahead(/(?=\()/)],scope:{3:"title.function.invoke"},contains:[w]};w.contains.push(v);const N=[y,E,e.C_BLOCK_COMMENT_MODE,d,g,h],k={begin:n.concat(/#\[\s*\\?/,n.either(i,r)),beginScope:"meta",end:/]/,endScope:"meta",keywords:{literal:u,keyword:["new","array"]},contains:[{begin:/\[/,end:/]/,keywords:{literal:u,keyword:["new","array"]},contains:["self",...N]},...N,{scope:"meta",variants:[{match:i},{match:r}]}]};return{case_insensitive:!1,keywords:p,contains:[k,e.HASH_COMMENT_MODE,e.COMMENT("//","$"),e.COMMENT("/\\*","\\*/",{contains:[{scope:"doctag",match:"@[A-Za-z]+"}]}),{match:/__halt_compiler\(\);/,keywords:"__halt_compiler",starts:{scope:"comment",end:e.MATCH_NOTHING_RE,contains:[{match:/\?>/,scope:"meta",endsParent:!0}]}},{scope:"meta",variants:[{begin:/<\?php/,relevance:10},{begin:/<\?=/},{begin:/<\?/,relevance:.1},{begin:/\?>/}]},{scope:"variable.language",match:/\$this\b/},s,v,E,{match:[/const/,/\s/,a],scope:{1:"keyword",3:"variable.constant"}},h,{scope:"function",relevance:0,beginKeywords:"fn function",end:/[;{]/,excludeEnd:!0,illegal:"[$%\\[]",contains:[{beginKeywords:"use"},e.UNDERSCORE_TITLE_MODE,{begin:"=>",endsParent:!0},{scope:"params",begin:"\\(",end:"\\)",excludeBegin:!0,excludeEnd:!0,keywords:p,contains:["self",k,s,E,e.C_BLOCK_COMMENT_MODE,d,g]}]},{scope:"class",variants:[{beginKeywords:"enum",illegal:/[($"]/},{beginKeywords:"class interface trait",illegal:/[:($"]/}],relevance:0,end:/\{/,excludeEnd:!0,contains:[{beginKeywords:"extends implements"},e.UNDERSCORE_TITLE_MODE]},{beginKeywords:"namespace",relevance:0,end:";",illegal:/[.']/,contains:[e.inherit(e.UNDERSCORE_TITLE_MODE,{scope:"title.class"})]},{beginKeywords:"use",relevance:0,end:";",contains:[{match:/\b(as|const|function)\b/,scope:"keyword"},e.UNDERSCORE_TITLE_MODE]},d,g]}},grmr_php_template:e=>({name:"PHP template",subLanguage:"xml",contains:[{begin:/<\?(php|=)?/,end:/\?>/,subLanguage:"php",contains:[{begin:"/\\*",end:"\\*/",skip:!0},{begin:'b"',end:'"',skip:!0},{begin:"b'",end:"'",skip:!0},e.inherit(e.APOS_STRING_MODE,{illegal:null,className:null,contains:null,skip:!0}),e.inherit(e.QUOTE_STRING_MODE,{illegal:null,className:null,contains:null,skip:!0})]}]}),grmr_plaintext:e=>({name:"Plain text",aliases:["text","txt"],disableAutodetect:!0}),grmr_python:e=>{const n=e.regex,t=/[\p{XID_Start}_]\p{XID_Continue}*/u,a=["and","as","assert","async","await","break","case","class","continue","def","del","elif","else","except","finally","for","from","global","if","import","in","is","lambda","match","nonlocal|10","not","or","pass","raise","return","try","while","with","yield"],i={$pattern:/[A-Za-z]\w+|__\w+__/,keyword:a,built_in:["__import__","abs","all","any","ascii","bin","bool","breakpoint","bytearray","bytes","callable","chr","classmethod","compile","complex","delattr","dict","dir","divmod","enumerate","eval","exec","filter","float","format","frozenset","getattr","globals","hasattr","hash","help","hex","id","input","int","isinstance","issubclass","iter","len","list","locals","map","max","memoryview","min","next","object","oct","open","ord","pow","print","property","range","repr","reversed","round","set","setattr","slice","sorted","staticmethod","str","sum","super","tuple","type","vars","zip"],literal:["__debug__","Ellipsis","False","None","NotImplemented","True"],type:["Any","Callable","Coroutine","Dict","List","Literal","Generic","Optional","Sequence","Set","Tuple","Type","Union"]},r={className:"meta",begin:/^(>>>|\.\.\.) /},s={className:"subst",begin:/\{/,end:/\}/,keywords:i,illegal:/#/},o={begin:/\{\{/,relevance:0},l={className:"string",contains:[e.BACKSLASH_ESCAPE],variants:[{begin:/([uU]|[bB]|[rR]|[bB][rR]|[rR][bB])?'''/,end:/'''/,contains:[e.BACKSLASH_ESCAPE,r],relevance:10},{begin:/([uU]|[bB]|[rR]|[bB][rR]|[rR][bB])?"""/,end:/"""/,contains:[e.BACKSLASH_ESCAPE,r],relevance:10},{begin:/([fF][rR]|[rR][fF]|[fF])'''/,end:/'''/,contains:[e.BACKSLASH_ESCAPE,r,o,s]},{begin:/([fF][rR]|[rR][fF]|[fF])"""/,end:/"""/,contains:[e.BACKSLASH_ESCAPE,r,o,s]},{begin:/([uU]|[rR])'/,end:/'/,relevance:10},{begin:/([uU]|[rR])"/,end:/"/,relevance:10},{begin:/([bB]|[bB][rR]|[rR][bB])'/,end:/'/},{begin:/([bB]|[bB][rR]|[rR][bB])"/,end:/"/},{begin:/([fF][rR]|[rR][fF]|[fF])'/,end:/'/,contains:[e.BACKSLASH_ESCAPE,o,s]},{begin:/([fF][rR]|[rR][fF]|[fF])"/,end:/"/,contains:[e.BACKSLASH_ESCAPE,o,s]},e.APOS_STRING_MODE,e.QUOTE_STRING_MODE]},c="[0-9](_?[0-9])*",d=`(\\b(${c}))?\\.(${c})|\\b(${c})\\.`,g="\\b|"+a.join("|"),u={className:"number",relevance:0,variants:[{begin:`(\\b(${c})|(${d}))[eE][+-]?(${c})[jJ]?(?=${g})`},{begin:`(${d})[jJ]?`},{begin:`\\b([1-9](_?[0-9])*|0+(_?0)*)[lLjJ]?(?=${g})`},{begin:`\\b0[bB](_?[01])+[lL]?(?=${g})`},{begin:`\\b0[oO](_?[0-7])+[lL]?(?=${g})`},{begin:`\\b0[xX](_?[0-9a-fA-F])+[lL]?(?=${g})`},{begin:`\\b(${c})[jJ](?=${g})`}]},b={className:"comment",begin:n.lookahead(/# type:/),end:/$/,keywords:i,contains:[{begin:/# type:/},{begin:/#/,end:/\b\B/,endsWithParent:!0}]},m={className:"params",variants:[{className:"",begin:/\(\s*\)/,skip:!0},{begin:/\(/,end:/\)/,excludeBegin:!0,excludeEnd:!0,keywords:i,contains:["self",r,u,l,e.HASH_COMMENT_MODE]}]};return s.contains=[l,u,r],{name:"Python",aliases:["py","gyp","ipython"],unicodeRegex:!0,keywords:i,illegal:/(<\/|\?)|=>/,contains:[r,u,{scope:"variable.language",match:/\bself\b/},{beginKeywords:"if",relevance:0},{match:/\bor\b/,scope:"keyword"},l,b,e.HASH_COMMENT_MODE,{match:[/\bdef/,/\s+/,t],scope:{1:"keyword",3:"title.function"},contains:[m]},{variants:[{match:[/\bclass/,/\s+/,t,/\s*/,/\(\s*/,t,/\s*\)/]},{match:[/\bclass/,/\s+/,t]}],scope:{1:"keyword",3:"title.class",6:"title.class.inherited"}},{className:"meta",begin:/^[\t ]*@/,end:/(?=#)|$/,contains:[u,m,l]}]}},grmr_python_repl:e=>({aliases:["pycon"],contains:[{className:"meta.prompt",starts:{end:/ |$/,starts:{end:"$",subLanguage:"python"}},variants:[{begin:/^>>>(?=[ ]|$)/},{begin:/^\.\.\.(?=[ ]|$)/}]}]}),grmr_r:e=>{const n=e.regex,t=/(?:(?:[a-zA-Z]|\.[._a-zA-Z])[._a-zA-Z0-9]*)|\.(?!\d)/,a=n.either(/0[xX][0-9a-fA-F]+\.[0-9a-fA-F]*[pP][+-]?\d+i?/,/0[xX][0-9a-fA-F]+(?:[pP][+-]?\d+)?[Li]?/,/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[Li]?/),i=/[=!<>:]=|\|\||&&|:::?|<-|<<-|->>|->|\|>|[-+*\/?!$&|:<=>@^~]|\*\*/,r=n.either(/[()]/,/[{}]/,/\[\[/,/[[\]]/,/\\/,/,/);return{name:"R",keywords:{$pattern:t,keyword:"function if in break next repeat else for while",literal:"NULL NA TRUE FALSE Inf NaN NA_integer_|10 NA_real_|10 NA_character_|10 NA_complex_|10",built_in:"LETTERS letters month.abb month.name pi T F abs acos acosh all any anyNA Arg as.call as.character as.complex as.double as.environment as.integer as.logical as.null.default as.numeric as.raw asin asinh atan atanh attr attributes baseenv browser c call ceiling class Conj cos cosh cospi cummax cummin cumprod cumsum digamma dim dimnames emptyenv exp expression floor forceAndCall gamma gc.time globalenv Im interactive invisible is.array is.atomic is.call is.character is.complex is.double is.environment is.expression is.finite is.function is.infinite is.integer is.language is.list is.logical is.matrix is.na is.name is.nan is.null is.numeric is.object is.pairlist is.raw is.recursive is.single is.symbol lazyLoadDBfetch length lgamma list log max min missing Mod names nargs nzchar oldClass on.exit pos.to.env proc.time prod quote range Re rep retracemem return round seq_along seq_len seq.int sign signif sin sinh sinpi sqrt standardGeneric substitute sum switch tan tanh tanpi tracemem trigamma trunc unclass untracemem UseMethod xtfrm"},contains:[e.COMMENT(/#'/,/$/,{contains:[{scope:"doctag",match:/@examples/,starts:{end:n.lookahead(n.either(/\n^#'\s*(?=@[a-zA-Z]+)/,/\n^(?!#')/)),endsParent:!0}},{scope:"doctag",begin:"@param",end:/$/,contains:[{scope:"variable",variants:[{match:t},{match:/`(?:\\.|[^`\\])+`/}],endsParent:!0}]},{scope:"doctag",match:/@[a-zA-Z]+/},{scope:"keyword",match:/\\[a-zA-Z]+/}]}),e.HASH_COMMENT_MODE,{scope:"string",contains:[e.BACKSLASH_ESCAPE],variants:[e.END_SAME_AS_BEGIN({begin:/[rR]"(-*)\(/,end:/\)(-*)"/}),e.END_SAME_AS_BEGIN({begin:/[rR]"(-*)\{/,end:/\}(-*)"/}),e.END_SAME_AS_BEGIN({begin:/[rR]"(-*)\[/,end:/\](-*)"/}),e.END_SAME_AS_BEGIN({begin:/[rR]'(-*)\(/,end:/\)(-*)'/}),e.END_SAME_AS_BEGIN({begin:/[rR]'(-*)\{/,end:/\}(-*)'/}),e.END_SAME_AS_BEGIN({begin:/[rR]'(-*)\[/,end:/\](-*)'/}),{begin:'"',end:'"',relevance:0},{begin:"'",end:"'",relevance:0}]},{relevance:0,variants:[{scope:{1:"operator",2:"number"},match:[i,a]},{scope:{1:"operator",2:"number"},match:[/%[^%]*%/,a]},{scope:{1:"punctuation",2:"number"},match:[r,a]},{scope:{2:"number"},match:[/[^a-zA-Z0-9._]|^/,a]}]},{scope:{3:"operator"},match:[t,/\s+/,/<-/,/\s+/]},{scope:"operator",relevance:0,variants:[{match:i},{match:/%[^%]*%/}]},{scope:"punctuation",relevance:0,match:r},{begin:"`",end:"`",contains:[{begin:/\\./}]}]}},grmr_ruby:e=>{const n=e.regex,t="([a-zA-Z_]\\w*[!?=]?|[-+~]@|<<|>>|=~|===?|<=>|[<>]=?|\\*\\*|[-/+%^&*~`|]|\\[\\]=?)",a=n.either(/\b([A-Z]+[a-z0-9]+)+/,/\b([A-Z]+[a-z0-9]+)+[A-Z]+/),i=n.concat(a,/(::\w+)*/),r={"variable.constant":["__FILE__","__LINE__","__ENCODING__"],"variable.language":["self","super"],keyword:["alias","and","begin","BEGIN","break","case","class","defined","do","else","elsif","end","END","ensure","for","if","in","module","next","not","or","redo","require","rescue","retry","return","then","undef","unless","until","when","while","yield","include","extend","prepend","public","private","protected","raise","throw"],built_in:["proc","lambda","attr_accessor","attr_reader","attr_writer","define_method","private_constant","module_function"],literal:["true","false","nil"]},s={className:"doctag",begin:"@[A-Za-z]+"},o={begin:"#<",end:">"},l=[e.COMMENT("#","$",{contains:[s]}),e.COMMENT("^=begin","^=end",{contains:[s],relevance:10}),e.COMMENT("^__END__",e.MATCH_NOTHING_RE)],c={className:"subst",begin:/#\{/,end:/\}/,keywords:r},d={className:"string",contains:[e.BACKSLASH_ESCAPE,c],variants:[{begin:/'/,end:/'/},{begin:/"/,end:/"/},{begin:/`/,end:/`/},{begin:/%[qQwWx]?\(/,end:/\)/},{begin:/%[qQwWx]?\[/,end:/\]/},{begin:/%[qQwWx]?\{/,end:/\}/},{begin:/%[qQwWx]?</,end:/>/},{begin:/%[qQwWx]?\//,end:/\//},{begin:/%[qQwWx]?%/,end:/%/},{begin:/%[qQwWx]?-/,end:/-/},{begin:/%[qQwWx]?\|/,end:/\|/},{begin:/\B\?(\\\d{1,3})/},{begin:/\B\?(\\x[A-Fa-f0-9]{1,2})/},{begin:/\B\?(\\u\{?[A-Fa-f0-9]{1,6}\}?)/},{begin:/\B\?(\\M-\\C-|\\M-\\c|\\c\\M-|\\M-|\\C-\\M-)[\x20-\x7e]/},{begin:/\B\?\\(c|C-)[\x20-\x7e]/},{begin:/\B\?\\?\S/},{begin:n.concat(/<<[-~]?'?/,n.lookahead(/(\w+)(?=\W)[^\n]*\n(?:[^\n]*\n)*?\s*\1\b/)),contains:[e.END_SAME_AS_BEGIN({begin:/(\w+)/,end:/(\w+)/,contains:[e.BACKSLASH_ESCAPE,c]})]}]},g="[0-9](_?[0-9])*",u={className:"number",relevance:0,variants:[{begin:`\\b([1-9](_?[0-9])*|0)(\\.(${g}))?([eE][+-]?(${g})|r)?i?\\b`},{begin:"\\b0[dD][0-9](_?[0-9])*r?i?\\b"},{begin:"\\b0[bB][0-1](_?[0-1])*r?i?\\b"},{begin:"\\b0[oO][0-7](_?[0-7])*r?i?\\b"},{begin:"\\b0[xX][0-9a-fA-F](_?[0-9a-fA-F])*r?i?\\b"},{begin:"\\b0(_?[0-7])+r?i?\\b"}]},b={variants:[{match:/\(\)/},{className:"params",begin:/\(/,end:/(?=\))/,excludeBegin:!0,endsParent:!0,keywords:r}]},m=[d,{variants:[{match:[/class\s+/,i,/\s+<\s+/,i]},{match:[/\b(class|module)\s+/,i]}],scope:{2:"title.class",4:"title.class.inherited"},keywords:r},{match:[/(include|extend)\s+/,i],scope:{2:"title.class"},keywords:r},{relevance:0,match:[i,/\.new[. (]/],scope:{1:"title.class"}},{relevance:0,match:/\b[A-Z][A-Z_0-9]+\b/,className:"variable.constant"},{relevance:0,match:a,scope:"title.class"},{match:[/def/,/\s+/,t],scope:{1:"keyword",3:"title.function"},contains:[b]},{begin:e.IDENT_RE+"::"},{className:"symbol",begin:e.UNDERSCORE_IDENT_RE+"(!|\\?)?:",relevance:0},{className:"symbol",begin:":(?!\\s)",contains:[d,{begin:t}],relevance:0},u,{className:"variable",begin:"(\\$\\W)|((\\$|@@?)(\\w+))(?=[^@$?])(?![A-Za-z])(?![@$?'])"},{className:"params",begin:/\|(?!=)/,end:/\|/,excludeBegin:!0,excludeEnd:!0,relevance:0,keywords:r},{begin:"("+e.RE_STARTERS_RE+"|unless)\\s*",keywords:"unless",contains:[{className:"regexp",contains:[e.BACKSLASH_ESCAPE,c],illegal:/\n/,variants:[{begin:"/",end:"/[a-z]*"},{begin:/%r\{/,end:/\}[a-z]*/},{begin:"%r\\(",end:"\\)[a-z]*"},{begin:"%r!",end:"![a-z]*"},{begin:"%r\\[",end:"\\][a-z]*"}]}].concat(o,l),relevance:0}].concat(o,l);c.contains=m,b.contains=m;const p=[{begin:/^\s*=>/,starts:{end:"$",contains:m}},{className:"meta.prompt",begin:"^([>?]>|[\\w#]+\\(\\w+\\):\\d+:\\d+[>*]|(\\w+-)?\\d+\\.\\d+\\.\\d+(p\\d+)?[^\\d][^>]+>)(?=[ ])",starts:{end:"$",keywords:r,contains:m}}];return l.unshift(o),{name:"Ruby",aliases:["rb","gemspec","podspec","thor","irb"],keywords:r,illegal:/\/\*/,contains:[e.SHEBANG({binary:"ruby"})].concat(p).concat(l).concat(m)}},grmr_rust:e=>{const n=e.regex,t=/(r#)?/,a=n.concat(t,e.UNDERSCORE_IDENT_RE),i=n.concat(t,e.IDENT_RE),r={className:"title.function.invoke",relevance:0,begin:n.concat(/\b/,/(?!let|for|while|if|else|match\b)/,i,n.lookahead(/\s*\(/))},s="([ui](8|16|32|64|128|size)|f(32|64))?",o=["drop ","Copy","Send","Sized","Sync","Drop","Fn","FnMut","FnOnce","ToOwned","Clone","Debug","PartialEq","PartialOrd","Eq","Ord","AsRef","AsMut","Into","From","Default","Iterator","Extend","IntoIterator","DoubleEndedIterator","ExactSizeIterator","SliceConcatExt","ToString","assert!","assert_eq!","bitflags!","bytes!","cfg!","col!","concat!","concat_idents!","debug_assert!","debug_assert_eq!","env!","eprintln!","panic!","file!","format!","format_args!","include_bytes!","include_str!","line!","local_data_key!","module_path!","option_env!","print!","println!","select!","stringify!","try!","unimplemented!","unreachable!","vec!","write!","writeln!","macro_rules!","assert_ne!","debug_assert_ne!"],l=["i8","i16","i32","i64","i128","isize","u8","u16","u32","u64","u128","usize","f32","f64","str","char","bool","Box","Option","Result","String","Vec"];return{name:"Rust",aliases:["rs"],keywords:{$pattern:e.IDENT_RE+"!?",type:l,keyword:["abstract","as","async","await","become","box","break","const","continue","crate","do","dyn","else","enum","extern","false","final","fn","for","if","impl","in","let","loop","macro","match","mod","move","mut","override","priv","pub","ref","return","self","Self","static","struct","super","trait","true","try","type","typeof","union","unsafe","unsized","use","virtual","where","while","yield"],literal:["true","false","Some","None","Ok","Err"],built_in:o},illegal:"</",contains:[e.C_LINE_COMMENT_MODE,e.COMMENT("/\\*","\\*/",{contains:["self"]}),e.inherit(e.QUOTE_STRING_MODE,{begin:/b?"/,illegal:null}),{className:"symbol",begin:/'[a-zA-Z_][a-zA-Z0-9_]*(?!')/},{scope:"string",variants:[{begin:/b?r(#*)"(.|\n)*?"\1(?!#)/},{begin:/b?'/,end:/'/,contains:[{scope:"char.escape",match:/\\('|\w|x\w{2}|u\w{4}|U\w{8})/}]}]},{className:"number",variants:[{begin:"\\b0b([01_]+)"+s},{begin:"\\b0o([0-7_]+)"+s},{begin:"\\b0x([A-Fa-f0-9_]+)"+s},{begin:"\\b(\\d[\\d_]*(\\.[0-9_]+)?([eE][+-]?[0-9_]+)?)"+s}],relevance:0},{begin:[/fn/,/\s+/,a],className:{1:"keyword",3:"title.function"}},{className:"meta",begin:"#!?\\[",end:"\\]",contains:[{className:"string",begin:/"/,end:/"/,contains:[e.BACKSLASH_ESCAPE]}]},{begin:[/let/,/\s+/,/(?:mut\s+)?/,a],className:{1:"keyword",3:"keyword",4:"variable"}},{begin:[/for/,/\s+/,a,/\s+/,/in/],className:{1:"keyword",3:"variable",5:"keyword"}},{begin:[/type/,/\s+/,a],className:{1:"keyword",3:"title.class"}},{begin:[/(?:trait|enum|struct|union|impl|for)/,/\s+/,a],className:{1:"keyword",3:"title.class"}},{begin:e.IDENT_RE+"::",keywords:{keyword:"Self",built_in:o,type:l}},{className:"punctuation",begin:"->"},r]}},grmr_scss:e=>{const n=te(e),t=se,a=re,i="@[a-z-]+",r={className:"variable",begin:"(\\$[a-zA-Z-][a-zA-Z0-9_-]*)\\b",relevance:0};return{name:"SCSS",case_insensitive:!0,illegal:"[=/|']",contains:[e.C_LINE_COMMENT_MODE,e.C_BLOCK_COMMENT_MODE,n.CSS_NUMBER_MODE,{className:"selector-id",begin:"#[A-Za-z0-9_-]+",relevance:0},{className:"selector-class",begin:"\\.[A-Za-z0-9_-]+",relevance:0},n.ATTRIBUTE_SELECTOR_MODE,{className:"selector-tag",begin:"\\b("+ae.join("|")+")\\b",relevance:0},{className:"selector-pseudo",begin:":("+a.join("|")+")"},{className:"selector-pseudo",begin:":(:)?("+t.join("|")+")"},r,{begin:/\(/,end:/\)/,contains:[n.CSS_NUMBER_MODE]},n.CSS_VARIABLE,{className:"attribute",begin:"\\b("+oe.join("|")+")\\b"},{begin:"\\b(whitespace|wait|w-resize|visible|vertical-text|vertical-ideographic|uppercase|upper-roman|upper-alpha|underline|transparent|top|thin|thick|text|text-top|text-bottom|tb-rl|table-header-group|table-footer-group|sw-resize|super|strict|static|square|solid|small-caps|separate|se-resize|scroll|s-resize|rtl|row-resize|ridge|right|repeat|repeat-y|repeat-x|relative|progress|pointer|overline|outside|outset|oblique|nowrap|not-allowed|normal|none|nw-resize|no-repeat|no-drop|newspaper|ne-resize|n-resize|move|middle|medium|ltr|lr-tb|lowercase|lower-roman|lower-alpha|loose|list-item|line|line-through|line-edge|lighter|left|keep-all|justify|italic|inter-word|inter-ideograph|inside|inset|inline|inline-block|inherit|inactive|ideograph-space|ideograph-parenthesis|ideograph-numeric|ideograph-alpha|horizontal|hidden|help|hand|groove|fixed|ellipsis|e-resize|double|dotted|distribute|distribute-space|distribute-letter|distribute-all-lines|disc|disabled|default|decimal|dashed|crosshair|collapse|col-resize|circle|char|center|capitalize|break-word|break-all|bottom|both|bolder|bold|block|bidi-override|below|baseline|auto|always|all-scroll|absolute|table|table-cell)\\b"},{begin:/:/,end:/[;}{]/,relevance:0,contains:[n.BLOCK_COMMENT,r,n.HEXCOLOR,n.CSS_NUMBER_MODE,e.QUOTE_STRING_MODE,e.APOS_STRING_MODE,n.IMPORTANT,n.FUNCTION_DISPATCH]},{begin:"@(page|font-face)",keywords:{$pattern:i,keyword:"@page @font-face"}},{begin:"@",end:"[{;]",returnBegin:!0,keywords:{$pattern:/[a-z-]+/,keyword:"and or not only",attribute:ie.join(" ")},contains:[{begin:i,className:"keyword"},{begin:/[a-z-]+(?=:)/,className:"attribute"},r,e.QUOTE_STRING_MODE,e.APOS_STRING_MODE,n.HEXCOLOR,n.CSS_NUMBER_MODE]},n.FUNCTION_DISPATCH]}},grmr_shell:e=>({name:"Shell Session",aliases:["console","shellsession"],contains:[{className:"meta.prompt",begin:/^\s{0,3}[/~\w\d[\]()@-]*[>%$#][ ]?/,starts:{end:/[^\\](?=\s*$)/,subLanguage:"bash"}}]}),grmr_sql:e=>{const n=e.regex,t=e.COMMENT("--","$"),a=["abs","acos","array_agg","asin","atan","avg","cast","ceil","ceiling","coalesce","corr","cos","cosh","count","covar_pop","covar_samp","cume_dist","dense_rank","deref","element","exp","extract","first_value","floor","json_array","json_arrayagg","json_exists","json_object","json_objectagg","json_query","json_table","json_table_primitive","json_value","lag","last_value","lead","listagg","ln","log","log10","lower","max","min","mod","nth_value","ntile","nullif","percent_rank","percentile_cont","percentile_disc","position","position_regex","power","rank","regr_avgx","regr_avgy","regr_count","regr_intercept","regr_r2","regr_slope","regr_sxx","regr_sxy","regr_syy","row_number","sin","sinh","sqrt","stddev_pop","stddev_samp","substring","substring_regex","sum","tan","tanh","translate","translate_regex","treat","trim","trim_array","unnest","upper","value_of","var_pop","var_samp","width_bucket"],i=a,r=["abs","acos","all","allocate","alter","and","any","are","array","array_agg","array_max_cardinality","as","asensitive","asin","asymmetric","at","atan","atomic","authorization","avg","begin","begin_frame","begin_partition","between","bigint","binary","blob","boolean","both","by","call","called","cardinality","cascaded","case","cast","ceil","ceiling","char","char_length","character","character_length","check","classifier","clob","close","coalesce","collate","collect","column","commit","condition","connect","constraint","contains","convert","copy","corr","corresponding","cos","cosh","count","covar_pop","covar_samp","create","cross","cube","cume_dist","current","current_catalog","current_date","current_default_transform_group","current_path","current_role","current_row","current_schema","current_time","current_timestamp","current_path","current_role","current_transform_group_for_type","current_user","cursor","cycle","date","day","deallocate","dec","decimal","decfloat","declare","default","define","delete","dense_rank","deref","describe","deterministic","disconnect","distinct","double","drop","dynamic","each","element","else","empty","end","end_frame","end_partition","end-exec","equals","escape","every","except","exec","execute","exists","exp","external","extract","false","fetch","filter","first_value","float","floor","for","foreign","frame_row","free","from","full","function","fusion","get","global","grant","group","grouping","groups","having","hold","hour","identity","in","indicator","initial","inner","inout","insensitive","insert","int","integer","intersect","intersection","interval","into","is","join","json_array","json_arrayagg","json_exists","json_object","json_objectagg","json_query","json_table","json_table_primitive","json_value","lag","language","large","last_value","lateral","lead","leading","left","like","like_regex","listagg","ln","local","localtime","localtimestamp","log","log10","lower","match","match_number","match_recognize","matches","max","member","merge","method","min","minute","mod","modifies","module","month","multiset","national","natural","nchar","nclob","new","no","none","normalize","not","nth_value","ntile","null","nullif","numeric","octet_length","occurrences_regex","of","offset","old","omit","on","one","only","open","or","order","out","outer","over","overlaps","overlay","parameter","partition","pattern","per","percent","percent_rank","percentile_cont","percentile_disc","period","portion","position","position_regex","power","precedes","precision","prepare","primary","procedure","ptf","range","rank","reads","real","recursive","ref","references","referencing","regr_avgx","regr_avgy","regr_count","regr_intercept","regr_r2","regr_slope","regr_sxx","regr_sxy","regr_syy","release","result","return","returns","revoke","right","rollback","rollup","row","row_number","rows","running","savepoint","scope","scroll","search","second","seek","select","sensitive","session_user","set","show","similar","sin","sinh","skip","smallint","some","specific","specifictype","sql","sqlexception","sqlstate","sqlwarning","sqrt","start","static","stddev_pop","stddev_samp","submultiset","subset","substring","substring_regex","succeeds","sum","symmetric","system","system_time","system_user","table","tablesample","tan","tanh","then","time","timestamp","timezone_hour","timezone_minute","to","trailing","translate","translate_regex","translation","treat","trigger","trim","trim_array","true","truncate","uescape","union","unique","unknown","unnest","update","upper","user","using","value","values","value_of","var_pop","var_samp","varbinary","varchar","varying","versioning","when","whenever","where","width_bucket","window","with","within","without","year","add","asc","collation","desc","final","first","last","view"].filter((e=>!a.includes(e))),s={match:n.concat(/\b/,n.either(...i),/\s*\(/),relevance:0,keywords:{built_in:i}};function o(e){return n.concat(/\b/,n.either(...e.map((e=>e.replace(/\s+/,"\\s+")))),/\b/)}const l={scope:"keyword",match:o(["create table","insert into","primary key","foreign key","not null","alter table","add constraint","grouping sets","on overflow","character set","respect nulls","ignore nulls","nulls first","nulls last","depth first","breadth first"]),relevance:0};return{name:"SQL",case_insensitive:!0,illegal:/[{}]|<\//,keywords:{$pattern:/\b[\w\.]+/,keyword:((e,{exceptions:n,when:t}={})=>{const a=t;return n=n||[],e.map((e=>e.match(/\|\d+$/)||n.includes(e)?e:a(e)?e+"|0":e))})(r,{when:e=>e.length<3}),literal:["true","false","unknown"],type:["bigint","binary","blob","boolean","char","character","clob","date","dec","decfloat","decimal","float","int","integer","interval","nchar","nclob","national","numeric","real","row","smallint","time","timestamp","varchar","varying","varbinary"],built_in:["current_catalog","current_date","current_default_transform_group","current_path","current_role","current_schema","current_transform_group_for_type","current_user","session_user","system_time","system_user","current_time","localtime","current_timestamp","localtimestamp"]},contains:[{scope:"type",match:o(["double precision","large object","with timezone","without timezone"])},l,s,{scope:"variable",match:/@[a-z0-9][a-z0-9_]*/},{scope:"string",variants:[{begin:/'/,end:/'/,contains:[{match:/''/}]}]},{begin:/"/,end:/"/,contains:[{match:/""/}]},e.C_NUMBER_MODE,e.C_BLOCK_COMMENT_MODE,t,{scope:"operator",match:/[-+*/=%^~]|&&?|\|\|?|!=?|<(?:=>?|<|>)?|>[>=]?/,relevance:0}]}},grmr_swift:e=>{const n={match:/\s+/,relevance:0},t=e.COMMENT("/\\*","\\*/",{contains:["self"]}),a=[e.C_LINE_COMMENT_MODE,t],i={match:[/\./,m(...ke,...xe)],className:{2:"keyword"}},r={match:b(/\./,m(...Me)),relevance:0},s=Me.filter((e=>"string"==typeof e)).concat(["_|0"]),o={variants:[{className:"keyword",match:m(...Me.filter((e=>"string"!=typeof e)).concat(Oe).map(Ne),...xe)}]},l={$pattern:m(/\b\w+/,/#\w+/),keyword:s.concat(Ce),literal:Ae},c=[i,r,o],g=[{match:b(/\./,m(...Te)),relevance:0},{className:"built_in",match:b(/\b/,m(...Te),/(?=\()/)}],u={match:/->/,relevance:0},p=[u,{className:"operator",relevance:0,variants:[{match:Ie},{match:`\\.(\\.|${De})+`}]}],_="([0-9]_*)+",h="([0-9a-fA-F]_*)+",f={className:"number",relevance:0,variants:[{match:`\\b(${_})(\\.(${_}))?([eE][+-]?(${_}))?\\b`},{match:`\\b0x(${h})(\\.(${h}))?([pP][+-]?(${_}))?\\b`},{match:/\b0o([0-7]_*)+\b/},{match:/\b0b([01]_*)+\b/}]},E=(e="")=>({className:"subst",variants:[{match:b(/\\/,e,/[0\\tnr"']/)},{match:b(/\\/,e,/u\{[0-9a-fA-F]{1,8}\}/)}]}),y=(e="")=>({className:"subst",match:b(/\\/,e,/[\t ]*(?:[\r\n]|\r\n)/)}),w=(e="")=>({className:"subst",label:"interpol",begin:b(/\\/,e,/\(/),end:/\)/}),v=(e="")=>({begin:b(e,/"""/),end:b(/"""/,e),contains:[E(e),y(e),w(e)]}),N=(e="")=>({begin:b(e,/"/),end:b(/"/,e),contains:[E(e),w(e)]}),k={className:"string",variants:[v(),v("#"),v("##"),v("###"),N(),N("#"),N("##"),N("###")]},x=[e.BACKSLASH_ESCAPE,{begin:/\[/,end:/\]/,relevance:0,contains:[e.BACKSLASH_ESCAPE]}],O={begin:/\/[^\s](?=[^/\n]*\/)/,end:/\//,contains:x},M=e=>{const n=b(e,/\//),t=b(/\//,e);return{begin:n,end:t,contains:[...x,{scope:"comment",begin:`#(?!.*${t})`,end:/$/}]}},A={scope:"regexp",variants:[M("###"),M("##"),M("#"),O]},S={match:b(/`/,$e,/`/)},C=[S,{className:"variable",match:/\$\d+/},{className:"variable",match:`\\$${Be}+`}],T=[{match:/(@|#(un)?)available/,scope:"keyword",starts:{contains:[{begin:/\(/,end:/\)/,keywords:je,contains:[...p,f,k]}]}},{scope:"keyword",match:b(/@/,m(...ze),d(m(/\(/,/\s+/)))},{scope:"meta",match:b(/@/,$e)}],R={match:d(/\b[A-Z]/),relevance:0,contains:[{className:"type",match:b(/(AV|CA|CF|CG|CI|CL|CM|CN|CT|MK|MP|MTK|MTL|NS|SCN|SK|UI|WK|XC)/,Be,"+")},{className:"type",match:Fe,relevance:0},{match:/[?!]+/,relevance:0},{match:/\.\.\./,relevance:0},{match:b(/\s+&\s+/,d(Fe)),relevance:0}]},D={begin:/</,end:/>/,keywords:l,contains:[...a,...c,...T,u,R]};R.contains.push(D);const I={begin:/\(/,end:/\)/,relevance:0,keywords:l,contains:["self",{match:b($e,/\s*:/),keywords:"_|0",relevance:0},...a,A,...c,...g,...p,f,k,...C,...T,R]},L={begin:/</,end:/>/,keywords:"repeat each",contains:[...a,R]},B={begin:/\(/,end:/\)/,keywords:l,contains:[{begin:m(d(b($e,/\s*:/)),d(b($e,/\s+/,$e,/\s*:/))),end:/:/,relevance:0,contains:[{className:"keyword",match:/\b_\b/},{className:"params",match:$e}]},...a,...c,...p,f,k,...T,R,I],endsParent:!0,illegal:/["']/},$={match:[/(func|macro)/,/\s+/,m(S.match,$e,Ie)],className:{1:"keyword",3:"title.function"},contains:[L,B,n],illegal:[/\[/,/%/]},F={match:[/\b(?:subscript|init[?!]?)/,/\s*(?=[<(])/],className:{1:"keyword"},contains:[L,B,n],illegal:/\[|%/},z={match:[/operator/,/\s+/,Ie],className:{1:"keyword",3:"title"}},j={begin:[/precedencegroup/,/\s+/,Fe],className:{1:"keyword",3:"title"},contains:[R],keywords:[...Se,...Ae],end:/}/},U={begin:[/(struct|protocol|class|extension|enum|actor)/,/\s+/,$e,/\s*/],beginScope:{1:"keyword",3:"title.class"},keywords:l,contains:[L,...c,{begin:/:/,end:/\{/,keywords:l,contains:[{scope:"title.class.inherited",match:Fe},...c],relevance:0}]};for(const e of k.variants){const n=e.contains.find((e=>"interpol"===e.label));n.keywords=l;const t=[...c,...g,...p,f,k,...C];n.contains=[...t,{begin:/\(/,end:/\)/,contains:["self",...t]}]}return{name:"Swift",keywords:l,contains:[...a,$,F,{match:[/class\b/,/\s+/,/func\b/,/\s+/,/\b[A-Za-z_][A-Za-z0-9_]*\b/],scope:{1:"keyword",3:"keyword",5:"title.function"}},{match:[/class\b/,/\s+/,/var\b/],scope:{1:"keyword",3:"keyword"}},U,z,j,{beginKeywords:"import",end:/$/,contains:[...a],relevance:0},A,...c,...g,...p,f,k,...C,...T,R,I]}},grmr_typescript:e=>{const n=e.regex,t=ve(e),a=me,i=["any","void","number","boolean","string","object","never","symbol","bigint","unknown"],r={begin:[/namespace/,/\s+/,e.IDENT_RE],beginScope:{1:"keyword",3:"title.class"}},s={beginKeywords:"interface",end:/\{/,excludeEnd:!0,keywords:{keyword:"interface extends",built_in:i},contains:[t.exports.CLASS_REFERENCE]},o={$pattern:me,keyword:pe.concat(["type","interface","public","private","protected","implements","declare","abstract","readonly","enum","override","satisfies"]),literal:_e,built_in:we.concat(i),"variable.language":ye},l={className:"meta",begin:"@"+a},c=(e,n,t)=>{const a=e.contains.findIndex((e=>e.label===n));if(-1===a)throw Error("can not find mode to replace");e.contains.splice(a,1,t)};Object.assign(t.keywords,o),t.exports.PARAMS_CONTAINS.push(l);const d=t.contains.find((e=>"attr"===e.scope)),g=Object.assign({},d,{match:n.concat(a,n.lookahead(/\s*\?:/))});return t.exports.PARAMS_CONTAINS.push([t.exports.CLASS_REFERENCE,d,g]),t.contains=t.contains.concat([l,r,s,g]),c(t,"shebang",e.SHEBANG()),c(t,"use_strict",{className:"meta",relevance:10,begin:/^\s*['"]use strict['"]/}),t.contains.find((e=>"func.def"===e.label)).relevance=0,Object.assign(t,{name:"TypeScript",aliases:["ts","tsx","mts","cts"]}),t},grmr_vbnet:e=>{const n=e.regex,t=/\d{1,2}\/\d{1,2}\/\d{4}/,a=/\d{4}-\d{1,2}-\d{1,2}/,i=/(\d|1[012])(:\d+){0,2} *(AM|PM)/,r=/\d{1,2}(:\d{1,2}){1,2}/,s={className:"literal",variants:[{begin:n.concat(/# */,n.either(a,t),/ *#/)},{begin:n.concat(/# */,r,/ *#/)},{begin:n.concat(/# */,i,/ *#/)},{begin:n.concat(/# */,n.either(a,t),/ +/,n.either(i,r),/ *#/)}]},o=e.COMMENT(/'''/,/$/,{contains:[{className:"doctag",begin:/<\/?/,end:/>/}]}),l=e.COMMENT(null,/$/,{variants:[{begin:/'/},{begin:/([\t ]|^)REM(?=\s)/}]});return{name:"Visual Basic .NET",aliases:["vb"],case_insensitive:!0,classNameAliases:{label:"symbol"},keywords:{keyword:"addhandler alias aggregate ansi as async assembly auto binary by byref byval call case catch class compare const continue custom declare default delegate dim distinct do each equals else elseif end enum erase error event exit explicit finally for friend from function get global goto group handles if implements imports in inherits interface into iterator join key let lib loop me mid module mustinherit mustoverride mybase myclass namespace narrowing new next notinheritable notoverridable of off on operator option optional order overloads overridable overrides paramarray partial preserve private property protected public raiseevent readonly redim removehandler resume return select set shadows shared skip static step stop structure strict sub synclock take text then throw to try unicode until using when where while widening with withevents writeonly yield",built_in:"addressof and andalso await directcast gettype getxmlnamespace is isfalse isnot istrue like mod nameof new not or orelse trycast typeof xor cbool cbyte cchar cdate cdbl cdec cint clng cobj csbyte cshort csng cstr cuint culng cushort",type:"boolean byte char date decimal double integer long object sbyte short single string uinteger ulong ushort",literal:"true false nothing"},illegal:"//|\\{|\\}|endif|gosub|variant|wend|^\\$ ",contains:[{className:"string",begin:/"(""|[^/n])"C\b/},{className:"string",begin:/"/,end:/"/,illegal:/\n/,contains:[{begin:/""/}]},s,{className:"number",relevance:0,variants:[{begin:/\b\d[\d_]*((\.[\d_]+(E[+-]?[\d_]+)?)|(E[+-]?[\d_]+))[RFD@!#]?/},{begin:/\b\d[\d_]*((U?[SIL])|[%&])?/},{begin:/&H[\dA-F_]+((U?[SIL])|[%&])?/},{begin:/&O[0-7_]+((U?[SIL])|[%&])?/},{begin:/&B[01_]+((U?[SIL])|[%&])?/}]},{className:"label",begin:/^\w+:/},o,l,{className:"meta",begin:/[\t ]*#(const|disable|else|elseif|enable|end|externalsource|if|region)\b/,end:/$/,keywords:{keyword:"const disable else elseif enable end externalsource if region then"},contains:[l]}]}},grmr_wasm:e=>{e.regex;const n=e.COMMENT(/\(;/,/;\)/);return n.contains.push("self"),{name:"WebAssembly",keywords:{$pattern:/[\w.]+/,keyword:["anyfunc","block","br","br_if","br_table","call","call_indirect","data","drop","elem","else","end","export","func","global.get","global.set","local.get","local.set","local.tee","get_global","get_local","global","if","import","local","loop","memory","memory.grow","memory.size","module","mut","nop","offset","param","result","return","select","set_global","set_local","start","table","tee_local","then","type","unreachable"]},contains:[e.COMMENT(/;;/,/$/),n,{match:[/(?:offset|align)/,/\s*/,/=/],className:{1:"keyword",3:"operator"}},{className:"variable",begin:/\$[\w_]+/},{match:/(\((?!;)|\))+/,className:"punctuation",relevance:0},{begin:[/(?:func|call|call_indirect)/,/\s+/,/\$[^\s)]+/],className:{1:"keyword",3:"title.function"}},e.QUOTE_STRING_MODE,{match:/(i32|i64|f32|f64)(?!\.)/,className:"type"},{className:"keyword",match:/\b(f32|f64|i32|i64)(?:\.(?:abs|add|and|ceil|clz|const|convert_[su]\/i(?:32|64)|copysign|ctz|demote\/f64|div(?:_[su])?|eqz?|extend_[su]\/i32|floor|ge(?:_[su])?|gt(?:_[su])?|le(?:_[su])?|load(?:(?:8|16|32)_[su])?|lt(?:_[su])?|max|min|mul|nearest|neg?|or|popcnt|promote\/f32|reinterpret\/[fi](?:32|64)|rem_[su]|rot[lr]|shl|shr_[su]|store(?:8|16|32)?|sqrt|sub|trunc(?:_[su]\/f(?:32|64))?|wrap\/i64|xor))\b/},{className:"number",relevance:0,match:/[+-]?\b(?:\d(?:_?\d)*(?:\.\d(?:_?\d)*)?(?:[eE][+-]?\d(?:_?\d)*)?|0x[\da-fA-F](?:_?[\da-fA-F])*(?:\.[\da-fA-F](?:_?[\da-fA-D])*)?(?:[pP][+-]?\d(?:_?\d)*)?)\b|\binf\b|\bnan(?::0x[\da-fA-F](?:_?[\da-fA-D])*)?\b/}]}},grmr_xml:e=>{const n=e.regex,t=n.concat(/[\p{L}_]/u,n.optional(/[\p{L}0-9_.-]*:/u),/[\p{L}0-9_.-]*/u),a={className:"symbol",begin:/&[a-z]+;|&#[0-9]+;|&#x[a-f0-9]+;/},i={begin:/\s/,contains:[{className:"keyword",begin:/#?[a-z_][a-z1-9_-]+/,illegal:/\n/}]},r=e.inherit(i,{begin:/\(/,end:/\)/}),s=e.inherit(e.APOS_STRING_MODE,{className:"string"}),o=e.inherit(e.QUOTE_STRING_MODE,{className:"string"}),l={endsWithParent:!0,illegal:/</,relevance:0,contains:[{className:"attr",begin:/[\p{L}0-9._:-]+/u,relevance:0},{begin:/=\s*/,relevance:0,contains:[{className:"string",endsParent:!0,variants:[{begin:/"/,end:/"/,contains:[a]},{begin:/'/,end:/'/,contains:[a]},{begin:/[^\s"'=<>`]+/}]}]}]};return{name:"HTML, XML",aliases:["html","xhtml","rss","atom","xjb","xsd","xsl","plist","wsf","svg"],case_insensitive:!0,unicodeRegex:!0,contains:[{className:"meta",begin:/<![a-z]/,end:/>/,relevance:10,contains:[i,o,s,r,{begin:/\[/,end:/\]/,contains:[{className:"meta",begin:/<![a-z]/,end:/>/,contains:[i,r,o,s]}]}]},e.COMMENT(/<!--/,/-->/,{relevance:10}),{begin:/<!\[CDATA\[/,end:/\]\]>/,relevance:10},a,{className:"meta",end:/\?>/,variants:[{begin:/<\?xml/,relevance:10,contains:[o]},{begin:/<\?[a-z][a-z0-9]+/}]},{className:"tag",begin:/<style(?=\s|>)/,end:/>/,keywords:{name:"style"},contains:[l],starts:{end:/<\/style>/,returnEnd:!0,subLanguage:["css","xml"]}},{className:"tag",begin:/<script(?=\s|>)/,end:/>/,keywords:{name:"script"},contains:[l],starts:{end:/<\/script>/,returnEnd:!0,subLanguage:["javascript","handlebars","xml"]}},{className:"tag",begin:/<>|<\/>/},{className:"tag",begin:n.concat(/</,n.lookahead(n.concat(t,n.either(/\/>/,/>/,/\s/)))),end:/\/?>/,contains:[{className:"name",begin:t,relevance:0,starts:l}]},{className:"tag",begin:n.concat(/<\//,n.lookahead(n.concat(t,/>/))),contains:[{className:"name",begin:t,relevance:0},{begin:/>/,relevance:0,endsParent:!0}]}]}},grmr_yaml:e=>{const n="true false yes no null",t="[\\w#;/?:@&=+$,.~*'()[\\]]+",a={className:"string",relevance:0,variants:[{begin:/"/,end:/"/},{begin:/\S+/}],contains:[e.BACKSLASH_ESCAPE,{className:"template-variable",variants:[{begin:/\{\{/,end:/\}\}/},{begin:/%\{/,end:/\}/}]}]},i=e.inherit(a,{variants:[{begin:/'/,end:/'/,contains:[{begin:/''/,relevance:0}]},{begin:/"/,end:/"/},{begin:/[^\s,{}[\]]+/}]}),r={end:",",endsWithParent:!0,excludeEnd:!0,keywords:n,relevance:0},s={begin:/\{/,end:/\}/,contains:[r],illegal:"\\n",relevance:0},o={begin:"\\[",end:"\\]",contains:[r],illegal:"\\n",relevance:0},l=[{className:"attr",variants:[{begin:/[\w*@][\w*@ :()\./-]*:(?=[ \t]|$)/},{begin:/"[\w*@][\w*@ :()\./-]*":(?=[ \t]|$)/},{begin:/'[\w*@][\w*@ :()\./-]*':(?=[ \t]|$)/}]},{className:"meta",begin:"^---\\s*$",relevance:10},{className:"string",begin:"[\\|>]([1-9]?[+-])?[ ]*\\n( +)[^ ][^\\n]*\\n(\\2[^\\n]+\\n?)*"},{begin:"<%[%=-]?",end:"[%-]?%>",subLanguage:"ruby",excludeBegin:!0,excludeEnd:!0,relevance:0},{className:"type",begin:"!\\w+!"+t},{className:"type",begin:"!<"+t+">"},{className:"type",begin:"!"+t},{className:"type",begin:"!!"+t},{className:"meta",begin:"&"+e.UNDERSCORE_IDENT_RE+"$"},{className:"meta",begin:"\\*"+e.UNDERSCORE_IDENT_RE+"$"},{className:"bullet",begin:"-(?=[ ]|$)",relevance:0},e.HASH_COMMENT_MODE,{beginKeywords:n,keywords:{literal:n}},{className:"number",begin:"\\b[0-9]{4}(-[0-9][0-9]){0,2}([Tt \\t][0-9][0-9]?(:[0-9][0-9]){2})?(\\.[0-9]*)?([ \\t])*(Z|[-+][0-9][0-9]?(:[0-9][0-9])?)?\\b"},{className:"number",begin:e.C_NUMBER_RE+"\\b",relevance:0},s,o,{className:"string",relevance:0,begin:/'/,end:/'/,contains:[{match:/''/,scope:"char.escape",relevance:0}]},a],c=[...l];return c.pop(),c.push(i),r.contains=c,{name:"YAML",case_insensitive:!0,aliases:["yml"],contains:l}}});const Pe=ne;for(const e of Object.keys(Ue)){const n=e.replace("grmr_","").replace("_","-");Pe.registerLanguage(n,Ue[e])}return Pe}();"object"==typeof exports&&"undefined"!=typeof module&&(module.exports=hljs);
(()=>{var e=(()=>{"use strict";return e=>{const a=["true","false","null"],s={scope:"literal",beginKeywords:a.join(" ")};return{name:"JSON",aliases:["jsonc"],keywords:{literal:a},contains:[{className:"attr",begin:/"(\\.|[^\\"\r\n])*"(?=\s*:)/,relevance:1.01},{match:/[{}[\],:]/,className:"punctuation",relevance:0},e.QUOTE_STRING_MODE,s,e.C_NUMBER_MODE,e.C_LINE_COMMENT_MODE,e.C_BLOCK_COMMENT_MODE],illegal:"\\S"}}})();hljs.registerLanguage("json",e)})();
(()=>{var e=(()=>{"use strict";const e=["a","abbr","address","article","aside","audio","b","blockquote","body","button","canvas","caption","cite","code","dd","del","details","dfn","div","dl","dt","em","fieldset","figcaption","figure","footer","form","h1","h2","h3","h4","h5","h6","header","hgroup","html","i","iframe","img","input","ins","kbd","label","legend","li","main","mark","menu","nav","object","ol","optgroup","option","p","picture","q","quote","samp","section","select","source","span","strong","summary","sup","table","tbody","td","textarea","tfoot","th","thead","time","tr","ul","var","video","defs","g","marker","mask","pattern","svg","switch","symbol","feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feFlood","feGaussianBlur","feImage","feMerge","feMorphology","feOffset","feSpecularLighting","feTile","feTurbulence","linearGradient","radialGradient","stop","circle","ellipse","image","line","path","polygon","polyline","rect","text","use","textPath","tspan","foreignObject","clipPath"],i=["any-hover","any-pointer","aspect-ratio","color","color-gamut","color-index","device-aspect-ratio","device-height","device-width","display-mode","forced-colors","grid","height","hover","inverted-colors","monochrome","orientation","overflow-block","overflow-inline","pointer","prefers-color-scheme","prefers-contrast","prefers-reduced-motion","prefers-reduced-transparency","resolution","scan","scripting","update","width","min-width","max-width","min-height","max-height"].sort().reverse(),t=["active","any-link","blank","checked","current","default","defined","dir","disabled","drop","empty","enabled","first","first-child","first-of-type","fullscreen","future","focus","focus-visible","focus-within","has","host","host-context","hover","indeterminate","in-range","invalid","is","lang","last-child","last-of-type","left","link","local-link","not","nth-child","nth-col","nth-last-child","nth-last-col","nth-last-of-type","nth-of-type","only-child","only-of-type","optional","out-of-range","past","placeholder-shown","read-only","read-write","required","right","root","scope","target","target-within","user-invalid","valid","visited","where"].sort().reverse(),o=["after","backdrop","before","cue","cue-region","first-letter","first-line","grammar-error","marker","part","placeholder","selection","slotted","spelling-error"].sort().reverse(),r=["accent-color","align-content","align-items","align-self","alignment-baseline","all","anchor-name","animation","animation-composition","animation-delay","animation-direction","animation-duration","animation-fill-mode","animation-iteration-count","animation-name","animation-play-state","animation-range","animation-range-end","animation-range-start","animation-timeline","animation-timing-function","appearance","aspect-ratio","backdrop-filter","backface-visibility","background","background-attachment","background-blend-mode","background-clip","background-color","background-image","background-origin","background-position","background-position-x","background-position-y","background-repeat","background-size","baseline-shift","block-size","border","border-block","border-block-color","border-block-end","border-block-end-color","border-block-end-style","border-block-end-width","border-block-start","border-block-start-color","border-block-start-style","border-block-start-width","border-block-style","border-block-width","border-bottom","border-bottom-color","border-bottom-left-radius","border-bottom-right-radius","border-bottom-style","border-bottom-width","border-collapse","border-color","border-end-end-radius","border-end-start-radius","border-image","border-image-outset","border-image-repeat","border-image-slice","border-image-source","border-image-width","border-inline","border-inline-color","border-inline-end","border-inline-end-color","border-inline-end-style","border-inline-end-width","border-inline-start","border-inline-start-color","border-inline-start-style","border-inline-start-width","border-inline-style","border-inline-width","border-left","border-left-color","border-left-style","border-left-width","border-radius","border-right","border-right-color","border-right-style","border-right-width","border-spacing","border-start-end-radius","border-start-start-radius","border-style","border-top","border-top-color","border-top-left-radius","border-top-right-radius","border-top-style","border-top-width","border-width","bottom","box-align","box-decoration-break","box-direction","box-flex","box-flex-group","box-lines","box-ordinal-group","box-orient","box-pack","box-shadow","box-sizing","break-after","break-before","break-inside","caption-side","caret-color","clear","clip","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","color-scheme","column-count","column-fill","column-gap","column-rule","column-rule-color","column-rule-style","column-rule-width","column-span","column-width","columns","contain","contain-intrinsic-block-size","contain-intrinsic-height","contain-intrinsic-inline-size","contain-intrinsic-size","contain-intrinsic-width","container","container-name","container-type","content","content-visibility","counter-increment","counter-reset","counter-set","cue","cue-after","cue-before","cursor","cx","cy","direction","display","dominant-baseline","empty-cells","enable-background","field-sizing","fill","fill-opacity","fill-rule","filter","flex","flex-basis","flex-direction","flex-flow","flex-grow","flex-shrink","flex-wrap","float","flood-color","flood-opacity","flow","font","font-display","font-family","font-feature-settings","font-kerning","font-language-override","font-optical-sizing","font-palette","font-size","font-size-adjust","font-smooth","font-smoothing","font-stretch","font-style","font-synthesis","font-synthesis-position","font-synthesis-small-caps","font-synthesis-style","font-synthesis-weight","font-variant","font-variant-alternates","font-variant-caps","font-variant-east-asian","font-variant-emoji","font-variant-ligatures","font-variant-numeric","font-variant-position","font-variation-settings","font-weight","forced-color-adjust","gap","glyph-orientation-horizontal","glyph-orientation-vertical","grid","grid-area","grid-auto-columns","grid-auto-flow","grid-auto-rows","grid-column","grid-column-end","grid-column-start","grid-gap","grid-row","grid-row-end","grid-row-start","grid-template","grid-template-areas","grid-template-columns","grid-template-rows","hanging-punctuation","height","hyphenate-character","hyphenate-limit-chars","hyphens","icon","image-orientation","image-rendering","image-resolution","ime-mode","initial-letter","initial-letter-align","inline-size","inset","inset-area","inset-block","inset-block-end","inset-block-start","inset-inline","inset-inline-end","inset-inline-start","isolation","justify-content","justify-items","justify-self","kerning","left","letter-spacing","lighting-color","line-break","line-height","line-height-step","list-style","list-style-image","list-style-position","list-style-type","margin","margin-block","margin-block-end","margin-block-start","margin-bottom","margin-inline","margin-inline-end","margin-inline-start","margin-left","margin-right","margin-top","margin-trim","marker","marker-end","marker-mid","marker-start","marks","mask","mask-border","mask-border-mode","mask-border-outset","mask-border-repeat","mask-border-slice","mask-border-source","mask-border-width","mask-clip","mask-composite","mask-image","mask-mode","mask-origin","mask-position","mask-repeat","mask-size","mask-type","masonry-auto-flow","math-depth","math-shift","math-style","max-block-size","max-height","max-inline-size","max-width","min-block-size","min-height","min-inline-size","min-width","mix-blend-mode","nav-down","nav-index","nav-left","nav-right","nav-up","none","normal","object-fit","object-position","offset","offset-anchor","offset-distance","offset-path","offset-position","offset-rotate","opacity","order","orphans","outline","outline-color","outline-offset","outline-style","outline-width","overflow","overflow-anchor","overflow-block","overflow-clip-margin","overflow-inline","overflow-wrap","overflow-x","overflow-y","overlay","overscroll-behavior","overscroll-behavior-block","overscroll-behavior-inline","overscroll-behavior-x","overscroll-behavior-y","padding","padding-block","padding-block-end","padding-block-start","padding-bottom","padding-inline","padding-inline-end","padding-inline-start","padding-left","padding-right","padding-top","page","page-break-after","page-break-before","page-break-inside","paint-order","pause","pause-after","pause-before","perspective","perspective-origin","place-content","place-items","place-self","pointer-events","position","position-anchor","position-visibility","print-color-adjust","quotes","r","resize","rest","rest-after","rest-before","right","rotate","row-gap","ruby-align","ruby-position","scale","scroll-behavior","scroll-margin","scroll-margin-block","scroll-margin-block-end","scroll-margin-block-start","scroll-margin-bottom","scroll-margin-inline","scroll-margin-inline-end","scroll-margin-inline-start","scroll-margin-left","scroll-margin-right","scroll-margin-top","scroll-padding","scroll-padding-block","scroll-padding-block-end","scroll-padding-block-start","scroll-padding-bottom","scroll-padding-inline","scroll-padding-inline-end","scroll-padding-inline-start","scroll-padding-left","scroll-padding-right","scroll-padding-top","scroll-snap-align","scroll-snap-stop","scroll-snap-type","scroll-timeline","scroll-timeline-axis","scroll-timeline-name","scrollbar-color","scrollbar-gutter","scrollbar-width","shape-image-threshold","shape-margin","shape-outside","shape-rendering","speak","speak-as","src","stop-color","stop-opacity","stroke","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke-width","tab-size","table-layout","text-align","text-align-all","text-align-last","text-anchor","text-combine-upright","text-decoration","text-decoration-color","text-decoration-line","text-decoration-skip","text-decoration-skip-ink","text-decoration-style","text-decoration-thickness","text-emphasis","text-emphasis-color","text-emphasis-position","text-emphasis-style","text-indent","text-justify","text-orientation","text-overflow","text-rendering","text-shadow","text-size-adjust","text-transform","text-underline-offset","text-underline-position","text-wrap","text-wrap-mode","text-wrap-style","timeline-scope","top","touch-action","transform","transform-box","transform-origin","transform-style","transition","transition-behavior","transition-delay","transition-duration","transition-property","transition-timing-function","translate","unicode-bidi","user-modify","user-select","vector-effect","vertical-align","view-timeline","view-timeline-axis","view-timeline-inset","view-timeline-name","view-transition-name","visibility","voice-balance","voice-duration","voice-family","voice-pitch","voice-range","voice-rate","voice-stress","voice-volume","white-space","white-space-collapse","widows","width","will-change","word-break","word-spacing","word-wrap","writing-mode","x","y","z-index","zoom"].sort().reverse();return n=>{const a=n.regex,l=(e=>({IMPORTANT:{scope:"meta",begin:"!important"},BLOCK_COMMENT:e.C_BLOCK_COMMENT_MODE,HEXCOLOR:{scope:"number",begin:/#(([0-9a-fA-F]{3,4})|(([0-9a-fA-F]{2}){3,4}))\b/},FUNCTION_DISPATCH:{className:"built_in",begin:/[\w-]+(?=\()/},ATTRIBUTE_SELECTOR_MODE:{scope:"selector-attr",begin:/\[/,end:/\]/,illegal:"$",contains:[e.APOS_STRING_MODE,e.QUOTE_STRING_MODE]},CSS_NUMBER_MODE:{scope:"number",begin:e.NUMBER_RE+"(%|em|ex|ch|rem|vw|vh|vmin|vmax|cm|mm|in|pt|pc|px|deg|grad|rad|turn|s|ms|Hz|kHz|dpi|dpcm|dppx)?",relevance:0},CSS_VARIABLE:{className:"attr",begin:/--[A-Za-z_][A-Za-z0-9_-]*/}}))(n),s=[n.APOS_STRING_MODE,n.QUOTE_STRING_MODE];return{name:"CSS",case_insensitive:!0,illegal:/[=|'\$]/,keywords:{keyframePosition:"from to"},classNameAliases:{keyframePosition:"selector-tag"},contains:[l.BLOCK_COMMENT,{begin:/-(webkit|moz|ms|o)-(?=[a-z])/},l.CSS_NUMBER_MODE,{className:"selector-id",begin:/#[A-Za-z0-9_-]+/,relevance:0},{className:"selector-class",begin:"\\.[a-zA-Z-][a-zA-Z0-9_-]*",relevance:0},l.ATTRIBUTE_SELECTOR_MODE,{className:"selector-pseudo",variants:[{begin:":("+t.join("|")+")"},{begin:":(:)?("+o.join("|")+")"}]},l.CSS_VARIABLE,{className:"attribute",begin:"\\b("+r.join("|")+")\\b"},{begin:/:/,end:/[;}{]/,contains:[l.BLOCK_COMMENT,l.HEXCOLOR,l.IMPORTANT,l.CSS_NUMBER_MODE,...s,{begin:/(url|data-uri)\(/,end:/\)/,relevance:0,keywords:{built_in:"url data-uri"},contains:[...s,{className:"string",begin:/[^)]/,endsWithParent:!0,excludeEnd:!0}]},l.FUNCTION_DISPATCH]},{begin:a.lookahead(/@/),end:"[{;]",relevance:0,illegal:/:/,contains:[{className:"keyword",begin:/@-?\w[\w]*(-\w+)*/},{begin:/\s/,endsWithParent:!0,excludeEnd:!0,relevance:0,keywords:{$pattern:/[a-z-]+/,keyword:"and or not only",attribute:i.join(" ")},contains:[{begin:/[a-z-]+(?=:)/,className:"attribute"},...s,l.CSS_NUMBER_MODE]}]},{className:"selector-tag",begin:"\\b("+e.join("|")+")\\b"}]}}})();hljs.registerLanguage("css",e)})();
(()=>{var e=(()=>{"use strict";const e="[A-Za-z$_][0-9A-Za-z$_]*",n=["as","in","of","if","for","while","finally","var","new","function","do","return","void","else","break","catch","instanceof","with","throw","case","default","try","switch","continue","typeof","delete","let","yield","const","class","debugger","async","await","static","import","from","export","extends","using"],a=["true","false","null","undefined","NaN","Infinity"],t=["Object","Function","Boolean","Symbol","Math","Date","Number","BigInt","String","RegExp","Array","Float32Array","Float64Array","Int8Array","Uint8Array","Uint8ClampedArray","Int16Array","Int32Array","Uint16Array","Uint32Array","BigInt64Array","BigUint64Array","Set","Map","WeakSet","WeakMap","ArrayBuffer","SharedArrayBuffer","Atomics","DataView","JSON","Promise","Generator","GeneratorFunction","AsyncFunction","Reflect","Proxy","Intl","WebAssembly"],s=["Error","EvalError","InternalError","RangeError","ReferenceError","SyntaxError","TypeError","URIError"],r=["setInterval","setTimeout","clearInterval","clearTimeout","require","exports","eval","isFinite","isNaN","parseFloat","parseInt","decodeURI","decodeURIComponent","encodeURI","encodeURIComponent","escape","unescape"],c=["arguments","this","super","console","window","document","localStorage","sessionStorage","module","global"],i=[].concat(r,t,s);return o=>{const l=o.regex,d=e,b={begin:/<[A-Za-z0-9\\._:-]+/,end:/\/[A-Za-z0-9\\._:-]+>|\/>/,isTrulyOpeningTag:(e,n)=>{const a=e[0].length+e.index,t=e.input[a];if("<"===t||","===t)return void n.ignoreMatch();let s;">"===t&&(((e,{after:n})=>{const a="</"+e[0].slice(1);return-1!==e.input.indexOf(a,n)})(e,{after:a})||n.ignoreMatch());const r=e.input.substring(a);((s=r.match(/^\s*=/))||(s=r.match(/^\s+extends\s+/))&&0===s.index)&&n.ignoreMatch()}},g={$pattern:e,keyword:n,literal:a,built_in:i,"variable.language":c},u="[0-9](_?[0-9])*",m=`\\.(${u})`,E="0|[1-9](_?[0-9])*|0[0-7]*[89][0-9]*",A={className:"number",variants:[{begin:`(\\b(${E})((${m})|\\.)?|(${m}))[eE][+-]?(${u})\\b`},{begin:`\\b(${E})\\b((${m})\\b|\\.)?|(${m})\\b`},{begin:"\\b(0|[1-9](_?[0-9])*)n\\b"},{begin:"\\b0[xX][0-9a-fA-F](_?[0-9a-fA-F])*n?\\b"},{begin:"\\b0[bB][0-1](_?[0-1])*n?\\b"},{begin:"\\b0[oO][0-7](_?[0-7])*n?\\b"},{begin:"\\b0[0-7]+n?\\b"}],relevance:0},y={className:"subst",begin:"\\$\\{",end:"\\}",keywords:g,contains:[]},h={begin:".?html`",end:"",starts:{end:"`",returnEnd:!1,contains:[o.BACKSLASH_ESCAPE,y],subLanguage:"xml"}},_={begin:".?css`",end:"",starts:{end:"`",returnEnd:!1,contains:[o.BACKSLASH_ESCAPE,y],subLanguage:"css"}},N={begin:".?gql`",end:"",starts:{end:"`",returnEnd:!1,contains:[o.BACKSLASH_ESCAPE,y],subLanguage:"graphql"}},f={className:"string",begin:"`",end:"`",contains:[o.BACKSLASH_ESCAPE,y]},p={className:"comment",variants:[o.COMMENT(/\/\*\*(?!\/)/,"\\*/",{relevance:0,contains:[{begin:"(?=@[A-Za-z]+)",relevance:0,contains:[{className:"doctag",begin:"@[A-Za-z]+"},{className:"type",begin:"\\{",end:"\\}",excludeEnd:!0,excludeBegin:!0,relevance:0},{className:"variable",begin:d+"(?=\\s*(-)|$)",endsParent:!0,relevance:0},{begin:/(?=[^\n])\s/,relevance:0}]}]}),o.C_BLOCK_COMMENT_MODE,o.C_LINE_COMMENT_MODE]},v=[o.APOS_STRING_MODE,o.QUOTE_STRING_MODE,h,_,N,f,{match:/\$\d+/},A];y.contains=v.concat({begin:/\{/,end:/\}/,keywords:g,contains:["self"].concat(v)});const S=[].concat(p,y.contains),w=S.concat([{begin:/(\s*)\(/,end:/\)/,keywords:g,contains:["self"].concat(S)}]),R={className:"params",begin:/(\s*)\(/,end:/\)/,excludeBegin:!0,excludeEnd:!0,keywords:g,contains:w},O={variants:[{match:[/class/,/\s+/,d,/\s+/,/extends/,/\s+/,l.concat(d,"(",l.concat(/\./,d),")*")],scope:{1:"keyword",3:"title.class",5:"keyword",7:"title.class.inherited"}},{match:[/class/,/\s+/,d],scope:{1:"keyword",3:"title.class"}}]},k={relevance:0,match:l.either(/\bJSON/,/\b[A-Z][a-z]+([A-Z][a-z]*|\d)*/,/\b[A-Z]{2,}([A-Z][a-z]+|\d)+([A-Z][a-z]*)*/,/\b[A-Z]{2,}[a-z]+([A-Z][a-z]+|\d)*([A-Z][a-z]*)*/),className:"title.class",keywords:{_:[...t,...s]}},I={variants:[{match:[/function/,/\s+/,d,/(?=\s*\()/]},{match:[/function/,/\s*(?=\()/]}],className:{1:"keyword",3:"title.function"},label:"func.def",contains:[R],illegal:/%/},x={match:l.concat(/\b/,(T=[...r,"super","import"].map((e=>e+"\\s*\\(")),l.concat("(?!",T.join("|"),")")),d,l.lookahead(/\s*\(/)),className:"title.function",relevance:0};var T;const C={begin:l.concat(/\./,l.lookahead(l.concat(d,/(?![0-9A-Za-z$_(])/))),end:d,excludeBegin:!0,keywords:"prototype",className:"property",relevance:0},M={match:[/get|set/,/\s+/,d,/(?=\()/],className:{1:"keyword",3:"title.function"},contains:[{begin:/\(\)/},R]},B="(\\([^()]*(\\([^()]*(\\([^()]*\\)[^()]*)*\\)[^()]*)*\\)|"+o.UNDERSCORE_IDENT_RE+")\\s*=>",$={match:[/const|var|let/,/\s+/,d,/\s*/,/=\s*/,/(async\s*)?/,l.lookahead(B)],keywords:"async",className:{1:"keyword",3:"title.function"},contains:[R]};return{name:"JavaScript",aliases:["js","jsx","mjs","cjs"],keywords:g,exports:{PARAMS_CONTAINS:w,CLASS_REFERENCE:k},illegal:/#(?![$_A-z])/,contains:[o.SHEBANG({label:"shebang",binary:"node",relevance:5}),{label:"use_strict",className:"meta",relevance:10,begin:/^\s*['"]use (strict|asm)['"]/},o.APOS_STRING_MODE,o.QUOTE_STRING_MODE,h,_,N,f,p,{match:/\$\d+/},A,k,{scope:"attr",match:d+l.lookahead(":"),relevance:0},$,{begin:"("+o.RE_STARTERS_RE+"|\\b(case|return|throw)\\b)\\s*",keywords:"return throw case",relevance:0,contains:[p,o.REGEXP_MODE,{className:"function",begin:B,returnBegin:!0,end:"\\s*=>",contains:[{className:"params",variants:[{begin:o.UNDERSCORE_IDENT_RE,relevance:0},{className:null,begin:/\(\s*\)/,skip:!0},{begin:/(\s*)\(/,end:/\)/,excludeBegin:!0,excludeEnd:!0,keywords:g,contains:w}]}]},{begin:/,/,relevance:0},{match:/\s+/,relevance:0},{variants:[{begin:"<>",end:"</>"},{match:/<[A-Za-z0-9\\._:-]+\s*\/>/},{begin:b.begin,"on:begin":b.isTrulyOpeningTag,end:b.end}],subLanguage:"xml",contains:[{begin:b.begin,end:b.end,skip:!0,contains:["self"]}]}]},I,{beginKeywords:"while if switch catch for"},{begin:"\\b(?!function)"+o.UNDERSCORE_IDENT_RE+"\\([^()]*(\\([^()]*(\\([^()]*\\)[^()]*)*\\)[^()]*)*\\)\\s*\\{",returnBegin:!0,label:"func.def",contains:[R,o.inherit(o.TITLE_MODE,{begin:d,className:"title.function"})]},{match:/\.\.\./,relevance:0},C,{match:"\\$"+d,relevance:0},{match:[/\bconstructor(?=\s*\()/],className:{1:"title.function"},contains:[R]},x,{relevance:0,match:/\b[A-Z][A-Z_0-9]+\b/,className:"variable.constant"},O,M,{match:/\$[(.]/}]}}})();hljs.registerLanguage("javascript",e)})();
