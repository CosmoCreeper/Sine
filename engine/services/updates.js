// => engine/services/updates.js
// ===========================================================
// This module allows Sine to update itself, removing the
// need for the user to reinstall Sine.
// ===========================================================

const ucAPI = ChromeUtils.importESModule("chrome://userscripts/content/engine/utils/uc_api.sys.mjs").default;
const utils = ChromeUtils.importESModule("chrome://userscripts/content/engine/core/utils.mjs").default;

export default {
    dataFile: PathUtils.join(utils.jsDir, "engine.json"),
    updaterName: "updater." + (ucAPI.utils.os === "win" ? "bat" : "sh"),
    get downloadsFolder() {
        return PathUtils.join(FileUtils.getDir("Home", [], false).path, "Downloads");
    },
    get exePath() {
        return PathUtils.join(this.downloadsFolder, this.updaterName);
    },

    convertToParts(version) {
        return version.replace("c", "").split(".").map(part => Number(part));
    },

    toReadable(version) {
        const cosineStr = version.endsWith("c") ? "c" : "";

        const parts = this.convertToParts(version);
        // Remove patch number from version.
        parts.pop();
        // If there is no third part, remove it (0 is falsy).
        if (!parts[2]) {
            parts.pop();
        }

        return parts.join(".") + cosineStr;
    },

    async init() {
        if (this.current) return;

        this.current = await IOUtils.readJSON(this.dataFile).then(res => res.version);
        this.latest = this.current;

        if (Services.prefs.getPrefType("sine.is-cosine") === 0) {
            Services.prefs.setBoolPref("sine.is-cosine", this.current.endsWith("c"));
        }
    },

    async updateEngine(engine, update) {
        Services.appinfo.invalidateCachesOnRestart();

        // Tags do not use the patch number and on some occasions, the minor version, so it must be converted.
        const versionTag = this.toReadable(update.version);

        const updateLink = engine.releaseLink.replace("{version}", versionTag) + this.updaterName;

        try {
            const dirSvc = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);
            let browserPath = dirSvc.get("XREExeF", Ci.nsIFile).parent.path;
            
            // Fix snap install location
            if (browserPath.startsWith("/snap/firefox/")) {
                browserPath = "/etc/firefox";
            }

            // Create identifier to determine when update is complete.
            const identifierPath = PathUtils.join(ucAPI.utils.chromeDir, "update");
            await IOUtils.writeUTF8(identifierPath, "");

            // Download updater.
            const resp = await ucAPI.fetch(updateLink, true);
            const buf = await resp.arrayBuffer();
            const bytes = new Uint8Array(buf);
            await IOUtils.write(this.exePath, bytes);

            // Set file as an executable on Unix-like systems.
            if (ucAPI.utils.os !== "win") {
                const exe = FileUtils.File(this.exePath);
                exe.permissions = 0o755;
            }

            const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
            file.initWithPath(this.exePath);

            const proc = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
            proc.init(file);

            const args = [
                "-s",
                "--browser", browserPath,
                "--profile", PathUtils.profileDir,
                "--bootloader", update.bootloader || engine.bootloader,
                "--version", versionTag,
            ];
            if (!update.updateBoot) {
                args.push("--no-boot");
            }

            proc.run(false, args, args.length);

            // Wait until updater is complete using identifier.
            await new Promise((resolve) => {
                const interval = setInterval(async () => {
                    if (!(await IOUtils.exists(identifierPath))) {
                        clearInterval(interval);
                        resolve();
                    }
                }, 500);
            });

            await IOUtils.remove(this.exePath);
        } catch (err) {
            console.error("Error updating Sine: " + err);
            throw err;
        }

        ucAPI.showToast({
            id: "5",
            version: versionTag,
        });

        this.current = versionTag;
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

    // Determines if a semantic version is newer than another.
    isNewer(newVersion, originalVersion) {
        newVersion = this.convertToParts(newVersion);
        originalVersion = this.convertToParts(originalVersion);

        for (let i = 0; i < newVersion.length; i++) {
            if (newVersion[i] > originalVersion[i]) {
                return true;
            }
        }

        /*
         * Older versions may have fewer segments (vX.X.X vs vX.X.X.X).
         * When orig[i] is undefined, `new[i] > undefined` is always false in JS,
         * so this case must be handled explicitly for backwards compatibility.
         */
        if (originalVersion.length < newVersion.length) {
            return true;
        }
    },

    async checkForUpdates(isManualTrigger = false) {
        if (!this.current) {
            await this.init();
        }

        const engine = await this.fetch();

        /*
         * Find the first version to update to.
         * The version array is stored from latest to oldest for ease, and must be reversed.
         */
        let toUpdate;
        for (const update of engine.updates.toReversed()) {
            if (this.isNewer(update.version, this.current)) {
                toUpdate = update;
                break;
            }
        }

        if (engine && toUpdate && (Services.prefs.getBoolPref("sine.engine.auto-update", true) || isManualTrigger)) {
            return await this.updateEngine(engine, toUpdate);
        }

        this.latest = engine.updates[0].version;
    },
};
