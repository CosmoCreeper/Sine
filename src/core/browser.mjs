/**
 * @file Initializes a browser window with necessary Sine features.
 * @license
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as domUtils from "../utils/dom.mjs";
import updates from "../services/updates.mjs";
import cmdPalette from "../services/cmdPalette.mjs";

await domUtils.waitForElm("body");

domUtils.injectLocale("sine-toasts");

cmdPalette.register();

const ucAPI = ChromeUtils.importESModule(
  "chrome://userscripts/content/utils/uc_api.sys.mjs"
).default;
const utils = ChromeUtils.importESModule("chrome://userscripts/content/core/utils.sys.mjs").default;

const manager = window.manager;
delete window.manager;

// Delete and transfer old zen files to the new Sine structure (if using Zen).
if (ucAPI.utils.fork === "zen") {
  try {
    // Required to fix crashes in Zen.
    await IOUtils.remove(PathUtils.join(ucAPI.utils.chromeDir, "zen-themes.css"));

    const zenMods = await gZenMods.getMods();
    if (Object.keys(zenMods).length !== 0) {
      const sineMods = await utils.getMods();
      for (const mod of Object.values(zenMods)) {
        mod.style = { chrome: "chrome.css" };
        if (mod.preferences) {
          mod.preferences = "preferences.json";
        }
      }
      await IOUtils.writeJSON(utils.modsDataFile, Object.assign({}, sineMods, zenMods));

      const zenModsPath = gZenMods.modsRootPath;
      const promises = Object.keys(zenMods).map(async (id) => {
        const destPath = PathUtils.join(utils.modsDir, id);

        if (!(await IOUtils.exists(destPath))) {
          const srcPath = PathUtils.join(zenModsPath, id);
          await IOUtils.copy(srcPath, utils.modsDir, { recursive: true });
        }
      });
      await Promise.all(promises);

      // Delete old Zen-related mod data.
      await IOUtils.remove(gZenMods.modsDataFile);
      await IOUtils.remove(zenModsPath, { recursive: true });
    }

    // Refresh the mod data.
    gZenMods.triggerModsUpdate();
  } catch (err) {
    console.warn(`Error copying Zen mods: ${err}`);
    ucAPI.showToast({
      id: "0",
      preset: 0,
    });
  }
  delete window.gZenMods;
  ChromeUtils.unregisterWindowActor("ZenModsMarketplace");
}

// Initialize toast manager.
domUtils.appendXUL(document.body, '<vbox class="sineToastManager"></vbox>', null, true);

window.SineAPI = {
  utils,
  manager,
};

domUtils.appendXUL(
  document.head,
  '<link rel="stylesheet" href="chrome://userscripts/content/styles/main.css"/>'
);

// Check for Sine updates.
updates.checkForUpdates();
