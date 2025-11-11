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

    rebuildMods() {
        return this.#stylesheetManager.rebuildMods();
    }

    async observe(subject, topic) {
        if (topic === "chrome-document-global-created" && subject) {
            subject.addEventListener("DOMContentLoaded", async (event) => {
                const window = event.target.defaultView;

                ChromeUtils.compileScript("chrome://userscripts/content/engine/services/module_loader.mjs").then(
                    (script) => script.executeInGlobal(window)
                );

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

    async loadMods(window = null) {
        let installedMods = await utils.getMods();

        const pages = utils.getProcesses(window, ["settings", "preferences"]);
        for (const window of pages) {
            const document = window.document;

            if (document.querySelector(".sineItem")) {
                document.querySelectorAll(".sineItem").forEach((el) => el.remove());
            }

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
                                        <button>Close</button>
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
                                ${
                                    modData.preferences
                                        ? `
                                    <button class="sineItemConfigureButton" title="Open settings"></button>
                                `
                                        : ""
                                }
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
                    `
                    );

                    const toggle = item.querySelector(".sineItemPreferenceToggle");
                    toggle.addEventListener("toggle", async () => {
                        installedMods = await utils.getMods();
                        const theme = await this.toggleTheme(installedMods, modData.id);
                        toggle.title = `${theme.enabled ? "Disable" : "Enable"} mod`;
                    });

                    if (modData.preferences) {
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
                    item.querySelector(".sineItemHomepageButton").addEventListener("click", () =>
                        window.open(modData.homepage, "_blank")
                    );

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
                            const jsFiles = modData["editable-files"]?.find((item) => item.directory === "js");
                            if (jsFiles) {
                                for (const file of jsFiles.contents) {
                                    const jsPath = PathUtils.join(
                                        utils.jsDir,
                                        `${modData.id}_${modData.enabled ? file : file.replace(/[a-z]+\.m?js$/, "db")}`
                                    );
                                    jsPromises.push(IOUtils.remove(jsPath, { ignoreAbsent: true }));
                                }
                            }

                            await this.removeMod(modData.id);
                            this.marketplace.loadPage(null, this);
                            this.rebuildMods();
                            utils
                                .getProcesses(null, ["settings", "preferences"])
                                .forEach((window) => window.document.querySelector(`[mod-id="${key}"]`).remove());
                            if (modData.hasOwnProperty("js")) {
                                await Promise.all(jsPromises);
                                ucAPI.showToast({
                                    title: "A mod utilizing JS has been removed.",
                                    description: "For usage of it to be fully halted, restart your browser.",
                                });
                            }
                        }
                    });
                }
            }
        }
    }

    async updateMods(source) {
        if ((source === "auto" && utils.autoUpdate) || source === "manual") {
            const currThemeData = await utils.getMods();
            let changeMade = false;
            let changeMadeHasJS = false;
            for (const key in currThemeData) {
                const currModData = currThemeData[key];
                if (currModData.enabled && !currModData["no-updates"] && !currModData.local) {
                    let newThemeData, githubAPI, originalData;
                    if (currModData.homepage) {
                        originalData = await ucAPI.fetch(`${utils.rawURL(currModData.homepage)}theme.json`);
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
                        console.log(`[Sine]: Auto-updating ${currModData.name}!`);
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
                                if (!customData.hasOwnProperty(property) && currModData.hasOwnProperty(property)) {
                                    customData[property] = currModData[property];
                                }
                            }

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
                        }
                        changeMadeHasJS = await this.syncModData(currThemeData, newThemeData, currModData);
                    }
                }
            }

            if (changeMadeHasJS) {
                ucAPI.showToast({
                    title: "A mod utilizing JS has been updated.",
                    description: "For it to work properly, restart your browser.",
                });
            }

            if (changeMade) {
                this.rebuildMods();
                this.loadMods();
            }
            return changeMade;
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
                title: "You changed a preference that requires a browser restart to take effect.",
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
                true,
                window
            );

            const menulist = prefEl.querySelector("menulist");
            const menupopup = menulist.children[0];

            const defaultMatch = pref.options.find(
                (item) => item.value === pref.defaultValue || item.value === pref.default
            );
            if (pref.placeholder !== false) {
                const label = pref.placeholder ?? "None";
                const value = defaultMatch ? "" : (pref.defaultValue ?? pref.default ?? "");

                menulist.setAttribute("label", label);
                menulist.setAttribute("value", value);

                domUtils.appendXUL(
                    menupopup,
                    `
                    <menuitem label="${label}" value="${value}"/>
                `,
                    null,
                    true,
                    window
                );
            }

            pref.options.forEach((option) => {
                domUtils.appendXUL(
                    menupopup,
                    `
                    <menuitem label="${option.label}" value="${option.value}"/>
                `,
                    null,
                    true,
                    window
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
                        .find(
                            (item) =>
                                item.getAttribute("value") === pref.defaultValue ||
                                item.getAttribute("value") === pref.default
                        )
                        ?.getAttribute("label") ??
                        pref.placeholder ??
                        "None"
                );
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
                ucAPI.prefs.set(pref.property, pref.defaultValue ?? pref.default ?? "");
                input.value = pref.defaultValue ?? pref.default;
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

    async installMod(repo, reload = true) {
        const currThemeData = await utils.getMods();

        const newThemeData = await ucAPI
            .fetch(`${utils.rawURL(repo)}theme.json`)
            .then(async (res) => await this.createThemeJSON(repo, currThemeData, typeof res !== "object" ? {} : res));
        if (typeof newThemeData.style === "object" && Object.keys(newThemeData.style).length === 0) {
            delete newThemeData.style;
        }
        if (newThemeData) {
            await this.syncModData(currThemeData, newThemeData);

            if (reload) {
                this.rebuildMods();
                this.loadMods();
            }

            if (newThemeData.hasOwnProperty("js")) {
                ucAPI.showToast({
                    title: "A mod utilizing JS has been installed.",
                    description: "For it to work properly, restart your browser.",
                });
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

    // Not optimized.
    async syncModData(currThemeData, newThemeData, currModData = false) {
        const themeFolder = utils.getModFolder(newThemeData.id);
        newThemeData["editable-files"] = [];

        const promises = [];

        let changeMadeHasJS = false;
        if (newThemeData.hasOwnProperty("js") || (currModData && currModData.hasOwnProperty("js"))) {
            if (newThemeData.hasOwnProperty("js")) {
                promises.push(
                    (async () => {
                        const jsReturn = await this.handleJS(newThemeData);
                        if (jsReturn) {
                            newThemeData["editable-files"] = newThemeData["editable-files"].concat(jsReturn);
                            changeMadeHasJS = true;
                        }
                    })()
                );
            }
        }
        if (newThemeData.hasOwnProperty("style")) {
            promises.push(
                (async () => {
                    const styleFiles = await this.parseStyles(themeFolder, newThemeData);
                    newThemeData["editable-files"] = newThemeData["editable-files"].concat(styleFiles);
                })()
            );
        }
        if (newThemeData.hasOwnProperty("preferences")) {
            promises.push(
                (async () => {
                    let newPrefData;
                    if (typeof newThemeData.preferences === "array") {
                        newPrefData = newThemeData.preferences;
                    } else {
                        newPrefData = await ucAPI
                            .fetch(newThemeData.preferences, true)
                            .catch((err) => console.error(err));

                        try {
                            JSON.parse(newPrefData);
                        } catch (err) {
                            console.warn(err);
                            newPrefData = await ucAPI
                                .fetch(
                                    "https://raw.githubusercontent.com/zen-browser/theme-store/main/" +
                                        `themes/${newThemeData.id}/preferences.json`,
                                    true
                                )
                                .catch((err) => console.error(err));
                        }
                    }
                    await IOUtils.writeUTF8(PathUtils.join(themeFolder, "preferences.json"), newPrefData);
                })()
            );
            newThemeData["editable-files"].push("preferences.json");
        }
        if (newThemeData.hasOwnProperty("readme")) {
            promises.push(
                (async () => {
                    const newREADMEData = await ucAPI.fetch(newThemeData.readme).catch((err) => console.error(err));
                    await IOUtils.writeUTF8(PathUtils.join(themeFolder, "readme.md"), newREADMEData);
                })()
            );
            newThemeData["editable-files"].push("readme.md");
        }
        if (newThemeData.hasOwnProperty("modules")) {
            const modules = Array.isArray(newThemeData.modules) ? newThemeData.modules : [newThemeData.modules];
            for (const modModule of modules) {
                if (!Object.values(currThemeData).some((item) => item.homepage === modModule)) {
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
    }

    // Not optimized.
    async toggleTheme(installedMods, id) {
        const themeData = installedMods[id];

        themeData.enabled = !themeData.enabled;
        let promise = IOUtils.writeJSON(utils.modsDataFile, installedMods);

        const jsPromises = [];
        if (themeData.js) {
            const jsFileLoc = PathUtils.join(utils.jsDir, themeData.id + "_");
            for (let file of themeData["editable-files"]?.find((item) => item.directory === "js")?.contents) {
                const fileToReplace = remove ? file : file.replace(/[a-z]+\.m?js$/, "db");

                if (themeData.enabled) {
                    file = file.replace(/[a-z]+\.m?js$/, "db");
                }

                jsPromises.push(
                    (async () => {
                        await IOUtils.writeUTF8(jsFileLoc + file, await IOUtils.readUTF8(jsFileLoc + fileToReplace));
                        await IOUtils.remove(PathUtils.join(jsFileLoc, fileToReplace), { ignoreAbsent: true });
                    })()
                );
            }
        }

        await promise;
        this.rebuildMods();

        if (themeData.js) {
            await Promise.all(jsPromises);
            ucAPI.showToast({
                title: `A mod utilizing JS has been ${themeData.enabled ? "disabled" : "enabled"}.`,
                description: "For usage of it to be fully restored, restart your browser.",
            });
        }

        return themeData;
    }

    // Not optimized.
    async parseStyles(themeFolder, newThemeData) {
        const processRootCSS = async (rootFileName, repoBaseUrl, themeFolder) => {
            const rootPath = `${rootFileName}.css`;
            const rootCss = await ucAPI.fetch(repoBaseUrl);

            const processCSS = async (currentPath, cssContent, originalURL, themeFolder) => {
                originalURL = originalURL.split("/");
                originalURL.pop();
                const repoBaseUrl = originalURL.join("/") + "/";
                const importRegex = /@import\s+(?:url\(['"]?([^'")]+)['"]?\)|['"]([^'"]+)['"])\s*;/g;
                const urlRegex = /(?<!@-moz-document(?:\s+url\([^)]*\),?\s*)*\s+)url\((['"])([^'"]+)\1\)/g;

                const matches = [];
                let match;
                while (
                    (match = importRegex.exec(cssContent.replace(/\/\*[\s\S]*?\*\//g, ""))) ||
                    (match = urlRegex.exec(cssContent))
                ) {
                    matches.push(match);
                }

                const imports = [...new Set(matches.map((match) => match[2] ?? match[1]))];

                const doesPathGoBehind = (paths) => {
                    let depth = 0;
                    for (const path of paths) {
                        const cleanPath = path.replace(/\/+$/, "");
                        if (!cleanPath) return 0;

                        for (const segment of cleanPath.split("/")) {
                            if (!segment) continue;

                            if (segment === "..") {
                                depth--;
                            } else if (segment !== ".") {
                                depth++;
                            }
                        }
                    }

                    return depth < 0;
                };

                let editableFiles = [];
                const promises = [];
                for (const importPath of imports) {
                    // Add to this array as needed (if things with weird paths are being added in.)
                    const regexArray = [
                        "data:",
                        "chrome://",
                        "resource://",
                        "https://",
                        "http://",
                        "moz-extension:",
                        "moz-icon:",
                    ];
                    if (
                        !doesPathGoBehind([currentPath, importPath]) &&
                        regexArray.every((regex) => !importPath.startsWith(regex))
                    ) {
                        const splicedPath = currentPath.split("/").slice(0, -1).join("/");
                        const completePath = splicedPath ? splicedPath + "/" : splicedPath;
                        const resolvedPath = completePath + importPath.replace(/(?<!\.)\.\//g, "");
                        const fullUrl = new URL(resolvedPath, repoBaseUrl).href;
                        promises.push(
                            (async () => {
                                const importedCss = await ucAPI.fetch(fullUrl);
                                if (importPath.endsWith(".css")) {
                                    const filesToAdd = await processCSS(
                                        resolvedPath,
                                        importedCss,
                                        repoBaseUrl,
                                        themeFolder
                                    );
                                    editableFiles = editableFiles.concat(filesToAdd);
                                } else {
                                    await IOUtils.writeUTF8(
                                        themeFolder +
                                            (ucAPI.utils.os.includes("win")
                                                ? "\\" + resolvedPath.replace(/\//g, "\\")
                                                : resolvedPath),
                                        importedCss
                                    );
                                    editableFiles.push(resolvedPath);
                                }
                            })()
                        );
                    }
                }

                // Add the current file to the editableFiles structure before writing.
                editableFiles.push(currentPath);

                // Match the appropriate path format for each OS.
                if (ucAPI.utils.os.includes("win")) {
                    currentPath = "\\" + currentPath.replace(/\//g, "\\");
                } else {
                    currentPath = "/" + currentPath;
                }

                await IOUtils.writeUTF8(themeFolder + currentPath, cssContent);
                await Promise.all(promises);
                return editableFiles;
            };

            return await processCSS(rootPath, rootCss, repoBaseUrl, themeFolder);
        };

        const promises = [];
        let editableFiles = [];
        if (newThemeData.style.hasOwnProperty("chrome") || newThemeData.style.hasOwnProperty("content")) {
            const files = ["userChrome", "userContent"];
            for (const file of files) {
                const formattedFile = file.toLowerCase().replace("user", "");
                if (newThemeData.style.hasOwnProperty(formattedFile)) {
                    promises.push(
                        (async () => {
                            const fileContents = await processRootCSS(
                                file,
                                newThemeData.style[formattedFile],
                                themeFolder
                            );
                            editableFiles = editableFiles.concat(fileContents);
                        })()
                    );
                }
            }
            editableFiles.push("chrome.css");
        } else {
            const chromeFiles = await processRootCSS("chrome", newThemeData.style, themeFolder);
            editableFiles = editableFiles.concat(chromeFiles);
        }
        await Promise.all(promises);
        return editableFiles;
    }

    // Not optimized.
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
        const shouldApply = (property) => {
            return (
                !theme.hasOwnProperty(property) ||
                ((property === "style" ||
                    property === "preferences" ||
                    property === "readme" ||
                    property === "image") &&
                    typeof theme[property] === "string" &&
                    theme[property].startsWith("https://raw.githubusercontent.com/zen-browser/theme-store"))
            );
        };

        const repoRoot = utils.rawURL(repo);
        const apiRequiringProperties = minimal
            ? ["updatedAt"]
            : ["homepage", "name", "description", "createdAt", "updatedAt"];
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
        const setProperty = async (property, value, ifValue = null, nestedProperty = false, escapeNull = false) => {
            promises.push(
                (async () => {
                    if (notNull(value) && (shouldApply(property) || escapeNull)) {
                        if (ifValue) {
                            ifValue = await ucAPI.fetch(value).then((res) => notNull(res));
                        }

                        if (ifValue ?? true) {
                            if (nestedProperty) {
                                theme[property][nestedProperty] = value;
                            } else {
                                theme[property] = value;
                            }
                        }
                    }
                })()
            );
            await promises[promises.length - 1];
        };

        if (!minimal) {
            promises.push(
                (async () => {
                    await setProperty("style", `${repoRoot}chrome.css`, true);

                    if (!theme.style) {
                        theme.style = {};

                        const directories = ["", "chrome/"];
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
                })()
            );
            setProperty("preferences", `${repoRoot}preferences.json`, true);
            setProperty("readme", `${repoRoot}README.md`, true);
            if (!theme.hasOwnProperty("readme")) setProperty("readme", `${repoRoot}readme.md`, true);

            let randomID;
            do {
                randomID = ucAPI.utils.generateUUID();
            } while (themes.hasOwnProperty(randomID));
            setProperty("id", randomID);

            promises.push(
                (async () => {
                    if (needAPI) {
                        githubAPI = await githubAPI;
                        setProperty("name", githubAPI.name);
                    }
                    const releasesData = await ucAPI.fetch(`${translateToAPI(repo)}/releases/latest`);
                    setProperty(
                        "version",
                        releasesData.hasOwnProperty("tag_name")
                            ? releasesData.tag_name.toLowerCase().replace("v", "")
                            : "1.0.0"
                    );
                })()
            );
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
        return minimal ? { theme, githubAPI } : theme;
    }
}

export default new Manager();
