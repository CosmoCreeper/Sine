// => engine/services/updates.js
// ===========================================================
// This module allows Sine to update itself, removing the
// need for the user to reinstall Sine.
// ===========================================================

import utils from "chrome://userscripts/content/engine/utils/utils.js";

const updates = {
    async updateEngine(engine) {
        // Define the JS directory.
        const scriptDir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
        scriptDir.initWithPath(utils.jsDir);

        //Define the path for the engine folder
        const enginePath = PathUtils.join(utils.jsDir, "engine");

        //Define the engine directory
        const engineDir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
        engineDir.initWithPath(enginePath);

        //Define the temporary engine path
        const tempEnginePath = PathUtils.join(utils.jsDir, `tempEngine_${Date.now()}`);

        //Define the temporary engine directory
        const tempDir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
        tempDir.initWithPath(tempEnginePath);

        //Define the backup engine path
        const backupEnginePath = PathUtils.join(utils.jsDir, "backupEngine");

        //Defining the backup engine directory
        const backupEngineDir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
        backupEngineDir.initWithPath(backupEnginePath);

        // Make sure the directory exists.
        if (!scriptDir.exists()) {
            console.error("Script directory doesn't exist: " + scriptDir.path);
            return;
        }

        try {
            //Removing the backup engine if it already exists
            if (backupEngineDir.exists()) {
                backupEngineDir.remove(true);
            }

            //Creating the backup engine by renaming it
            if (engineDir.exists()) {
                engineDir.moveTo(null, "backupEngine");
            }

            // Download to your specified directory.
            const targetFile = scriptDir.clone();
            targetFile.append("engine.zip");

            const download = await Downloads.createDownload({
                source: engine.package,
                target: targetFile.path,
            });

            await download.start();

            // Extract in the same directory.
            const zipReader = Cc["@mozilla.org/libjar/zip-reader;1"].createInstance(
                Ci.nsIZipReader
            );

            zipReader.open(targetFile);

            //extracting to the temp directory
            const extractDir = tempDir.clone();

            if (!extractDir.exists()) {
                extractDir.create(Ci.nsIFile.DIRECTORY_TYPE, -1);
            }

            // Extract all files.
            const entries = zipReader.findEntries("*");
            let extractedCount = 0;

            while (entries.hasMore()) {
                const entryName = entries.getNext();
                const destFile = extractDir.clone();

                const pathParts = entryName.split("/");

                //for extracting directly into tempDir, skip the first part
                const relativeParts = pathParts.slice(1);
                for (const part of relativeParts) {
                    if (part) {
                        destFile.append(part);
                    }
                }

                if (destFile.parent && !destFile.parent.exists()) {
                    destFile.parent.create(Ci.nsIFile.DIRECTORY_TYPE, -1);
                }

                if (!entryName.endsWith("/")) {
                    zipReader.extract(entryName, destFile);
                    extractedCount++;
                }
            }

            zipReader.close();

            // Delete the zip file.
            targetFile.remove(false);

            // Rename the temp directory as the engine folder
            tempDir.moveTo(null, "engine");

            // Remove the backup folder
            try {
                backupEngineDir.remove(true);
            } catch (error) {
                console.log("Could not remove the backup :" + error);
            }
        } catch (error) {
            console.error("Download/Extract error: " + error);
            try {
                // Remove the temp directory.
                tempDir.remove(true);

                // Remove the engine directory.
                engineDir.remove(true);

                //Moving the backup back to being the engine
                if (backupEngineDir.exists()) {
                    backupEngineDir.moveTo(null, "engine");
                }
            } catch (error) {
                console.log("Could not rollback to backup :" + error);
            }

            throw error;
        }

        if (ucAPI.mainProcess) {
            ucAPI.showToast([
                `The Sine engine has been updated to v${engine.version}.`,
                "Please restart your browser for the changes to fully take effect.",
            ]);
        }

        Services.prefs.setStringPref("sine.updated-at", engine.updatedAt);
        Services.prefs.setStringPref("sine.version", engine.version);
        Services.prefs.setBoolPref("sine.engine.pending-restart", true);

        return true;
    },

    async fetch() {
        const engineURL = Services.prefs.getBoolPref("sine.is-cosine")
            ? "https://raw.githubusercontent.com/CosmoCreeper/Sine/cosine/deployment/engine.json"
            : "https://raw.githubusercontent.com/CosmoCreeper/Sine/main/deployment/engine.json";

        return await ucAPI.fetch(engineURL).catch((err) => console.warn(err));
    },

    async checkForUpdates() {
        const engine = await this.fetch();

        const updatedAt = Services.prefs.getStringPref("sine.updated-at", "1927-02-02 20:20");
        if (
            engine &&
            new Date(engine.updatedAt) > new Date(updatedAt) &&
            ucAPI.mainProcess &&
            Services.prefs.getBoolPref("sine.engine.auto-update", true)
        ) {
            return await this.updateEngine(engine);
        }

        Services.prefs.setStringPref("sine.latest-version", engine.version);
    },
};

export default updates;
