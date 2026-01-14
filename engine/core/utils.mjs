// => engine/utils/utils.mjs
// ===========================================================
// This module provides data so that Sine can easily know
// where to look and perform actions.
// ===========================================================

import ucAPI from "../utils/uc_api.sys.mjs";

export default {
    get cosine() {
        return Services.prefs.getBoolPref("sine.is-cosine", false);
    },

    get brand() {
        return this.cosine ? "cosine" : "sine";
    },

    get sineBranch() {
        return Services.prefs.getBoolPref("sine.is-cosine", false) ? "cosine" : "main";
    },

    get jsDir() {
        return PathUtils.join(ucAPI.utils.chromeDir, "JS");
    },

    get modsDir() {
        return PathUtils.join(ucAPI.utils.chromeDir, "sine-mods");
    },

    get chromeFile() {
        return PathUtils.join(this.modsDir, "chrome.css");
    },

    get contentFile() {
        return PathUtils.join(this.modsDir, "content.css");
    },

    get modsDataFile() {
        return PathUtils.join(this.modsDir, "mods.json");
    },

    getModFolder(id) {
        return PathUtils.join(this.modsDir, id);
    },

    async getMods() {
        return await IOUtils.readJSON(this.modsDataFile);
    },

    async getModPreferences(mod) {
        try {
            return await IOUtils.readJSON(PathUtils.join(this.getModFolder(mod.id), ...mod.preferences.split("/")));
        } catch (err) {
            ucAPI.showToast({
                id: "4",
                name: mod.name
            });
            console.warn(`[Sine]: Failed to read preferences for mod ${mod.id}:`, err);
            return {};
        }
    },

    rawURL(repo) {
        if (repo.startsWith("[") && repo.endsWith(")") && repo.includes("](")) {
            repo = repo.replace(/^\[[a-z]+\]\(/i, "").replace(/\)$/, "");
        }
        repo = repo.replace(/^https:\/\/github.com\//, "");
        let repoName;
        let branch;
        let folders = [];

        if (repo.includes("/tree/")) {
            const parts = repo.split("/tree/");
            repoName = parts[0];
            const branchAndPath = parts[1].split("/");
            branch = branchAndPath[0];

            // Get all folder parts after the branch
            if (branchAndPath.length > 1) {
                folders = branchAndPath.slice(1).filter((folder) => folder !== "");

                // Remove trailing slash from last folder if present
                if (folders.length > 0 && folders[folders.length - 1].endsWith("/")) {
                    folders[folders.length - 1] = folders[folders.length - 1].slice(0, -1);
                }
            }
        } else {
            branch = "main"; // Default branch if not specified
            // If there is no folder, use the whole repo name
            if (repo.endsWith("/")) {
                repoName = repo.substring(0, repo.length - 1);
            } else {
                repoName = repo;
            }
        }

        // Construct the folder path
        const folderPath = folders.length > 0 ? "/" + folders.join("/") : "";

        return `https://raw.githubusercontent.com/${repoName}/${branch}${folderPath}/`;
    },

    getProcesses(window = null, processes = null) {
        if (window) {
            return [window];
        }

        let pages = [];

        const windows = Services.wm.getEnumerator(null);
        while (windows.hasMoreElements()) {
            const win = windows.getNext();

            if (win && (!processes || processes.some((process) => process === win.location.pathname))) {
                pages.push(win);
            }

            if (win.location.pathname === "/content/browser.xhtml" && win.gBrowser?.tabs) {
                for (const tab of win.gBrowser.tabs) {
                    const contentWindow = tab.linkedBrowser.contentWindow;
                    const urlPathname = contentWindow?.location?.pathname;
                    if (contentWindow && (!processes || processes.some((process) => process === urlPathname))) {
                        pages.push(contentWindow);
                    }
                }
            }
        }
        return pages;
    },

    get autoUpdate() {
        return Services.prefs.getBoolPref("sine.auto-updates", true);
    },

    set autoUpdate(value) {
        Services.prefs.setBoolPref("sine.auto-updates", value);
    },

    get allowUnsafeJS() {
        return Services.prefs.getBoolPref("sine.allow-unsafe-js", false);
    },

    formatLabel(label) {
        return label
            .replace(/<br(\/|.*)>/g, "<br/>")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\\(\*\*|\*|~)/g, (_, c) => (c === "**" ? "\x01" : c === "*" ? "\x02" : "\x03"))
            .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
            .replace(/\*([^*]+)\*/g, "<i>$1</i>")
            .replace(/~([^~]+)~/g, "<u>$1</u>")
            .replace(/\x01/g, "**")
            .replace(/\x02/g, "*")
            .replace(/\x03/g, "~")
            .replace(/&\s/g, "&amp;")
            .replace(/\n/g, "<br/>");
    },

    async getScripts(options = {}) {
        const flattenPathStructure = (scripts, parentKey = "", result = {}) => {
            for (const key in scripts) {
                const newKey = parentKey ? `${parentKey}/${key}` : key;

                // Potential edge case where folder name ends with a script suffix.
                if (
                    (options.removeBgModules ? false : newKey.endsWith(".sys.mjs")) ||
                    newKey.endsWith(".uc.mjs") ||
                    newKey.endsWith(".uc.js")
                ) {
                    scripts[key].include = (scripts[key].include?.length ? scripts[key].include : [".*"])
                      .map(p => p.replace(/\*/g, '.*?'));

                    scripts[key].exclude = (scripts[key].exclude?.length
                      ? scripts[key].exclude.map(p => p.replace(/\*/g, '.*?'))
                      : []
                    );

                    const exclude = scripts[key].exclude?.length ? `(?!${scripts[key].exclude.join("$|")}$)` : "";
                    const locationRegex = new RegExp(`^${exclude}(${scripts[key].include?.join("|") || ".*"})$`, "i");

                    if (!options.href || locationRegex.test(options.href)) {
                        scripts[key].regex = locationRegex;
                        result[newKey] = scripts[key];
                    }
                } else if (typeof scripts[key] === "object" && scripts[key] !== null) {
                    flattenPathStructure(scripts[key], newKey, result);
                }
            }
            return result;
        }

        const mods = await this.getMods();
        let scripts = {};
        for (const mod of Object.values(mods)) {
            if (mod.enabled && (this.allowUnsafeJS || mod.origin === "store")) {
                scripts = {...scripts, ...flattenPathStructure(mod.scripts, mod.id)};
            }
        }

        scripts = Object.fromEntries(
            Object.entries(scripts)
                .sort(([, optionsA], [, optionsB]) => (optionsA.loadOrder || 10) - (optionsB.loadOrder || 10))
        );

        return scripts;
    },
};
