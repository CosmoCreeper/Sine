// => engine/utils/utils.js
// ===========================================================
// This module provides data so that Sine can easily know
// where to look and perform actions.
// ===========================================================

const utils = {
    get jsDir() {
        return PathUtils.join(ucAPI.sysChromeDir, "JS");
    },

    get modsDir() {
        return PathUtils.join(ucAPI.sysChromeDir, "sine-mods");
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

    getModFolder(id) {
        return PathUtils.join(this.modsDir, id);
    },

    async getMods() {
        return JSON.parse(await IOUtils.readUTF8(this.modsDataFile));
    },

    async getModPreferences(mod) {
        try {
            return JSON.parse(await IOUtils.readUTF8(
                PathUtils.join(this.getModFolder(mod.id), "preferences.json")
            ));
        } catch (err) {
            ucAPI.showToast([
                "Failed to read mod preferences.",
                `Please remove and reinstall ${mod.name}.`
            ]);
            console.warn(`[Sine]: Failed to read preferences for mod ${mod.id}.`, err);
            return {};
        }
    },
};

export default utils;