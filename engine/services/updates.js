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

    async updateEngine(update, releaseLink) {
        Services.appinfo.invalidateCachesOnRestart();

        try {
            const dirSvc = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);
            const browserPath = dirSvc.get("XREExeF", Ci.nsIFile).parent.path;

            const identifierPath = PathUtils.join(utils.jsDir, "update");
            await IOUtils.writeUTF8(identifierPath, "");

            const resp = await fetch(releaseLink.replace("{version}", update.version) + this.updaterName);
            const buf = await resp.arrayBuffer();
            const bytes = new Uint8Array(buf);
            await IOUtils.write(this.exePath, bytes);

            const updater = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
            updater.initWithPath(this.exePath);

            if (this.os === "linux" || this.os === "osx") {
                const file = new FileUtils.File(this.exePath);

                // Make file executable
                file.permissions = 0o755;

                if (this.os === "osx") {
                    const xattr = new FileUtils.File("/usr/bin/xattr");

                    const proc = Cc["@mozilla.org/process/util;1"]
                      .createInstance(Ci.nsIProcess);

                    proc.init(xattr);
                    proc.run(false, ["-d", "com.apple.quarantine", file.path], 3);
                }
            }

            const proc = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
            proc.init(updater);

            const args = [
                "--browser", browserPath,
                "--profile", PathUtils.profileDir,
                "-s",
                "--update"
            ];
            if (!update.updateBoot) {
                args.push("--no-boot");
            }
            proc.run(false, args, args.length);

            await new Promise(resolve => {
                const interval = setInterval(async () => {
                    if (!(await IOUtils.exists(identifierPath))) {
                        clearInterval(interval);
                        resolve();
                    }
                }, 500);
            });
        } catch (err) {
            console.error("Error updating Sine: " + err);
            throw err;
        }

        ucAPI.showToast({
            id: "5",
            version: update.version,
        });

        Services.prefs.setStringPref("sine.version", update.version);
        Services.prefs.setBoolPref("sine.engine.pending-restart", true);

        ucAPI.utils.restart();

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

        if (
            engine && toUpdate &&
            (Services.prefs.getBoolPref("sine.engine.auto-update", true) || isManualTrigger)
        ) {
            return await this.updateEngine(toUpdate, engine.link);
        }
        Services.prefs.setStringPref("sine.latest-version", engine.updates[0].version);
    },
};
