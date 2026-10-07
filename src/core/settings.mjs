/**
 * @license This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If
 *   a copy of the MPL was not distributed with this file, You can obtain one at
 *   http://mozilla.org/MPL/2.0/.
 * @file Injects Sine into a settings page instance.
 */

import * as domUtils from "../utils/dom.mjs";
import cmdPalette from "../services/cmdPalette.mjs";
import updates from "../services/updates.mjs";

const ucAPI = ChromeUtils.importESModule(
  "chrome://userscripts/content/utils/uc_api.sys.mjs"
).default;
const utils = ChromeUtils.importESModule("chrome://userscripts/content/core/utils.sys.mjs").default;

const manager = window.manager;
delete window.manager;

if (ucAPI.utils.fork === "zen") {
  document.querySelector("#category-zen-marketplace")?.remove();
  domUtils
    .waitForElm("#ZenMarketplaceCategory")
    .then((el) => el.remove())
    .catch((err) =>
      console.error(`[Sine:Settings]: Failed to remove Zen marketplace category.\n${err}`)
    );
  domUtils
    .waitForElm("#zenMarketplaceGroup")
    .then((el) => el.remove())
    .catch((err) =>
      console.error(`[Sine:Settings]: Failed to remove Zen marketplace group.\n${err}`)
    );
}

// Inject settings styles and locales
domUtils.appendXUL(
  document.head,
  '<link rel="stylesheet" href="chrome://userscripts/content/styles/settings.css"/>'
);

domUtils.injectLocale("sine-preferences");

let sineIsActive = false;

// Add sine tab to the selection sidebar if not already injected
const categories = document.querySelector("#categories");
const generalCategory = categories?.querySelector("#category-general");
const tabImage = "chrome://userscripts/content/assets/images/saturn.svg";
const brandTitle = `${utils.brand.charAt(0).toUpperCase() + utils.brand.slice(1)} Mods`;
let sineTab = document.querySelector("#category-sine-mods");
if (!sineTab && categories) {
  const isPageNav =
    categories.localName === "moz-page-nav" ||
    categories.tagName.endsWith("moz-page-nav") ||
    generalCategory?.localName === "moz-page-nav-button" ||
    generalCategory?.tagName.endsWith("moz-page-nav-button");

  if (isPageNav) {
    sineTab = document.createElementNS("http://www.w3.org/1999/xhtml", "moz-page-nav-button");
    sineTab.id = "category-sine-mods";
    sineTab.setAttribute("view", "paneSineMods");
    sineTab.setAttribute("iconsrc", tabImage);
    sineTab.iconSrc = tabImage;
    sineTab.setAttribute("role", "none");
    sineTab.textContent = brandTitle;

    if (generalCategory?.nextElementSibling) {
      generalCategory.after(sineTab);
    } else {
      categories.append(sineTab);
    }
  } else {
    sineTab = domUtils.appendXUL(
      categories,
      `
        <richlistitem id="category-sine-mods" class="category" value="paneSineMods" helpTopic="prefs-main"
          align="center">
          <image class="category-icon"/>
          <label class="category-name" flex="1">${brandTitle}</label>
        </richlistitem>
      `,
      generalCategory?.nextElementSibling,
      true
    );
  }
} else if (sineTab && !sineTab.textContent?.trim()) {
  sineTab.textContent = brandTitle;
}

// Add Sine to the module initialization registry
if (typeof window.register_module === "function") {
  window.register_module("paneSineMods", {
    // eslint-disable-next-line no-empty-function
    init: () => {},
  });
} else {
  if (!window.gCategoryInits) window.gCategoryInits = new Map();
  if (!window.gCategoryModules) window.gCategoryModules = new Map();
  window.gCategoryInits.set("paneSineMods", {
    _initted: true,
    // eslint-disable-next-line no-empty-function
    init: () => {},
  });
  window.gCategoryModules.set("paneSineMods", {});
}

const isSineSelected =
  location.hash === "#zenMarketplace" ||
  location.hash === "#sineMods" ||
  window.sineInitialHash === "#zenMarketplace" ||
  window.sineInitialHash === "#sineMods" ||
  categories?.currentView === "paneSineMods";

if (isSineSelected) {
  sineIsActive = true;
  if (typeof window.gotoPref === "function") {
    window.gotoPref("paneSineMods");
  } else if (categories) {
    if ("currentView" in categories) {
      categories.currentView = "paneSineMods";
    } else if (typeof categories.selectItem === "function" && sineTab) {
      categories.selectItem(sineTab);
    }
  }
}

const sineGroupData = `data-category="paneSineMods" ${sineIsActive ? "" : 'hidden="true"'}`;
const prefPane = document.querySelector("#mainPrefPane") || document.querySelector("#paneDeck");
const generalGroup = document.querySelector('[data-category="paneGeneral"]');
domUtils.appendXUL(
  prefPane,
  `
    <hbox id="SineModsCategory" class="subcategory" ${sineGroupData}>
        <html:h1 data-l10n-id="pane-${utils.brand}-mods-title"/>
    </hbox>
`,
  generalGroup,
  true
);

// Create group.
domUtils.appendXUL(
  prefPane,
  `
        <groupbox id="sineInstallationGroup" class="highlighting-group subcategory" ${sineGroupData}>
            <hbox id="sineInstallationHeader">
                <hbox id="sineMarketplaceHeader">
                    <html:h2 data-l10n-id="sine-marketplace-header"/>
                </hbox>
                <html:input data-l10n-id="sine-mods-search" data-l10n-attrs="placeholder" class="sineCKSOption-input"/>
                <button class="sineMarketplaceOpenButton"
                    id="sineMarketplaceRefreshButton" data-l10n-id="sine-refresh-marketplace"
                    data-l10n-attrs="title"/>
            </hbox>
            <description class="description-deemphasized" data-l10n-id="sine-marketplace-description"/>
            <vbox id="sineInstallationList"></vbox>
            <description class="description-deemphasized" data-l10n-id="sine-install-description"/>
            <hbox id="sineInstallationCustom">
                <html:input class="sineCKSOption-input" data-l10n-id="sine-install-input"
                    data-l10n-attrs="placeholder"/>
                <button class="sineMarketplaceItemButton" data-l10n-id="sine-mod-install-label"
                    data-l10n-attrs="label"/>
                <spacer flex="1"/>
                <button class="sineMarketplaceOpenButton sineItemConfigureButton" data-l10n-id="sine-settings-button"
                    data-l10n-attrs="title"/>
                <html:a href="https://sineorg.github.io/store/" target="_blank" id="sineWebsiteLink">
                    <button class="sineMarketplaceOpenButton"
                        data-l10n-id="sine-mods-marketplace-button" data-l10n-attrs="title"/>
                </html:a>
            </hbox>
        </groupbox>
    `,
  generalGroup,
  true
);
const newGroup = document.querySelector("#sineInstallationGroup");

// Initialize marketplace.
const marketplace = manager.marketplace;

newGroup.querySelector("#sineWebsiteLink *").addEventListener("click", () => {
  newGroup.querySelector("#sineWebsiteLink").click();
});

// Create search input event.
let searchTimeout = null;
document
  .querySelector("#sineInstallationHeader .sineCKSOption-input")
  .addEventListener("input", (e) => {
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
marketplace.init(window, manager);
// Custom mods event
const newCustomButton = document.querySelector(
  "#sineInstallationCustom .sineMarketplaceItemButton"
);
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
                <h3 class="sineMarketplaceItemTitle" data-l10n-id="sine-settings-header"></h3>
                <button data-l10n-id="sine-dialog-close"></button>
            </div>
            <div class="sineItemPreferenceDialogContent"></div>
        </dialog>
    `
);

// Settings close button event
newSettingsDialog
  .querySelector("button")
  .addEventListener("click", () => newSettingsDialog.close());
// Settings content
let sineSettingsLoaded = false;
const loadPrefs = async () => {
  await updates.init();
  const settingPrefs = await IOUtils.readJSON(PathUtils.join(utils.jsDir, "core", "settings.json"));

  const promises = [];
  for (const pref of settingPrefs) {
    promises.push(
      (async () => {
        if (pref.l10n) {
          pref.label = await document.l10n.formatValue(pref.l10n);
        }

        let prefEl = manager.preferences.parsePref(pref, manager, window);

        if (pref.type === "string") {
          prefEl.addEventListener("change", () => {
            marketplace.init(null, manager);
          });
        }

        if (pref.property === "sine.enable-dev") {
          prefEl.addEventListener("click", () => {
            const commandPalette = windowRoot.window.document.querySelector(".sineCommandPalette");
            if (commandPalette) {
              commandPalette.remove();
            }

            cmdPalette.register();
          });
        }

        const newSettingsContent = newSettingsDialog.querySelector(
          ".sineItemPreferenceDialogContent"
        );
        if (prefEl) {
          newSettingsContent.append(prefEl);
        } else if (pref.type === "button") {
          const getVersionLabel = () =>
            `Current:&#160;<b>${utils.escapeHTML(updates.current)}</b>&#160;|&#160;` +
            `Latest:&#160;<b>${utils.escapeHTML(updates.latest)}</b>`;

          const buttonTrigger = async (callback, btn) => {
            btn.disabled = true;
            await callback();
            btn.disabled = false;

            // getVersionLabel does sanitize input, but no-restricted-syntax doesn't recognize that
            // eslint-disable-next-line eslint-js/no-restricted-syntax
            newSettingsContent.querySelector("#version-indicator").innerHTML = getVersionLabel();

            if (btn === prefEl) {
              btn.style.display = "none";
            }
          };

          if (pref.id === "version-indicator") {
            domUtils.appendXUL(
              newSettingsContent,
              `
                        <hbox id="version-container">
                            <p id="version-indicator">${getVersionLabel()}</p>
                            <button id="sineMarketplaceRefreshButton"/>
                        </hbox>
                    `,
              null,
              true
            );
            prefEl = newSettingsContent.querySelector("#version-container");

            prefEl.children[1].addEventListener("click", () => {
              buttonTrigger(async () => {
                await updates.checkForUpdates();
                for (const [idx, el] of document
                  .querySelectorAll("#version-indicator b")
                  .entries()) {
                  if (idx === 0) {
                    el.textContent = updates.current;
                  } else {
                    el.textContent = updates.latest;
                  }
                }

                if (updates.current !== updates.latest) {
                  newSettingsContent.querySelector("#install-update").style.display = "flex";
                }
              }, prefEl.children[1]);
            });
          } else {
            prefEl = domUtils.appendXUL(
              newSettingsContent,
              `
                <button class="settingsBtn" id="${pref.id}">${pref.label}</button>
              `
            );

            // eslint-disable-next-line consistent-function-scoping
            let action = () => console.error("[Sine:Settings]: Invalid button action.");
            if (pref.id === "restart") {
              action = ucAPI.utils.restart;
            } else if (pref.id === "install-update") {
              prefEl.style.display = "none";
              action = async () => {
                await updates.checkForUpdates(true);
                prefEl.style.display = "flex";
              };
            }

            prefEl.addEventListener("click", () => buttonTrigger(action, prefEl));
          }
        }

        if (pref.conditions) {
          manager.preferences.setupPrefObserver(pref, window);
        }
      })()
    );
  }
  await Promise.all(promises);
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
domUtils.appendXUL(
  prefPane,
  `
        <groupbox id="sineInstalledGroup" class="highlighting-group subcategory"
          ${sineIsActive ? "" : 'hidden=""'} data-category="paneSineMods">
            <hbox id="sineInstalledHeader">
                <html:h2 data-l10n-id="sine-mods-installed-header"/>
                <html:moz-toggle class="sinePreferenceToggle" ${modsDisabled ? "" : 'pressed="true"'}
                  data-l10n-id="${modsDisabled ? "sine-mods-disable-all-disabled" : "sine-mods-disable-all-enabled"}"
                  data-l10n-attrs="title"/>
            </hbox>
            <description class="description-deemphasized" data-l10n-id="${utils.brand}-mods-list-description"/>
            <hbox class="indent">
                <hbox class="updates-container">
                    <button class="auto-update-toggle" data-l10n-attrs="title"
                        data-l10n-id="sine-mods-auto-update-${utils.autoUpdate ? "enabled" : "disabled"}">
                        <span data-l10n-id="sine-mods-auto-update-title"/>
                    </button>
                    <button class="manual-update" data-l10n-id="sine-mods-manual-update-title"/>
                    <div class="update-indicator">
                        ${utils.autoUpdate ? `<p class="checked">...</p>` : ""}
                    </div>
                </hbox>
                <hbox class="transfer-container">
                    <button id="sineModImport" data-l10n-id="sine-mods-import-button" data-l10n-attrs="label"/>
                    <button id="sineModExport" data-l10n-id="sine-mods-export-button" data-l10n-attrs="label"/>
                </hbox>
            </hbox>
            <vbox id="sineModsList"></vbox>
        </groupbox>
    `,
  generalGroup,
  true
);
const installedGroup = document.querySelector("#sineInstalledGroup");
// Logic to disable mod.
const groupToggle = document.querySelector(".sinePreferenceToggle");
groupToggle.addEventListener("toggle", () => {
  modsDisabled = !Services.prefs.getBoolPref("sine.mods.disable-all", false);
  Services.prefs.setBoolPref("sine.mods.disable-all", modsDisabled);
  groupToggle.dataset.l10nId = modsDisabled
    ? "sine-mods-disable-all-disabled"
    : "sine-mods-disable-all-enabled";
  manager.rebuildMods();
  manager.loadMods();
});
const autoUpdateButton = document.querySelector(".auto-update-toggle");
autoUpdateButton.addEventListener("click", () => {
  utils.autoUpdate = !utils.autoUpdate;
  if (utils.autoUpdate) {
    autoUpdateButton.setAttribute("enabled", true);
  } else {
    autoUpdateButton.removeAttribute("enabled");
  }
  autoUpdateButton.dataset.l10nId = `sine-mods-auto-update-${utils.autoUpdate ? "enabled" : "disabled"}`;
});
if (utils.autoUpdate) {
  autoUpdateButton.setAttribute("enabled", true);
}
const checkForUpdates = async (source) => {
  const updateIndicator = installedGroup.querySelector(".update-indicator");
  updateIndicator.innerHTML = "";
  domUtils.appendXUL(
    updateIndicator,
    `
        <p>...</p>
    `,
    null,
    true
  );
  const isUpdated = await manager.updateMods(source);
  updateIndicator.innerHTML = "";
  domUtils.appendXUL(
    updateIndicator,
    `
        <p class="checked" data-l10n-id="${isUpdated ? "sine-mods-updated" : "sine-mods-update-checked"}"/>
    `,
    null,
    true
  );
};
document.querySelector(".manual-update").addEventListener("click", () => checkForUpdates("manual"));
document.querySelector("#sineModImport").addEventListener("click", async () => {
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

    const promises = [];
    for (const mod of mods) {
      installedMods[mod.id] = mod;
      promises.push(manager.installMod(mod.homepage, null, false));
    }
    await Promise.all(promises);

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
document.querySelector("#sineModExport").addEventListener("click", async () => {
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

    document.body.append(temporalAnchor);
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
if (sineIsActive && typeof window.search === "function") {
  window.search("paneSineMods", "data-category");
}
if (utils.autoUpdate) {
  checkForUpdates("auto");
}
