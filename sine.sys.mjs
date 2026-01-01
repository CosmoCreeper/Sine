/*
  Welcome to Sine!
  Looking to contribute? Check out our contributing guide.
  https://github.com/CosmoCreeper/Sine/tree/main/CONTRIBUTING.md
*/

// Engine imports.
import utils from "./engine/core/utils.mjs";
import manager from "./engine/core/manager.mjs";
import ucAPI from "./engine/utils/uc_api.sys.mjs";

console.log(`${utils.brand.charAt(0).toUpperCase() + utils.brand.slice(1)} is active!`);

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
    registerLocales() {
        const l10nReg = L10nRegistry.getInstance();

        const src = new L10nFileSource(
          "sine-locales",
          "app",
          Services.locale.appLocalesAsLangTags,
          "chrome://locales/content/{locale}/",
          { addResourceOptions: { allowOverrides: false } }
        );

        l10nReg.registerSources([src]);
    },

    async init() {
        this.registerLocales();

        manager.initWinListener();

        // Initialize Sine directory and file structure.
        if (!(await IOUtils.exists(utils.modsDataFile))) {
            await IOUtils.writeJSON(utils.modsDataFile, {});
        }

        manager.rebuildMods();

        // Check for mod updates.
        manager.updateMods("auto");

        // Inject https://zen-browser.app/mods/ API.
        import("./engine/injectAPI.js");
    },
};

Sine.init();
