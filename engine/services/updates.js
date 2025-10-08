// => engine/services/updates.js
// ===========================================================
// This module allows Sine to update itself, removing the
// need for the user to reinstall Sine.
// ===========================================================

import utils from "chrome://userscripts/content/engine/utils/utils.js";

const updates = {
    async updateEngine(engine) {
        // Delete the previous engine material.
        ucAPI.removeDir(PathUtils.join(utils.jsDir, "engine"));
	IOUtils.remove(PathUtils.join(utils.jsDir, "sine.uc.mjs"));

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
            try {
                targetFile.remove(false);
	    } catch {}
        } catch (error) {
            console.error("Download/Extract error: " + error);
            throw error;
        }

        if (ucAPI.mainProcess) {
            ucAPI.showToast(
                [
                    `The Sine engine has been updated to v${engine.version}.`,
                    "Please restart your browser for the changes to fully take effect."
                ]
            );
        }

        Services.prefs.setStringPref("sine.updated-at", engine.updatedAt);
        Services.prefs.setStringPref("sine.version", engine.version);
        Services.prefs.setBoolPref("sine.engine.pending-restart", true);

        return true;
    },

    async fetch() {
        const engineURL =  Services.prefs.getBoolPref("sine.is-cosine") ?
            "https://raw.githubusercontent.com/CosmoCreeper/Sine/cosine/deployment/engine.json" :
            "https://raw.githubusercontent.com/CosmoCreeper/Sine/main/deployment/engine.json";

        return await ucAPI.fetch(engineURL).catch(err => console.warn(err));
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
