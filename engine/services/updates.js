// => engine/services/updates.js
// ===========================================================
// This module allows Sine to update itself, removing the
// need for the user to reinstall Sine.
// ===========================================================

import utils from "../core/utils.mjs";
import ucAPI from "../utils/uc_api.sys.mjs";

export default {
    os: (() => {
        const os = Services.appinfo.OS.toLowerCase();
        if (os.includes("darwin") || os.includes("mac")) {
            return "osx";
        }
        if (os.includes("win")) {
            return "win";
        }
        return "linux";
    })(),
    get updaterName() {
        return "sine-" + this.os + "-" + ucAPI.utils.cpu + (this.os === "win" ? ".exe" : "");
    },
    get exePath() {
        return PathUtils.join(ucAPI.utils.chromeDir, this.updaterName);
    },

    async updateEngine(engine, update) {
        Services.appinfo.invalidateCachesOnRestart();

        const updateLink = engine.releaseLink.replace("{version}", update.redirects?.version || update.version);
        const engineLink = updateLink + (update.overwrites?.enginePath || engine.enginePath);

        const bootloaderLink = engine.bootloaderLink.replace(
            "{version}",
            update.redirects?.bootloaderVersion || engine.bootloaderVersion
        );
        const profileLink = bootloaderLink + (update.overwrites?.profilePath || engine.profilePath);

        try {
            // Delete the previous utils.
            await IOUtils.remove(PathUtils.join(ucAPI.utils.chromeDir, "utils"), { recursive: true });
            // Update utils.
            await ucAPI.unpackRemoteArchive({
                url: profileLink,
                zipPath: PathUtils.join(ucAPI.utils.chromeDir, "profile.zip"),
                extractDir: ucAPI.utils.chromeDir,
            });

            // Delete the previous engine.
            await IOUtils.remove(utils.jsDir, { recursive: true });
            // Update engine.
            await ucAPI.unpackRemoteArchive({
                url: engineLink,
                zipPath: PathUtils.join(ucAPI.utils.chromeDir, "engine.zip"),
                extractDir: ucAPI.utils.chromeDir,
            });

            ucAPI.showToast({
                id: "5",
                version: update.version,
            });

            Services.prefs.setStringPref("sine.version", update.version);
            Services.prefs.setBoolPref("sine.engine.pending-restart", true);

            ucAPI.utils.restart();
        } catch (err) {
            console.error("Error updating Sine: " + err);
            throw err;
        }

        return true;
    },

    async fetch() {
        return await ucAPI
            .fetch(
                "https://raw.githubusercontent.com/CosmoCreeper/Sine/" +
                    (Services.prefs.getBoolPref("sine.is-cosine", false) ? "cosine" : "main") +
                    "/engine.json"
            )
            .catch((err) => console.warn(err));
    },

    async checkForUpdates(isManualTrigger = false) {
        const engine = await this.fetch();

        if (await IOUtils.exists(this.exePath)) {
            await IOUtils.remove(this.exePath);
        }

        const currVersion = Services.prefs.getStringPref("sine.version", "1.0.0");
        let toUpdate;
        for (let i = 0; i < engine.updates.length; i++) {
            const update = engine.updates[i];
            if (currVersion === update.version && i !== 0) {
                toUpdate = engine.updates[i - 1];
                break;
            }
        }
        if (!toUpdate && currVersion !== engine.updates[0].version) {
            toUpdate = engine.updates[engine.updates.length - 1];
        }

        if (engine && toUpdate && (Services.prefs.getBoolPref("sine.engine.auto-update", true) || isManualTrigger)) {
            return await this.updateEngine(engine, toUpdate);
        }
        Services.prefs.setStringPref("sine.latest-version", engine.updates[0].version);
    },
};
