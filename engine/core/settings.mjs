console.log("[Sine]: Executing settings process...");

import domUtils from "chrome://userscripts/content/engine/utils/dom.mjs";

import("../services/cmdPalette.js").catch((err) => {
    console.error(new Error(`@ cmdPalette.js:${err.lineNumber}`, { cause: err }));
});

const ucAPI = ChromeUtils.importESModule("chrome://userscripts/content/engine/utils/uc_api.sys.mjs").default;
const utils = ChromeUtils.importESModule("chrome://userscripts/content/engine/core/utils.mjs").default;
const manager = ChromeUtils.importESModule("chrome://userscripts/content/engine/core/manager.mjs").default;

if (ucAPI.utils.fork === "zen") {
    document.querySelector("#category-zen-marketplace").remove();
    domUtils.waitForElm("#ZenMarketplaceCategory").then((el) => el.remove());
    domUtils.waitForElm("#zenMarketplaceGroup").then((el) => el.remove());
}

// Inject settings styles.
domUtils.appendXUL(
    document.head,
    '<link rel="stylesheet" href="chrome://userscripts/content/engine/styles/settings.css"/>'
);

let sineIsActive = false;

// Add sine tab to the selection sidebar.
const sineTab = domUtils.appendXUL(
    document.querySelector("#categories"),
    `
        <richlistitem id="category-sine-mods" class="category"
            value="paneSineMods" tooltiptext="${utils.brand} Mods" align="center">
            <image class="category-icon"/>
            <label class="category-name" flex="1">
                ${utils.brand} Mods
            </label>
        </richlistitem>
    `,
    (document.querySelector("#category-general") || document.querySelector("#generalCategory")).nextElementSibling,
    true
);

// Add Sine to the initaliztion object.
gCategoryInits.set("paneSineMods", {
    _initted: true,
    init: () => {},
});

if (location.hash === "#zenMarketplace" || location.hash === "#sineMods") {
    sineIsActive = true;
    document.querySelector("#categories").selectItem(sineTab);
    document.querySelectorAll('[data-category="paneGeneral"]').forEach((el) => el.setAttribute("hidden", "true"));
}

const sineGroupData = `data-category="paneSineMods" ${sineIsActive ? "" : 'hidden="true"'}`;
const prefPane = document.querySelector("#mainPrefPane") || document.querySelector("#paneDeck");
const generalGroup = document.querySelector('[data-category="paneGeneral"]');
domUtils.appendXUL(
    prefPane,
    `
    <hbox id="SineModsCategory" class="subcategory" ${sineGroupData}>
        <h1>${utils.brand} Mods</h1>
    </hbox>
`,
    generalGroup
);

// Create group.
const newGroup = domUtils.appendXUL(
    prefPane,
    `
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
            <button class="sineMarketplaceOpenButton sineItemConfigureButton" title="Open settings"></button>
            <button class="sineMarketplaceOpenButton" title="Expand marketplace"></button>
        </vbox>
    </groupbox>
`,
    generalGroup
);

// Initialize marketplace.
const marketplace = manager.marketplace;

// Create search input event.
let searchTimeout = null;
document.querySelector("#sineInstallationHeader .sineCKSOption-input").addEventListener("input", (e) => {
    clearTimeout(searchTimeout); // Clear any pending search
    searchTimeout = setTimeout(() => {
        marketplace.page = 0; // Reset to first page on search
        marketplace.filteredItems = Object.fromEntries(
            Object.entries(marketplace.items).filter(([_key, item]) =>
                item.name.toLowerCase().includes(e.target.value.toLowerCase())
            )
        );
        marketplace.loadPage(window, manager);
    }, 300); // 300ms delay
});
// Create refresh button event
const newRefresh = document.querySelector("#sineMarketplaceRefreshButton");
newRefresh.addEventListener("click", async () => {
    newRefresh.disabled = true;
    await marketplace.init(window, manager);
    newRefresh.disabled = false;
});
// Create close button event
document.querySelector("#sineInstallationHeader button:last-child").addEventListener("click", () => {
    newGroup.hidePopover();
    newGroup.removeAttribute("popover");
});
marketplace.init(window, manager);
// Custom mods event
const newCustomButton = document.querySelector("#sineInstallationCustom .sineMarketplaceItemButton");
const newCustomInput = document.querySelector("#sineInstallationCustom input");
const installCustom = async () => {
    newCustomButton.disabled = true;
    await manager.installMod(newCustomInput.value);
    newCustomInput.value = "";
    await marketplace.loadPage(null, manager);
    newCustomButton.disabled = false;
};
newCustomInput.addEventListener("keyup", (e) => {
    if (e.key === "Enter") {
        installCustom();
    }
});
newCustomButton.addEventListener("click", installCustom);
// Settings dialog
const newSettingsDialog = domUtils.appendXUL(
    document.querySelector("#sineInstallationCustom"),
    `
    <dialog class="sineItemPreferenceDialog">
        <div class="sineItemPreferenceDialogTopBar"> 
            <h3 class="sineMarketplaceItemTitle">Settings</h3>
            <button>Close</button>
        </div>
        <div class="sineItemPreferenceDialogContent"></div>
    </dialog>
`
);

// Settings close button event
newSettingsDialog.querySelector("button").addEventListener("click", () => newSettingsDialog.close());
// Settings content
let sineSettingsLoaded = false;
const loadPrefs = async () => {
    const settingPrefs = await IOUtils.readJSON(PathUtils.join(utils.jsDir, "engine", "core", "settings.json"));
    for (const pref of settingPrefs) {
        let prefEl = manager.parsePref(pref, window);

        if (pref.type === "string") {
            prefEl.addEventListener("change", () => {
                marketplace.init(null, manager);
            });
        }

        if (pref.property === "sine.enable-dev") {
            prefEl.addEventListener("click", () => {
                const commandPalette = windowRoot.ownerGlobal.document.querySelector(".sineCommandPalette");
                if (commandPalette) {
                    commandPalette.remove();
                }

                import("../services/cmdPalette.js").catch((err) => {
                    console.error(new Error(`@ cmdPalette.js:${err.lineNumber}`, { cause: err }));
                });
            });
        }

        const newSettingsContent = newSettingsDialog.querySelector(".sineItemPreferenceDialogContent");
        if (prefEl) {
            newSettingsContent.appendChild(prefEl);
        } else if (pref.type === "button") {
            const getVersionLabel = () =>
                `Current: <b>${Services.prefs.getStringPref("sine.version", "unknown")}</b> | ` +
                `Latest: <b>${Services.prefs.getStringPref("sine.latest-version", "unknown")}</b>`;

            const buttonTrigger = async (callback, btn) => {
                btn.disabled = true;
                await callback();
                btn.disabled = false;

                newSettingsContent.querySelector("#version-indicator").innerHTML = getVersionLabel();

                if (btn === prefEl) {
                    btn.style.display = "none";
                }
            };

            if (pref.id === "version-indicator") {
                prefEl = domUtils.appendXUL(
                    newSettingsContent,
                    `
                    <hbox id="version-container">
                        <p id="version-indicator">${getVersionLabel()}</p>
                        <button id="sineMarketplaceRefreshButton"></button>
                    </hbox>
                `
                );

                prefEl.children[1].addEventListener("click", () => {
                    buttonTrigger(async () => {
                        await updates.checkForUpdates();
                    }, prefEl.children[1]);
                });
            } else {
                prefEl = domUtils.appendXUL(
                    newSettingsContent,
                    `
                    <button class="settingsBtn" id="${pref.id}">${pref.label}</button>
                `
                );

                let action = () => {};
                if (pref.id === "restart") {
                    action = ucAPI.utils.restart;
                } else if (pref.id === "install-update") {
                    action = async () => await updates.updateEngine(await updates.fetch());
                }

                prefEl.addEventListener("click", () => buttonTrigger(action, prefEl));
            }
        }

        if (pref.conditions) {
            manager.setupPrefObserver(pref, window);
        }
    }
};
// Settings button
document.querySelector(".sineItemConfigureButton").addEventListener("click", () => {
    newSettingsDialog.showModal();
    if (!sineSettingsLoaded) {
        loadPrefs();
        sineSettingsLoaded = true;
    }
});
// Expand button event
document
    .querySelector("#sineInstallationCustom .sineMarketplaceOpenButton:not(.sineItemConfigureButton)")
    .addEventListener("click", () => {
        newGroup.setAttribute("popover", "manual");
        newGroup.showPopover();
    });

let modsDisabled = Services.prefs.getBoolPref("sine.mods.disable-all", false);
const installedGroup = domUtils.appendXUL(
    prefPane,
    `
        <groupbox id="sineInstalledGroup" class="highlighting-group subcategory"
          ${sineIsActive ? "" : 'hidden=""'} data-category="paneSineMods">
            <hbox id="sineInstalledHeader">
                <h2>Installed Mods</h2>
                <moz-toggle class="sinePreferenceToggle" ${modsDisabled ? "" : 'pressed="true"'}
                  aria-label="${modsDisabled ? "Enable" : "Disable"} all mods"></moz-toggle>
            </hbox>
            <description class="description-deemphasized">
                ${utils.brand} Mods you have installed are listed here.
            </description>
            <hbox class="indent">
                <hbox class="updates-container">
                    <button class="auto-update-toggle"
                        title="${utils.autoUpdate ? "Disable" : "Enable"} auto-updating">
                        <span>Auto-Update</span>
                    </button>
                    <button class="manual-update">Check for Updates</button>
                    <div class="update-indicator">
                        ${utils.autoUpdate ? `<p class="checked">Up-to-date</p>` : ""}
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
    groupToggle.title = `${Services.prefs.getBoolPref("sine.mods.disable-all", false) ? "Enable" : "Disable"} all mods`;
    manager.rebuildMods();
    manager.loadMods(window);
});
const autoUpdateButton = document.querySelector(".auto-update-toggle");
autoUpdateButton.addEventListener("click", () => {
    utils.autoUpdate = !utils.autoUpdate;
    if (utils.autoUpdate) {
        autoUpdateButton.setAttribute("enabled", true);
        autoUpdateButton.title = "Disable auto-updating";
    } else {
        autoUpdateButton.removeAttribute("enabled");
        autoUpdateButton.title = "Enable auto-updating";
    }
});
if (utils.autoUpdate) {
    autoUpdateButton.setAttribute("enabled", true);
}
document.querySelector(".manual-update").addEventListener("click", async () => {
    const updateIndicator = installedGroup.querySelector(".update-indicator");
    updateIndicator.innerHTML = `<p>...</p>`;
    const isUpdated = await manager.updateMods("manual");
    updateIndicator.innerHTML = `<p class="checked">${isUpdated ? "Mods updated" : "Up-to-date"}</p>`;
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
            await manager.installMod(mod.homepage, false);
        }

        await IOUtils.writeJSON(utils.modsDataFile, installedMods);

        marketplace.loadPage(null, manager);
        manager.loadMods(window);
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

manager.loadMods(window);
manager.updateMods("auto");
