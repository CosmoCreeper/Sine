// it will also be able to manage its own
// "new chrome document" listener in order to
// apply styles, execute scripts, create toast managers,
// and add Sine to the settings page, but everything will
// be much cleaner with this back-end managing it all.

// communication between the window scripts and this
// privileged script will either be done via a global
// object (less secure), or via passing it to the script
// (more secure, but potentially less possible).

// Engine imports.
import utils from "./engine/core/utils.mjs";
import manager from "./engine/core/manager.mjs";
import ucAPI from "./engine/utils/uc_api.sys.mjs";

console.log(`${utils.brand} is active!`);

if (!Services.prefs.getBoolPref("browser.startup.cache", true)) {
    Services.appinfo.invalidateCachesOnRestart();
}

Services.prefs.setBoolPref("sine.engine.pending-restart", false);

if (!Services.prefs.getPrefType("sine.is-cosine") > 0) {
    ucAPI.prefs.set("sine.is-cosine", true);
}

// Initialize fork pref.
Services.prefs.clearUserPref("sine.fork-id");
Services.prefs.setStringPref("sine.fork-id", ucAPI.utils.fork);

const Sine = {
    async init() {
        manager.initWinListener();

        // Initialize Sine directory and file structure.
        if (!(await IOUtils.exists(utils.modsDataFile))) {
            await IOUtils.writeJSON(utils.modsDataFile, {});
        }

        manager.rebuildMods();

        // Check for mod updates.
        /* this.updateMods("auto"); */

        // Inject https://zen-browser.app/mods/ API.
        import("./engine/injectAPI.js");
    },
};

Sine.init();
