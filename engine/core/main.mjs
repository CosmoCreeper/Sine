console.log("[Sine]: Executing main process...");

import domUtils from "../utils/dom.mjs";
import updates from "../services/updates.js";

import injectCmdPalette from "../services/cmdPalette.js";
injectCmdPalette();

const ucAPI = ChromeUtils.importESModule("chrome://userscripts/content/engine/utils/uc_api.sys.mjs").default;
const utils = ChromeUtils.importESModule("chrome://userscripts/content/engine/core/utils.mjs").default;
const manager = ChromeUtils.importESModule("chrome://userscripts/content/engine/core/manager.mjs").default;

// Delete and transfer old zen files to the new Sine structure (if using Zen).
if (ucAPI.utils.fork === "zen") {
    try {
        const zenMods = await gZenMods.getMods();
        if (Object.keys(zenMods).length > 0) {
            const sineMods = await utils.getMods();
            await IOUtils.writeJSON(modsJSON, { ...sineMods, ...zenMods });

            const zenModsPath = gZenMods.modsRootPath;
            for (const id of Object.keys(zenMods)) {
                if (!IOUtils.exists(PathUtils.join(utils.modsDir, id))) {
                    await IOUtils.copy(PathUtils.join(zenModsPath, id), utils.modsDir, { recursive: true });
                }
            }

            // Delete old Zen-related mod data.
            await IOUtils.remove(gZenMods.modsDataFile);
            await IOUtils.remove(zenModsPath, { recursive: true });

            // Refresh the mod data to hopefully deregister the zen-themes.css file.
            gZenMods.triggerModsUpdate();

            // Remove zen-themes.css after all other data has been deregistered and/or removed.
            IOUtils.remove(PathUtils.join(ucAPI.utils.chromeDir, "zen-themes.css"));
        }
    } catch (err) {
        console.warn("Error copying Zen mods: " + err);
        ucAPI.showToast({
            title: "Error copying Zen mods.",
            description: "Check Ctrl+Shift+J for more info.",
            preset: 0,
        });
    }
    delete window.gZenMods;
    ChromeUtils.unregisterWindowActor("ZenModsMarketplace");
}

// Initialize toast manager.
domUtils.appendXUL(document.body, '<div class="sineToastManager"></div>');

window.SineAPI = {
    utils,
    manager,
};

domUtils.appendXUL(
    document.head,
    '<link rel="stylesheet" href="chrome://userscripts/content/engine/styles/main.css"/>'
);

// Check for Sine updates.
updates.checkForUpdates();
