// => engine/utils/uc_api.js
// ===========================================================
// This module adds convenience functions for performing
// generic tasks unrelated to mod management.
// ===========================================================

const ucAPI = {
    mainProcess: document.location.pathname === "/content/browser.xhtml",
    globalWindow: windowRoot.ownerGlobal,

    get globalDoc() {
        return this.globalWindow.document;
    },

    get os() {
        const os = Services.appinfo.OS;
        const osMap = {
            WINNT: "win",
            Darwin: "mac",
            Linux: "linux",
        }
        return osMap[os];
    },

    // Returns a path to the chrome directory in a file:/// format.
    get chromeDir() {
        const io = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
        const ds = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);

        return io.newFileURI(ds.get("UChrm", Ci.nsIFile)).spec;
    },

    // Returns a path to the chrome directory in a writable format.
    get sysChromeDir() {
        let chromeDir = decodeURIComponent(
            this.chromeDir.replace("file:///", "").replace(/%20/g, " ")
        );

        if (this.os.includes("win")) {
            chromeDir = chromeDir.replace(/\//g, "\\");
        } else {
            chromeDir = "/" + chromeDir;
        }

        return chromeDir;
    },

    async fetch(url, forceText=false) {
        const parseJSON = response => {
            try {
                if (!forceText) {
                    response = JSON.parse(response);
                }
            } catch {}
            return response;
        }

        if (this.mainProcess) {
            const response = await fetch(url).then(res => res.text()).catch(err => console.warn(err));
            return parseJSON(response);
        } else {
            const randomId = Math.floor(Math.random() * 100) + 1;
            const fetchId = `${url}-${randomId}`;
            UC_API.Prefs.set("sine.fetch-url", `fetch:${fetchId}`);
            return new Promise(resolve => {
                const listener = UC_API.Prefs.addListener("sine.fetch-url", async () => {
                    if (UC_API.Prefs.get("sine.fetch-url").value === `done:${fetchId}`) {
                        UC_API.Prefs.removeListener(listener);
                        const response = UC_API.SharedStorage.FetchList;
                        // Save copy of response[url] so it can't be overwritten.
                        const temp = response[fetchId];
                        delete response[fetchId];
                        resolve(parseJSON(temp));
                    }
                });
            });
        }
    },

    async initFetchListener() {
        // Initialize object in RAM and reset fetch url.
        Services.prefs.setStringPref("sine.fetch-url", "none");
        UC_API.SharedStorage.FetchList = {};

        UC_API.Prefs.addListener("sine.fetch-url", async () => {
            const action = Services.prefs.getStringPref("sine.fetch-url");
            if (action.match(/^fetch:/)) {
                const fetchId = action.replace(/^fetch:/, "");
                const url = fetchId.replace(/-[0-9]+$/, "");
                const response = await fetch(url).then(res => res.text()).catch(err => console.warn(err));
                const fetchResults = UC_API.SharedStorage.FetchList;
                fetchResults[fetchId] = response;
                UC_API.Prefs.set("sine.fetch-url", `done:${fetchId}`);
            }
        });
    },

    restart(clearCache) {
        if (clearCache) {
            Services.appinfo.invalidateCachesOnRestart();
        }

        let cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].createInstance(Ci.nsISupportsPRBool);
        Services.obs.notifyObservers(
          cancelQuit,
          "quit-application-requested",
          "restart"
        );
        if (!cancelQuit.data) {
          Services.startup.quit(
            Services.startup.eAttemptQuit | Services.startup.eRestart
          );
          return true;
        }
        return false;
    },

    async removeDir(path) {
        try {
            // Get directory contents
            const children = await IOUtils.getChildren(path);

            // Remove each child recursively
            for (const child of children) {
                await IOUtils.remove(child, { recursive: true });
            }
            
            // Remove the now-empty directory
            await IOUtils.remove(path, { recursive: true });
        } catch (err) {
            console.error("Removal failed:", err);
        }
    },

    async showToast(label="Unknown", priority="warning", restart=true) {
        const ifToastExists = Array.from(this.globalDoc.querySelectorAll("notification-message"))
            .some(notification => notification.__message === label);
        
        if (!ifToastExists) {
            const buttons = restart ? [{
                label: "Restart",
                callback: () => {
                    ucAPI.restart(true);
                    return true;
                }
            }] : [];

            await UC_API.Runtime.startupFinished();

            UC_API.Notifications.show({
                priority,
                label,
                buttons,
                window: this.globalWindow,
            });
        }
    },
}

export default ucAPI;