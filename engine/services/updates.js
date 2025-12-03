// => engine/services/updates.js
// ===========================================================
// This module allows Sine to update itself, removing the
// need for the user to reinstall Sine.
// ===========================================================

import utils from "../core/utils.mjs";
import ucAPI from "../utils/uc_api.sys.mjs";

export default {
    async updateEngine(engine) {
        Services.appinfo.invalidateCachesOnRestart();

        // Delete the previous engine material.
        IOUtils.remove(PathUtils.join(utils.jsDir, "engine"), { recursive: true });
        IOUtils.remove(PathUtils.join(utils.jsDir, "sine.sys.mjs"));

        // Define the JS directory.
        const scriptDir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
        scriptDir.initWithPath(utils.jsDir);

        // Make sure the directory exists.
        if (!scriptDir.exists()) {
            console.error("Script directory doesn't exist: " + scriptDir.path);
            return;
        }

        try {
            await ucAPI.unpackRemoteArchive({
                url: engine.package,
                zipPath: PathUtils.join(utils.jsDir, "engine.zip"),
                extractDir: utils.jsDir,
            });
        } catch (err) {
            console.error("Download/Extract error: " + err);
            throw err;
        }

        ucAPI.showToast({
            title: `The Sine engine has been updated to v${engine.version}.`,
            description: "Please restart your browser for the changes to fully take effect.",
        });

        Services.prefs.setStringPref("sine.updated-at", engine.updatedAt);
        Services.prefs.setStringPref("sine.version", engine.version);
        Services.prefs.setBoolPref("sine.engine.pending-restart", true);

        return true;
    },

    async fetch() {
        return await ucAPI
            .fetch(
                "https://raw.githubusercontent.com/CosmoCreeper/Sine/" +
                    (Services.prefs.getBoolPref("sine.is-cosine") ? "cosine" : "main") +
                    "/deployment/engine.json"
            )
            .catch((err) => console.warn(err));
    },

    async checkForUpdates() {
        const engine = await this.fetch();

        const updatedAt = Services.prefs.getStringPref("sine.updated-at", "unknown");
        if (
            engine &&
            (updatedAt === "unknown" || new Date(engine.updatedAt) > new Date(updatedAt)) &&
            Services.prefs.getBoolPref("sine.engine.auto-update", true)
        ) {
            return await this.updateEngine(engine);
        }

        Services.prefs.setStringPref("sine.latest-version", engine.version);
    },
};
