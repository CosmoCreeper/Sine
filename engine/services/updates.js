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

    async updateEngine(update, releaseLink) {
        Services.appinfo.invalidateCachesOnRestart();

        try {
            const dirSvc = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);
            const browserPath = dirSvc.get("XREExeF", Ci.nsIFile).parent;

            const updaterName = "sine-" + this.os + "-" + ucAPI.utils.cpu + (this.os === "win" ? ".exe" : "");
            const exePath = PathUtils.join(ucAPI.utils.chromeDir, updaterName);

            const identifierPath = PathUtils.join(utils.jsDir, "update");
            await IOUtils.writeUTF8(identifierPath, "")

            const resp = await fetch(releaseLink.replace("{version}", update.version) + updaterName);
            const buf = await resp.arrayBuffer();
            const bytes = new Uint8Array(buf);
            await IOUtils.write(exePath, bytes);

            const updater = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
            updater.initWithPath(exePath);

            const proc = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
            proc.init(updater);

            const args = [
                "--browser", browserPath,
                "--profile", PathUtils.profileDir,
                "-s",
                "--update",
                update.updateBoot ? "" : "--no-boot"
            ];
            proc.run(false, args, args.length);

            while (true) {
                let exists;
                try {
                    exists = await IOUtils.exists(identifierPath);
                } catch (e) {
                    break;
                }
              
                if (!exists) {
                    break;
                }
              
                await new Promise((resolve) => {
                    setTimeout(resolve, interval);
                });
            }

            await IOUtils.remove(exePath);
        } catch (err) {
            console.error("Error updating Sine: " + err);
            throw err;
        }

        ucAPI.showToast({
            title: `The Sine engine has been updated to v${update.version}.`,
            description: "Please restart your browser for the changes to fully take effect.",
        });

        Services.prefs.setStringPref("sine.version", update.version);
        Services.prefs.setBoolPref("sine.engine.pending-restart", true);

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

    async checkForUpdates() {
        const engine = await this.fetch();

        const currVersion = Services.prefs.getStringPref("sine.latest-version", "1.0.0");
        let toUpdate;
        for (let i = 0; i < engine.updates.length; i++) {
            const update = engine.updates[i];
            if (currVersion === update.version) {
                toUpdate = engine.updates[i - 1];
                break;
            }
        }
        if (!toUpdate) {
            toUpdate = engine.updates[engine.updates.length - 1];
        }

        if (
            engine &&
            Services.prefs.getBoolPref("sine.engine.auto-update", true)
        ) {
            return await this.updateEngine(toUpdate, engine.link);
        }
        Services.prefs.setStringPref("sine.latest-version", engine.latest);
    },
};
