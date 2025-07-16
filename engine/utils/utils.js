// => engine/utils/utils.js
// ===========================================================
// This module provides data so that Sine can easily know
// where to look and perform actions.
// ===========================================================

import ucAPI from "chrome://userscripts/content/engine/utils/uc_api.js";

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
        return JSON.parse(await IOUtils.readUTF8(
            PathUtils.join(this.getModFolder(mod.id), "preferences.json")
        ));
    },
};

export default utils;