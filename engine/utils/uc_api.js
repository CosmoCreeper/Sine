// => engine/utils/uc_api.js
// ===========================================================
// This module adds convenience functions for performing
// generic tasks unrelated to mod management.
// ===========================================================

import appendXUL from "chrome://userscripts/content/engine/utils/XULManager.js";

const ucAPI = {
    mainProcess: document.location.pathname === "/content/browser.xhtml",
    globalWindow: windowRoot.ownerGlobal,
    isThunderbird: AppConstants.BROWSER_CHROME_URL.startsWith("chrome://messenger"),

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

        const response = await this.globalWindow.fetch(url).then(res => res.text()).catch(err => console.warn(err));
        return parseJSON(response);
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
            // Get directory contents.
            const children = await IOUtils.getChildren(path);

            // Remove each child recursively.
            for (const child of children) {
                await IOUtils.remove(child, { recursive: true });
            }
            
            // Remove the now-empty directory.
            await IOUtils.remove(path, { recursive: true });
        } catch (err) {
            console.error("Removal failed:", err);
        }
    },

    async showToast(text=["Unknown message."], preset=1, clickEvent=null) {
        // Animation configurations.
        const timeout = 3000;
        const toastAnimations = {
            entry: {
                initial: { y: "120%", scale: 0.8 },
                animate: { y: "0%", scale: 1 },
                transition: { type: "spring", stiffness: 300, damping: 30, mass: 0.8, duration: 0.5 }
            },
            exit: {
                animate: { y: "120%", scale: 0.8 },
                transition: { type: "spring", stiffness: 400, damping: 40, mass: 0.6, duration: 0.4 }
            },
            hover: {
                animate: { x: "-6px", y: "-2px", scale: 1.05 },
                transition: { type: "spring", stiffness: 400, damping: 25, duration: 0.2 }
            },
            button: {
                hover: { scale: 1.05 },
                tap: { scale: 0.95 },
                transition: { type: "spring", stiffness: 400, damping: 25, duration: 0.2 }
            },
            layout: {
                transition: { type: "spring", stiffness: 300, damping: 30, mass: 0.8, duration: 0.4 }
            }
        };

        const Motion = this.globalWindow.MotionLib;

        const remove = async (toast) => {
            toast.dataset.removing = "true";

            toast._entryAnimation?.stop();
        
            const exitAnimation = Motion.animate(
                toast,
                toastAnimations.exit.animate,
                toastAnimations.exit.transition
            );
        
            await exitAnimation.finished;

            toast.remove();
        };

        let id;
        if (text[0].includes("A mod utilizing JS")) {
            id = "1";
        } else if (text[0].includes("Sine engine")) {
            id = "2";
        }

        const duplicates = Array.from(this.globalDoc.querySelectorAll(".sineToast"))
            .filter(toast =>
                toast.dataset.id === id ||
                toast.children[0].children[0].textContent === text[0]
            );
        
        await Promise.all(
            duplicates.map(duplicate => remove(duplicate))
        );
    
        const sineToast = appendXUL(this.globalDoc.querySelector(".sineToastManager"), `
            <div class="sineToast" data-id="${id || "0"}">
                <div>
                    <span>${text[0]}</span>
                    ${text[1] ? `<span class="description">${text[1]}</span>` : ""}
                </div>
                ${preset > 0 ? `<button>${preset === 2 ? "Enable" : "Restart"}</button>` : ""}
            </div>
        `);
        
        const animateEntry = () => {
            sineToast.style.transform =
                `translateY(${toastAnimations.entry.initial.y}) scale(${toastAnimations.entry.initial.scale})`;
        
            sineToast._entryAnimation =
                Motion.animate(sineToast, toastAnimations.entry.animate, toastAnimations.entry.transition);
        
            const description = sineToast.querySelector(".description");
            if (description) {
                description.style.opacity = "0";
                description.style.transform = "translateY(5px)";
                Motion.animate(description, 
                    { opacity: "1", translateY: "0px" },
                    { delay: 0.2, type: "spring", stiffness: 300, damping: 30, duration: 0.3 }
                );
            }
        };
    
        const setupHover = () => {
            let hoverAnimation = null;
        
            sineToast.addEventListener("mouseenter", () => {
                if (hoverAnimation) hoverAnimation.stop();
                hoverAnimation = Motion.animate(
                    sineToast,
                    toastAnimations.hover.animate,
                    toastAnimations.hover.transition
                );
            });
        
            sineToast.addEventListener("mouseleave", () => {
                if (hoverAnimation) hoverAnimation.stop();
                hoverAnimation = Motion.animate(
                    sineToast, 
                    { x: "0px", y: "0px", scale: 1 },
                    toastAnimations.hover.transition
                );
            });
        };
    
        const setupButton = () => {
            const button = sineToast.querySelector("button");
            if (!button) return;
        
            let buttonAnimation = null;
        
            button.addEventListener("mouseenter", () => {
                if (buttonAnimation) buttonAnimation.stop();
                buttonAnimation = Motion.animate(
                    button,
                    toastAnimations.button.hover,
                    toastAnimations.button.transition
                );
            });
        
            button.addEventListener("mouseleave", () => {
                if (buttonAnimation) buttonAnimation.stop();
                buttonAnimation = Motion.animate(
                    button,
                    { scale: 1 },
                    toastAnimations.button.transition
                );
            });
        
            button.addEventListener("mousedown", () => {
                if (buttonAnimation) buttonAnimation.stop();
                buttonAnimation = Motion.animate(
                    button,
                    toastAnimations.button.tap,
                    { ...toastAnimations.button.transition, duration: 0.1 }
                );
            });
        
            button.addEventListener("mouseup", () => {
                if (buttonAnimation) buttonAnimation.stop();
                buttonAnimation = Motion.animate(
                    button,
                    toastAnimations.button.hover,
                    toastAnimations.button.transition
                );
            });

            button.addEventListener("click", (e) => {
                if (preset === 1) {
                    ucAPI.restart(true);
                } else if (preset === 2) {
                    clickEvent();
                    remove(sineToast);
                }
            });
        };
    
        const setupTimeout = () => {
            let timeoutId = null;
            let isPaused = false;
        
            const startTimeout = () => {
                if (timeoutId) clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    if (!isPaused) remove(sineToast);
                }, timeout);
            };
        
            const pauseTimeout = () => {
                isPaused = true;
                if (timeoutId) clearTimeout(timeoutId);
            };
        
            const resumeTimeout = () => {
                isPaused = false;
                startTimeout();
            };
        
            sineToast.addEventListener("mouseenter", pauseTimeout);
            sineToast.addEventListener("mouseleave", resumeTimeout);
        
            startTimeout();
        };

        // Initialize toast.
        animateEntry();
        setupHover();
        if (preset > 0) setupButton();
        setupTimeout();
    
        return {
            element: sineToast,
            remove: () => remove(sineToast)
        };
    },

    initToastManager() {
        appendXUL(this.globalDoc.body, `
            <div class="sineToastManager"></div>
        `);
    },

    prefs: {
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
            if (typeof value === "string") {
                Services.prefs.setStringPref(pref, value);
            } else if (typeof value === "number") {
                Services.prefs.setIntPref(pref, value);
            } else if (typeof value === "boolean") {
                Services.prefs.setBoolPref(pref, value);
            }
        },
    },

    getFork(num=false) {
        let secureName = Services.appinfo.name.toLowerCase();

        if (secureName === "mullvadbrowser") {
            secureName = "mullvad";
        } else if (
            secureName !== "zen" &&
            secureName !== "floorp" &&
            secureName !== "waterfox" &&
            secureName !== "librewolf" &&
            secureName !== "thunderbird"
        ) {
            secureName = "firefox";
        }

        if (num) {
            const nums = {
                "firefox": 0,
                "zen": 1,
                "floorp": 2,
                "mullvad": 3,
                "waterfox": 4,
                "librewolf": 5,
                "thunderbird": 6,
            };
            secureName = nums[secureName];
        }
        
        return secureName;
    },
}

export default ucAPI;