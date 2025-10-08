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

	//Define the Sine file path 
	const sineFilePath = PathUtils.join(utils.jsDir, "sine.uc.mjs");

	//Defining the sine engine directory
	const sineFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
	sineFile.initWithPath(sineFilePath);


        // Make sure the directory exists.
        if (!scriptDir.exists()) {
            console.error("Script directory doesn't exist: " + scriptDir.path);
            return;
        }

        try {
	    // Removing the backup engine if it already exists
	    if (backupEngineDir.exists()) {
		backupEngineDir.remove(true);
	    }

	    // Create backupEngine directory
	    backupEngineDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);

	    // Move the existing engine folder INTO backupEngine
	    if (engineDir.exists()) {

		try{

		    engineDir.moveTo(backupEngineDir, null);
		}
		catch(error){
		    console.log("Could not move engine directory to the backup folder: "+ error);
		    throw error;
		}
	    }

	    //Moving the sine file into the backup folder
	    if (sineFile.exists()) {
		try{

		    sineFile.moveTo(backupEngineDir, null);
		}
		catch(error){
		    console.log("Could not move sine.uc.mjs to the backup folder: "+ error);
		    throw error;
		}
	    } else {
		console.warn("sine.uc.mjs not found in jsDir.");
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

            if (extractDir.exists()) {
		extractDir.remove(true);
            }
	    extractDir.create(Ci.nsIFile.DIRECTORY_TYPE, -1);

            // Extract all files.
            const entries = zipReader.findEntries("*");
            let extractedCount = 0;

            while (entries.hasMore()) {
                const entryName = entries.getNext();
                const destFile = extractDir.clone();

                const pathParts = entryName.split("/");

                //for extracting directly into tempDir, skip the first part
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

	    //Remove any leftover engine files
	    if(engineDir.exists()){
		engineDir.remove(true);
	    }

	    //Remove the leftover sine.uc.mjs file
	    if(sineFile.exists()){
		sineFile.remove(false);
	    }

	    //Moving the contents of the temporary directory to the script directory
	    const tempEntries= tempDir.directoryEntries;
	    while (tempEntries.hasMoreElements()) {
		const entry = tempEntries.getNext().QueryInterface(Ci.nsIFile);
		entry.moveTo(scriptDir, entry.leafName);
	    }

	    if(tempDir.exists()){
		tempDir.remove(true);
	    }

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
		    const entries = backupEngineDir.directoryEntries;
		    while (entries.hasMoreElements()) {
			const entry = entries.getNext().QueryInterface(Ci.nsIFile);
			entry.moveTo(scriptDir, entry.leafName); // move each file/folder into scriptDir
		    }
		    console.log("Restored engine directory contents from backup during rollback.");
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
