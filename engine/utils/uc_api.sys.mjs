// => engine/utils/uc_api.sys.mjs
// ===========================================================
// This module adds convenience functions for performing
// generic tasks unrelated to mod management.
// ===========================================================

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";
import Toast from "./toasts.mjs";

const utils = {
    os: AppConstants.platform.substr(0, 3),
    chromeDir: PathUtils.join(PathUtils.profileDir, "chrome"),
    fork:
        {
            mullvadbrowser: "mullvad",
            zen: "zen",
            floorp: "floorp",
            waterfox: "waterfox",
            librewolf: "librewolf",
            thunderbird: "thunderbird",
        }[AppConstants.MOZ_APP_NAME] || "firefox",

    restart() {
        Services.startup.quit(Ci.nsIAppStartup.eRestart | Ci.nsIAppStartup.eAttemptQuit);
    },

    generateUUID(groupLength = 9, numGroups = 3, chars = "abcdefghijklmnopqrstuvwxyz0123456789") {
        const generateGroup = () => {
            let group = "";
            for (let i = 0; i < groupLength; i++) {
                const randomIndex = Math.floor(Math.random() * chars.length);
                group += chars[randomIndex];
            }
            return group;
        };

        const groups = [];
        for (let i = 0; i < numGroups; i++) {
            groups.push(generateGroup());
        }

        return groups.join("-");
    },
};

const prefs = {
    get(pref) {
        const prefType = Services.prefs.getPrefType(pref);

        if (prefType === 32) {
            return Services.prefs.getStringPref(pref);
        } else if (prefType === 64) {
            return Services.prefs.getIntPref(pref);
        } else if (prefType === 128) {
            return Services.prefs.getBoolPref(pref);
        }

        return null;
    },

    set(pref, value) {
        try {
            if (typeof value === "string") {
                Services.prefs.setStringPref(pref, value);
            } else if (typeof value === "number") {
                Services.prefs.setIntPref(pref, value);
            } else if (typeof value === "boolean") {
                Services.prefs.setBoolPref(pref, value);
            }
        } catch (err) {
            console.error(new Error(`Failed to set pref ${pref}: ${err}`));
        }
    },
};

export default {
    utils,
    prefs,

    showToast(options) {
        const windows = Services.wm.getEnumerator("navigator:browser");
        while (windows.hasMoreElements()) {
            new Toast(options, windows.getNext());
        }
    },

    async fetch(url, forceText = false) {
        const response = await fetch(url)
            .then((res) => res.text())
            .catch((err) => console.warn(err));

        if (!forceText) {
            try {
                return JSON.parse(response);
            } catch {}
        }

        return response;
    },

    async unpackRemoteArchive(options) {
        const downloadTime = Date.now();
        const resp = await fetch(options.url);
        const buf = await resp.arrayBuffer();
        const bytes = new Uint8Array(buf);
        await IOUtils.write(options.zipPath, bytes);
        console.log("Download time:", Date.now() - downloadTime);

        const extractTime = Date.now();
        const zipFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
        zipFile.initWithPath(options.zipPath);

        const zipReader = Cc["@mozilla.org/libjar/zip-reader;1"].createInstance(Ci.nsIZipReader);
        zipReader.open(zipFile);

        const targetDir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
        targetDir.initWithPath(options.extractDir);

        const entries = zipReader.findEntries("*");
        while (entries.hasMore()) {
            const origEntryName = entries.getNext();
            let entryName = origEntryName;

            const segments = entryName.split("/").filter(Boolean);

            // Specifically for mod installs.
            if (options.applyName) {
                segments[0] = options.id;
            }

            entryName = segments.join("/");

            if (!entryName) {
                continue;
            }

            if (origEntryName.endsWith("/")) {
                const dirFile = targetDir.clone();
                for (const segment of segments) {
                    dirFile.append(segment);
                    if (!dirFile.exists()) dirFile.create(Ci.nsIFile.DIRECTORY_TYPE, parseInt("0777", 8));
                }
                continue;
            }

            const parentDir = targetDir.clone();
            for (let i = 0; i < segments.length - 1; i++) {
                parentDir.append(segments[i]);
                if (!parentDir.exists()) parentDir.create(Ci.nsIFile.DIRECTORY_TYPE, parseInt("0777", 8));
            }

            const outFile = parentDir.clone();
            outFile.append(segments[segments.length - 1]);

            zipReader.extract(origEntryName, outFile);
            // https://bugzilla.mozilla.org/show_bug.cgi?id=935553
            outFile.permissions = parseInt("0666", 8);
        }

        zipReader.close();
        console.log("Extract time:", Date.now() - extractTime);

        IOUtils.remove(options.zipPath);
    },
};
