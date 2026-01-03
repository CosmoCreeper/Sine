// => engine/utils/manager.mjs
// ===========================================================
// This module manages mods and themes, allowing Sine to
// enable, disable, and remove them.
// ===========================================================

import utils from "./utils.mjs";
import domUtils from "../utils/dom.mjs";
import ucAPI from "../utils/uc_api.sys.mjs";

class Manager {
    marketplace = ChromeUtils.importESModule("chrome://userscripts/content/engine/services/marketplace.mjs").default;
    #stylesheetManager = ChromeUtils.importESModule("chrome://userscripts/content/engine/services/stylesheets.mjs")
        .default;

    async rebuildMods() {
        // TODO: Unload scripts before reloading.

        /*
            Potential edge case where reloading all JS when only one needs
            reloading may cause functionality issues.
        */
        const mods = await utils.getMods();
        for (const mod of Object.values(mods)) {
            const scripts = await utils.getScripts();

            // Inject background modules.
            for (const scriptPath of Object.keys(scripts)) {
                if (scriptPath.endsWith(".sys.mjs")) {
                    ChromeUtils.importESModule("chrome://sine/content/" + scriptPath);
                }
            }

            const processes = utils.getProcesses();
            for (const process of processes) {
                ChromeUtils.compileScript("chrome://userscripts/content/engine/services/module_loader.mjs").then(
                    (script) => script.executeInGlobal(process)
                );

                for (const [scriptPath, scriptOptions] of Object.entries(scripts)) {
                    if (scriptOptions.regex.test(process.location.href)) {
                        if (scriptPath.endsWith(".uc.js")) {
                            Services.scriptloader.loadSubScriptWithOptions("chrome://sine/content/" + scriptPath, {
                                target: process,
                                ignoreCache: true,
                            });
                        }
                    }
                }
            }

            if (mod.chromeManifest) {
                const cmanifest = Cc["@mozilla.org/file/directory_service;1"]
                    .getService(Ci.nsIProperties)
                    .get("UChrm", Ci.nsIFile);
                cmanifest.append("sine-mods");
                cmanifest.append(mod.id);

                const paths = mod.chromeManifest.split("/");
                for (const path of paths) {
                    cmanifest.append(path);
                }

                if (cmanifest.exists()) {
                    Components.manager.QueryInterface(Ci.nsIComponentRegistrar).autoRegister(cmanifest);
                }
            }
        }

        this.#stylesheetManager.rebuildMods();
    }

    observe(subject, topic) {
        if (topic === "chrome-document-global-created" && subject) {
            subject.addEventListener("DOMContentLoaded", async (event) => {
                const window = event.target.defaultView;

                const scripts = await utils.getScripts({
                    removeBgModules: true,
                    href: window.location.href,
                });

                ChromeUtils.compileScript("chrome://userscripts/content/engine/services/module_loader.mjs").then(
                    (script) => script.executeInGlobal(window)
                );

                for (const scriptPath of Object.keys(scripts)) {
                    if (scriptPath.endsWith(".uc.js")) {
                        Services.scriptloader.loadSubScriptWithOptions("chrome://sine/content/" + scriptPath, {
                            target: window,
                            ignoreCache: true,
                        });
                    }
                }

                this.#stylesheetManager.onWindow(window);
            });
        }
    }

    initWinListener() {
        const observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);

        observerService.addObserver(this, "chrome-document-global-created", false);
    }

    async removeMod(id) {
        const installedMods = await utils.getMods();
        delete installedMods[id];
        await IOUtils.writeJSON(utils.modsDataFile, installedMods);

        await IOUtils.remove(utils.getModFolder(id), { recursive: true });
    }

    evaluateCondition(cond) {
        const isNot = !!cond.not;
        const condition = cond.if || cond.not;

        let prefValue;
        if (typeof condition.value === "boolean") {
            prefValue = Services.prefs.getBoolPref(condition.property, false);
        } else if (typeof condition.value === "number") {
            prefValue = Services.prefs.getIntPref(condition.property, 0);
        } else {
            prefValue = Services.prefs.getCharPref(condition.property, "");
        }

        return isNot ? prefValue !== condition.value : prefValue === condition.value;
    }

    evaluateConditions(conditions, operator = "AND") {
        const condArray = Array.isArray(conditions) ? conditions : [conditions];
        if (condArray.length === 0) {
            return true;
        }

        const results = condArray.map((cond) => {
            if (cond.if || cond.not) {
                return this.evaluateCondition(cond);
            } else if (cond.conditions) {
                return this.evaluateConditions(cond.conditions, cond.operator || "AND");
            } else {
                return false;
            }
        });

        return operator === "OR" ? results.some((r) => r) : results.every((r) => r);
    }

    updatePrefVisibility(pref, document) {
        const identifier = pref.id ?? pref.property;
        const targetId = identifier.replace(/\./g, "-");
        const element = document.getElementById(targetId);

        if (element) {
            const shouldShow = this.evaluateConditions(pref.conditions, pref.operator || "OR");
            element.style.display = shouldShow ? "flex" : "none";
        }
    }

    setupPrefObserver(pref, window) {
        const document = window.document;

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
            condArray.forEach((cond) => {
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
                    this.updatePrefVisibility(pref, document);
                }
            },
        };

        // Add observers for each property
        propsToObserve.forEach((prop) => {
            Services.prefs.addObserver(prop, observer);
        });

        window.addEventListener("beforeunload", () => {
            propsToObserve.forEach((prop) => {
                console.log("Removing observer: " + prop);
                Services.prefs.removeObserver(prop, observer);
            });
        });

        // Initial visibility check
        this.updatePrefVisibility(pref, document);

        return observer;
    }

    async loadMods(window = null, modsChanged = null) {
        let installedMods = await utils.getMods();

        const pages = utils.getProcesses(window, ["settings", "preferences"]);
        for (const window of pages) {
            const document = window.document;

            document.querySelector("#sineModsList").innerHTML = "";

            if (!Services.prefs.getBoolPref("sine.mods.disable-all", false)) {
                const sortedArr = Object.values(installedMods).sort((a, b) => a.name.localeCompare(b.name));
                const ids = sortedArr.map((obj) => obj.id);
                for (const key of ids) {
                    const modData = installedMods[key];
                    // Create new item.
                    const item = domUtils.appendXUL(
                        document.querySelector("#sineModsList"),
                        `
                        <vbox class="sineItem" mod-id="${key}">
                            ${
                                modData.preferences
                                    ? `
                                <dialog class="sineItemPreferenceDialog">
                                    <div class="sineItemPreferenceDialogTopBar">
                                        <h3 class="sineItemTitle">${modData.name} (v${modData.version})</h3>
                                        <button data-l10n-id="sine-dialog-close"></button>
                                    </div>
                                    <div class="sineItemPreferenceDialogContent"></div>
                                </dialog>
                            `
                                    : ""
                            }
                            <vbox class="sineItemContent">
                                <hbox id="sineItemContentHeader">
                                    <label>
                                        <h3 class="sineItemTitle">${modData.name} (v${modData.version})</h3>
                                        ${modsChanged && modsChanged.includes(modData.id) ? `
                                            <div class="sineItemUpdateIndicator"
                                                data-l10n-id="sine-mod-indicator-updated" data-l10n-attrs="title"></div>
                                        ` : ""}
                                    </label>
                                    <moz-toggle class="sineItemPreferenceToggle"
                                        data-l10n-id="sine-mod-disable-${modData.enabled ? "enabled" : "disabled"}"
                                        data-l10n-attrs="title" ${modData.enabled ? 'pressed=""' : ""}/>
                                </hbox>
                                <description class="description-deemphasized sineItemDescription">
                                    ${modData.description}
                                </description>
                            </vbox>
                            <hbox class="sineItemActions">
                                ${
                                    modData.preferences
                                        ? `
                                    <button class="sineItemConfigureButton"
                                        data-l10n-id="sine-settings-button" data-l10n-attrs="title"></button>
                                `
                                        : ""
                                }
                                ${
                                    modData.homepage && modData.homepage !== "" ?
                                    `<button class="sineItemHomepageButton" data-l10n-id="sine-mod-homepage-button"
                                        data-l10n-attrs="title"></button>` :
                                    ""
                                }
                                <button class="auto-update-toggle" ${modData["no-updates"] ? 'enabled=""' : ""}
                                    data-l10n-id="${modData["no-updates"] ? "enabled" : "disabled"}"
                                    data-l10n-attrs="title">
                                </button>
                                <button class="sineItemUninstallButton">
                                    <hbox class="box-inherit button-box">
                                        <label class="button-box" data-l10n-id="sine-mod-remove-button"></label>
                                    </hbox>
                                </button>
                            </hbox>
                        </vbox>
                    `
                    );

                    const toggle = item.querySelector(".sineItemPreferenceToggle");
                    toggle.addEventListener("toggle", async () => {
                        installedMods = await utils.getMods();
                        const theme = await this.toggleTheme(installedMods, modData.id);
                        toggle.setAttribute("data-l10n-id",
                            `sine-mod-disable-${theme.enabled ? "enabled" : "disabled"}`
                        );
                    });

                    if (modData.hasOwnProperty("preferences") && modData.preferences !== "") {
                        const dialog = item.querySelector("dialog");

                        item.querySelector(".sineItemPreferenceDialogTopBar button").addEventListener("click", () =>
                            dialog.close()
                        );

                        const loadPrefs = async () => {
                            const modPrefs = await utils.getModPreferences(modData);
                            for (const pref of modPrefs) {
                                const prefEl = this.parsePref(pref, window);
                                if (prefEl) {
                                    item.querySelector(".sineItemPreferenceDialogContent").appendChild(prefEl);
                                }
                            }
                        };

                        if (modData.enabled) {
                            loadPrefs();
                        } else {
                            // If the mod is not enabled, load preferences when the toggle is clicked.
                            toggle.addEventListener("toggle", loadPrefs, { once: true });
                        }

                        // Add the click event to the settings button.
                        item.querySelector(".sineItemConfigureButton").addEventListener("click", () =>
                            dialog.showModal()
                        );
                    }

                    // Add homepage button click event.
                    if (modData.homepage && modData.homepage !== "") {
                        item.querySelector(".sineItemHomepageButton").addEventListener("click", () =>
                            window.open(modData.homepage, "_blank")
                        );
                    }

                    // Add update button click event.
                    const updateButton = item.querySelector(".auto-update-toggle");
                    updateButton.addEventListener("click", async () => {
                        const installedMods = await utils.getMods();
                        installedMods[key]["no-updates"] = !installedMods[key]["no-updates"];
                        if (!updateButton.getAttribute("enabled")) {
                            updateButton.setAttribute("enabled", true);
                            updateButton.setAttribute("data-l10n-id", "sine-mod-update-disable-enabled");
                        } else {
                            updateButton.removeAttribute("enabled");
                            updateButton.setAttribute("data-l10n-id", "sine-mod-update-disable-disabled");
                        }
                        await IOUtils.writeJSON(utils.modsDataFile, installedMods);
                    });

                    // Add remove button click event.
                    const remove = item.querySelector(".sineItemUninstallButton");
                    remove.addEventListener("click", async () => {
                        const [msg] = await document.l10n.formatValues([
                          { id: "zen-theme-marketplace-remove-confirmation" },
                        ]);

                        if (window.confirm(msg)) {
                            remove.disabled = true;
                            await this.removeMod(modData.id);
                            this.marketplace.loadPage(null, this);
                            this.rebuildMods();
                            this.loadMods();
                            if (modData.hasOwnProperty("scripts")) {
                                ucAPI.showToast({
                                    id: "1",
                                });
                            }
                        }
                    });
                }

                if (document.querySelector("#sineModsList").children.length === 0) {
                    domUtils.appendXUL(
                        document.querySelector("#sineModsList"),
                        `
                            <description class="description-deemphasized" data-l10n-id="sine-no-mods-installed">
                              <html:a data-l10n-name="sine-marketplace-link"
                                target="_blank"
                                href="https://sineorg.github.io/store/"></html:a>
                            </description>
                        `,
                        null,
                        window.MozXULElement
                    );
                }
            } else {
                domUtils.appendXUL(
                    document.querySelector("#sineModsList"),
                    `<description class="description-deemphasized" data-l10n-id="sine-mods-disabled-desc"/>`,
                    null,
                    window.MozXULElement
                );
            }
        }
    }

    async updateMods(source) {
        if ((source === "auto" && utils.autoUpdate) || source === "manual") {
            const currModsList = await utils.getMods();
            const modsChanged = [];
            let changeMadeHasJS = false;
            let marketplaceData;

            for (const key in currModsList) {
                const currModData = currModsList[key];
                if (currModData.enabled && !currModData["no-updates"]) {
                    let newThemeData, githubAPI, originalData, homepage;
                    if (currModData.homepage) {
                        if (currModData.origin === "store") {
                            if (!marketplaceData) {
                                marketplaceData = await ucAPI.fetch(
                                    `https://raw.githubusercontent.com/sineorg/store/${utils.sineBranch}/marketplace.json`
                                );
                            }

                            newThemeData = marketplaceData[currModData.id];
                            homepage = "{store}";
                        } else {
                            originalData = await ucAPI.fetch(`${utils.rawURL(currModData.homepage)}theme.json`);
                            const minimalData = await this.createThemeJSON(
                                currModData.homepage,
                                currModsList,
                                typeof originalData !== "object" ? {} : originalData,
                                true
                            );
                            newThemeData = minimalData["theme"];
                            githubAPI = minimalData["githubAPI"];
                        }
                    } else {
                        newThemeData = await ucAPI.fetch(
                            `https://raw.githubusercontent.com/zen-browser/theme-store/main/themes/${currModData.id}/theme.json`
                        );
                        homepage = newThemeData.homepage;
                    }

                    if (
                        newThemeData &&
                        typeof newThemeData === "object" &&
                        new Date(currModData.updatedAt) < new Date(newThemeData.updatedAt)
                    ) {
                        modsChanged.push(currModData.id);
                        console.log(`[Sine]: Auto-updating ${currModData.name}!`);

                        if (currModData.homepage && currModData.origin !== "store") {
                            let customData = await this.createThemeJSON(
                                currModData.homepage,
                                currModsList,
                                typeof newThemeData !== "object" ? {} : newThemeData,
                                false,
                                githubAPI
                            );
                            if (currModData.hasOwnProperty("version") && customData.version === "1.0.0") {
                                customData.version = currModData.version;
                            }
                            customData.id = currModData.id;

                            const toReplace = ["name", "description"];
                            for (const property of toReplace) {
                                if (
                                    ((typeof originalData !== "object" &&
                                        originalData.toLowerCase() === "404: not found") ||
                                        !originalData[property]) &&
                                    currModData[property]
                                ) {
                                    customData[property] = currModData[property];
                                }
                            }

                            newThemeData = customData;
                            homepage = newThemeData.homepage;
                        }

                        changeMadeHasJS = await this.syncModData(homepage, currModsList, newThemeData, currModData);
                    }
                }
            }

            if (changeMadeHasJS) {
                ucAPI.showToast({
                    id: "2",
                });
            }

            if (modsChanged.length > 0) {
                this.rebuildMods();
                this.loadMods(null, modsChanged);
            }
            return modsChanged.length > 0;
        }
    }

    parsePref(pref, window) {
        const document = window.document;

        if (pref.disabledOn && pref.disabledOn.some((os) => os.includes(ucAPI.utils.os))) {
            return;
        }

        const tagName = {
            separator: "div",
            checkbox: "checkbox",
            dropdown: "hbox",
            text: "p",
            string: "hbox",
        }[pref.type];
        if (!tagName) return;
        const prefEl = document.createElement(tagName);

        if (pref.property || pref.id) {
            prefEl.id = (pref.id ?? pref.property).replace(/\./g, "-");
        }

        if (pref.label) {
            pref.label = utils.formatLabel(pref.label);
        }

        if (pref.property && pref.type !== "separator") {
            prefEl.title = pref.property;
        }

        if (pref.margin) {
            prefEl.style.margin = pref.margin;
        }

        if (pref.size) {
            prefEl.style.fontSize = pref.size;
        }

        if ((pref.type === "string" || pref.type === "dropdown") && pref.label) {
            domUtils.appendXUL(prefEl, `<label class="sineItemPreferenceLabel">${pref.label}</label>`);
        }

        const showRestartPrefToast = () => {
            ucAPI.showToast({
                id: "3",
            });
        };

        const convertToBool = (string) => (string.toLowerCase() === "false" ? false : true);

        if (pref.type === "separator") {
            prefEl.innerHTML += `
                <hr style="${pref.height ? `border-width: ${pref.height};` : ""}">
                </hr>
            `;
            if (pref.label) {
                prefEl.innerHTML += `<label class="separator-label"
                        ${pref.property ? `title="${pref.property}"` : ""}>
                            ${pref.label}
                     </label>`;
            }
        } else if (pref.type === "checkbox") {
            prefEl.className = "sineItemPreferenceCheckbox";
            domUtils.appendXUL(prefEl, '<input type="checkbox"/>');
            if (pref.label) {
                domUtils.appendXUL(prefEl, `<label class="checkbox-label">${pref.label}</label>`);
            }
        } else if (pref.type === "dropdown") {
            domUtils.appendXUL(
                prefEl,
                `
                <menulist>
                    <menupopup class="in-menulist"></menupopup>
                </menulist>
            `,
                null,
                window.MozXULElement
            );

            const menulist = prefEl.querySelector("menulist");
            const menupopup = menulist.children[0];

            const defaultMatch = pref.options.find((item) => item.value === pref.defaultValue);
            if (pref.placeholder !== false) {
                const label = pref.placeholder ?? "None";
                const value = defaultMatch ? "" : pref.defaultValue ?? "";

                menulist.setAttribute("label", label);
                menulist.setAttribute("value", value);

                domUtils.appendXUL(
                    menupopup,
                    `
                    <menuitem label="${label}" value="${value}"/>
                `,
                    null,
                    window.MozXULElement
                );
            }

            pref.options.forEach((option) => {
                domUtils.appendXUL(
                    menupopup,
                    `
                    <menuitem label="${option.label}" value="${option.value}"/>
                `,
                    null,
                    window.MozXULElement
                );
            });

            const placeholderSelected = ucAPI.prefs.get(pref.property) === "";
            const hasDefaultValue = pref.hasOwnProperty("defaultValue") || pref.hasOwnProperty("default");
            if (
                Services.prefs.getPrefType(pref.property) > 0 &&
                (!pref.force ||
                    !hasDefaultValue ||
                    (Services.prefs.getPrefType(pref.property) > 0 &&
                        Services.prefs.prefHasUserValue(pref.property))) &&
                !placeholderSelected
            ) {
                const value = ucAPI.prefs.get(pref.property);
                menulist.setAttribute(
                    "label",
                    Array.from(menupopup.children)
                        .find((item) => item.getAttribute("value") === value)
                        ?.getAttribute("label") ??
                        pref.placeholder ??
                        "None"
                );
                menulist.setAttribute("value", value);
            } else if (hasDefaultValue && !placeholderSelected) {
                menulist.setAttribute(
                    "label",
                    Array.from(menupopup.children)
                        .find((item) => item.getAttribute("value") === pref.defaultValue)?.getAttribute("label") ??
                        pref.placeholder ??
                        "None"
                );
                menulist.setAttribute("value", pref.defaultValue);
                ucAPI.prefs.set(pref.property, pref.defaultValue);
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
                this.rebuildMods();
            });
        } else if (pref.type === "text" && pref.label) {
            prefEl.innerHTML = pref.label;
        } else if (pref.type === "string") {
            const input = domUtils.appendXUL(
                prefEl,
                `
                <input type="text" placeholder="${pref.placeholder ?? "Type something..."}"/>
            `
            );

            const hasDefaultValue = pref.hasOwnProperty("defaultValue") || pref.hasOwnProperty("default");
            if (
                Services.prefs.getPrefType(pref.property) > 0 &&
                (!pref.force ||
                    !hasDefaultValue ||
                    (Services.prefs.getPrefType(pref.property) > 0 && Services.prefs.prefHasUserValue(pref.property)))
            ) {
                input.value = ucAPI.prefs.get(pref.property);
            } else {
                ucAPI.prefs.set(pref.property, pref.defaultValue ?? "");
                input.value = pref.defaultValue;
            }

            const updateBorder = () => {
                if (pref.border && pref.border === "value") {
                    input.style.borderColor = input.value;
                } else if (pref.border) {
                    input.style.borderColor = pref.border;
                }
            };
            updateBorder();

            input.addEventListener("change", () => {
                let value = input.value;
                if (pref.value === "number" || pref.value === "num") {
                    value = Number(input.value);
                } else if (pref.value === "boolean" || pref.value === "bool") {
                    value = convertToBool(input.value);
                }

                ucAPI.prefs.set(pref.property, value);

                this.rebuildMods();
                updateBorder();
                if (pref.restart) {
                    showRestartPrefToast();
                }
            });
        }

        if (((pref.type === "separator" && pref.label) || pref.type === "checkbox") && pref.property) {
            const clickable = pref.type === "checkbox" ? prefEl : prefEl.children[1];

            if (pref.defaultValue && !Services.prefs.getPrefType(pref.property) > 0) {
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
                    e.currentTarget.removeAttribute("checked");
                } else {
                    e.currentTarget.setAttribute("checked", true);
                }

                if (pref.restart) {
                    showRestartPrefToast();
                }
            });
        }

        if (pref.conditions) {
            this.setupPrefObserver(pref, window);
        }

        return prefEl;
    }

    async installMod(repo, origin, reload = true) {
        const currModsList = await utils.getMods();

        let newThemeData;
        if (origin === "store") {
            newThemeData = await ucAPI
                .fetch(`https://raw.githubusercontent.com/sineorg/store/${utils.sineBranch}/marketplace.json`)[repo];
        } else {
            newThemeData = await ucAPI
                .fetch(`${utils.rawURL(repo)}theme.json`)
                .then(async (res) => await this.createThemeJSON(repo, currModsList, typeof res !== "object" ? {} : res));
        }

        if (newThemeData) {
            if (typeof newThemeData.style === "object" && Object.keys(newThemeData.style).length === 0) {
                delete newThemeData.style;
            }
            
            let homepage = repo;
            if (origin === "store") {
                homepage = "{store}";
            }
            await this.syncModData(homepage, currModsList, newThemeData);

            if (reload) {
                this.rebuildMods();
                this.loadMods();
            }
        }
    }

    // Not optimized.
    async removeOldFiles(themeFolder, oldFiles, newFiles, newThemeData, isRoot = true) {
        const promises = [];
        for (const file of oldFiles) {
            if (typeof file === "string" && !newFiles.some((f) => typeof f === "string" && f === file)) {
                const filePath = PathUtils.join(themeFolder, file);
                promises.push(IOUtils.remove(filePath));
            } else if (typeof file === "object" && file.directory && file.contents) {
                if (isRoot && file.directory === "js") {
                    const oldJsFiles = Array.isArray(file.contents) ? file.contents : [];
                    const newJsFiles =
                        newFiles.find((f) => typeof f === "object" && f.directory === "js")?.contents || [];

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
                    const matchingDir = newFiles.find((f) => typeof f === "object" && f.directory === file.directory);

                    const dirPath = PathUtils.join(themeFolder, file.directory);
                    if (!matchingDir) {
                        promises.push(IOUtils.remove(dirPath, { recursive: true }));
                    } else {
                        promises.push(
                            this.removeOldFiles(dirPath, file.contents, matchingDir.contents, newThemeData, false)
                        );
                    }
                }
            }
        }

        await Promise.all(promises);
    }

    parseGitHubUrl(url) {
        let author;
        let repo;
        let branch = "main";
        let folder = "";

        url = url.replace(/\/+$/, "");

        let match = url.match(
            /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)(?:\/tree\/([^\/]+)(\/.*)?)?$/
        );

        if (match) {
            author = match[1];
            repo = match[2];
            branch = match[3] || "main";
            folder = match[4] || "";
        } else {
            match = url.match(
                /^https?:\/\/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/([^\/]+)(\/.*)?$/
            );

            if (match) {
                author = match[1];
                repo = match[2];
                branch = match[3];
                folder = match[4] || "";
            } else {
                match = url.match(
                    /^([^\/]+)\/([^\/]+)\/tree\/([^\/]+)(\/.*)?$/
                );

                if (match) {
                    author = match[1];
                    repo = match[2];
                    branch = match[3];
                    folder = match[4] || "";
                } else {
                    match = url.match(/^([^\/]+)\/([^\/]+)$/);

                    if (!match) {
                        throw new Error("Invalid GitHub repo format");
                    }

                    author = match[1];
                    repo = match[2];
                }
            }
        }

        return {
            name: repo,
            author,
            branch,
            folder: folder.replace(/^\/+/, ""),
        };
    }

    findFile(modId, fileNames, modEntries, repo, customUrl) {
        const fileEntries = modEntries.filter(
            (entry) =>
                (fileNames.filter(name => entry.endsWith(name)).length > 0) &&
                (entry.startsWith(modId + "/" + repo.folder) ||
                    entry === modId + "/" + customUrl)
        );

        if (
            fileEntries.length === 1 ||
            fileEntries.filter((entry) => entry === modId + "/" + customUrl).length === 1
        ) {
            return fileEntries[0].replace(modId + "/", "");
        } else if (fileEntries.length > 1) {
            const withDepth = fileEntries.map((p) => ({
                path: p,
                depth: p.split("/").filter(Boolean).length,
            }));

            const minDepth = Math.min(...withDepth.map((p) => p.depth));
            const shallowest = withDepth.filter((p) => p.depth === minDepth);

            if (shallowest.length === 1) {
                return shallowest[0].path.replace(modId + "/", "");
            }
        } else {
            return "";
        }
    }

    async syncModData(repoLink, currModsList, newThemeData, currModData = false) {
        const themeFolder = utils.getModFolder(newThemeData.id);
        const nestedPath = `${utils.sineBranch}/mods/${newThemeData.id}`;
        if (!repoLink) {
            repoLink = `zen-browser/theme-store/tree/main/themes/${newThemeData.id}`;
        } else if (repoLink === "{store}") {
            repoLink = "sineorg/store/tree/" + nestedPath;
            newThemeData["origin"] = "store";
        }
        const repo = this.parseGitHubUrl(repoLink);

        const tmpFolder = PathUtils.join(utils.modsDir, "tmp-" + currModData.id);
        if (currModData) {
            await IOUtils.move(themeFolder, tmpFolder);
        }

        const syncTime = Date.now();
        let zipUrl = `https://codeload.github.com/${repo.author}/${repo.name}/zip/refs/heads/${repo.branch}`;
        if (repoLink.startsWith("sineorg/store/")) {
            zipUrl = `https://raw.githubusercontent.com/sineorg/store/${nestedPath}/mod.zip`;
        }
        const zipEntries = await ucAPI.unpackRemoteArchive({
            url: zipUrl,
            id: newThemeData.id,
            zipPath: PathUtils.join(utils.modsDir, `${newThemeData.id}.zip`),
            extractDir: utils.modsDir,
            applyName: true,
        });

        if (currModData && await IOUtils.exists(PathUtils.join(themeFolder, repo.folder))) {
            await IOUtils.remove(themeFolder, { recursive: true });
            await IOUtils.move(tmpFolder, themeFolder);
            return false;
        }

        const promises = [];

        let customChrome, customContent, customPreferences;

        const { style, preferences } = newThemeData ?? {};

        if (typeof style === "string") {
            customChrome = style;
        } else if (style && typeof style === "object") {
            customChrome = style.chrome;
            customContent = style.content;
        }

        if (typeof preferences === "string") {
            customPreferences = preferences;
        }

        const normalizePath = (value) =>
            typeof value === "string" && value.startsWith("https://") ? this.parseGitHubUrl(value).folder : value;

        customChrome = normalizePath(customChrome);
        customContent = normalizePath(customContent);
        customPreferences = normalizePath(customPreferences);

        newThemeData.style = {};
        newThemeData.style.chrome = this.findFile(newThemeData.id, ["userChrome.css", "chrome.css"], zipEntries, repo, customChrome);
        newThemeData.style.content = this.findFile(newThemeData.id, ["userContent.css"], zipEntries, repo, customContent);

        newThemeData.preferences = this.findFile(newThemeData.id, ["preferences.json"], zipEntries, repo, customPreferences);
        // TODO: Apply default preferences.

        // If repository is potentially a host repo for more mods, delete the parent dir and leave the selected one.
        const isHostRepo = zipEntries.filter((entry) => entry.endsWith("theme.json")).length > 1;
        if (isHostRepo && repo.folder !== "") {
            const tempFolder = PathUtils.join(utils.modsDir, "temp");
            await IOUtils.move(PathUtils.join(themeFolder, ...repo.folder.split("/")), tempFolder);
            await IOUtils.remove(themeFolder, { recursive: true });
            await IOUtils.move(tempFolder, themeFolder);

            const keys = ["chrome", "content"];
            for (const key of keys) {
                newThemeData.style[key] = newThemeData.style[key].replace("^" + repo.folder + "/", "");
            }

            newThemeData.preferences = newThemeData.preferences.replace("^" + repo.folder + "/", "");
        }

        if (newThemeData.hasOwnProperty("modules")) {
            const modules = Array.isArray(newThemeData.modules) ? newThemeData.modules : [newThemeData.modules];
            for (const modModule of modules) {
                if (!Object.values(currModsList).some((item) => item.homepage === modModule)) {
                    promises.push(this.installMod(modModule, null, false));
                }
            }
        }

        await Promise.all(promises);
        newThemeData["no-updates"] = false;
        newThemeData.enabled = true;

        if (newThemeData.hasOwnProperty("modules")) {
            currModsList = await utils.getMods();
        }
        currModsList[newThemeData.id] = newThemeData;

        await IOUtils.writeJSON(utils.modsDataFile, currModsList);
        if (currModData) {
            return newThemeData.hasOwnProperty("scripts");
        }

        console.log("Sync time:", Date.now() - syncTime);
    }

    // Not optimized.
    async toggleTheme(installedMods, id) {
        const themeData = installedMods[id];

        themeData.enabled = !themeData.enabled;
        await IOUtils.writeJSON(utils.modsDataFile, installedMods);

        this.rebuildMods();

        if (themeData.js) {
            ucAPI.showToast({
                id: `6-${themeData.enabled ? "enabled" : "disabled"}`,
            });
        }

        return themeData;
    }

    async createThemeJSON(repo, themes, theme = {}, minimal = false, githubAPI = null) {
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
        };
        const notNull = (data) => {
            return (
                typeof data === "object" ||
                (typeof data === "string" && data && data.toLowerCase() !== "404: not found")
            );
        };

        const apiRequiringProperties = minimal ? ["updatedAt"] : ["description", "updatedAt"];
        let needAPI = false;
        for (const property of apiRequiringProperties) {
            if (!theme.hasOwnProperty(property)) {
                needAPI = true;
            }
        }
        if (needAPI && !githubAPI) {
            githubAPI = ucAPI.fetch(translateToAPI(repo));
        }

        let promise;
        const setProperty = (property, value) => {
            if (notNull(value) && !theme.hasOwnProperty(property)) {
                theme[property] = value;
            }
        };

        if (!minimal) {
            let randomID;
            do {
                randomID = ucAPI.utils.generateUUID();
            } while (themes.hasOwnProperty(randomID));
            setProperty("id", randomID);

            setProperty("homepage", repo);

            const repoBranches = repo.split("/");
            setProperty("name", repoBranches[repoBranches.length - 1]);

            if (!theme.hasOwnProperty("version")) {
                promise = (async () => {
                    const releasesData = await ucAPI.fetch(`${translateToAPI(repo)}/releases/latest`);
                    setProperty(
                        "version",
                        releasesData.hasOwnProperty("tag_name")
                            ? releasesData.tag_name.toLowerCase().replace("v", "")
                            : "1.0.0"
                    );
                })();
            }
        }
        if (needAPI) {
            githubAPI = await githubAPI;
            if (!minimal) {
                setProperty("description", githubAPI.description);
            }
            setProperty("updatedAt", githubAPI.updated_at);
        }

        await promise;
        return minimal ? { theme, githubAPI } : theme;
    }
}

export default new Manager();
