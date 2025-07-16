// => engine/services/updates.js
// ===========================================================
// This module allows Sine to update itself, removing the
// need for the user to reinstall Sine.
// ===========================================================

import ucAPI from "chrome://userscripts/content/engine/utils/uc_api.js";
import utils from "chrome://userscripts/content/engine/utils/utils.js";

const updates = {
    async updateEngine(engine) {
        // Delete the previous engine material.
        const enginePath = PathUtils.join(utils.jsDir, "engine");
        ucAPI.removeDir(enginePath);

        // Define the JS directory.
        const scriptDir = Cc["@mozilla.org/file/local;1"]
            .createInstance(Ci.nsIFile);
        scriptDir.initWithPath(utils.jsDir);
        
        // Make sure the directory exists.
        if (!scriptDir.exists()) {
            console.error("Script directory doesn't exist: " + scriptDir.path);
            return;
        }
        
        try {
            // Download to your specified directory.
            const targetFile = scriptDir.clone();
            targetFile.append("engine.zip");
        
            const download = await Downloads.createDownload({
                source: engine.package,
                target: targetFile.path
            });
        
            await download.start();
        
            // Extract in the same directory.
            const zipReader = Cc["@mozilla.org/libjar/zip-reader;1"]
              .createInstance(Ci.nsIZipReader);
        
            zipReader.open(targetFile);
        
            const extractDir = scriptDir.clone();
        
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
                for (const part of pathParts) {
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
        } catch (error) {
            console.error("Download/Extract error: " + error);
            throw error;
        }

        if (ucAPI.mainProcess) {
            ucAPI.showToast(
                `The Sine engine has been updated to v${engine.version}. ` +
                "Please restart your browser for the changes to fully take effect.", "info"
            );
        }

        UC_API.Prefs.set("sine.updated-at", engine.updatedAt);
        UC_API.Prefs.set("sine.version", engine.version);
        UC_API.Prefs.set("sine.engine.pending-restart", true);

        return true;
    },

    async checkForUpdates() {
        const engine = await ucAPI.fetch(this.engineURL).catch(err => console.warn(err));

        // Provide a bogus date if the preference does not exist, triggering an update.
        const updatedAt = UC_API.Prefs.get("sine.updated-at").value || "1927-02-02 20:20";
        if (engine && new Date(engine.updatedAt) > new Date(updatedAt)) {
            if (UC_API.Prefs.get("sine.engine.auto-update").value) {
                return await this.updateEngine(engine);
            }

            UC_API.Prefs.set("sine.engine.pending-update", true);
        }
    },
};

export default updates;