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

    async removeDir(path) {
        try {
            for (const child of await IOUtils.getChildren(path)) {
                await IOUtils.remove(child, { recursive: true });
            }

            await IOUtils.remove(path, { recursive: true });
        } catch (err) {
            console.error("Removal failed:", err);
        }
    },
};
