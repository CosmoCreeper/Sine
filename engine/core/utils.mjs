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
        return this.cosine ? "Cosine" : "Sine";
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
            return await IOUtils.readJSON(PathUtils.join(this.getModFolder(mod.id), "preferences.json"));
        } catch (err) {
            ucAPI.showToast({
                title: "Failed to read mod preferences.",
                description: `Please remove and reinstall ${mod.name}.`,
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

            if (!processes || processes.some((process) => process === win.location.pathname)) {
                pages.push(win);
            }

            if (win.location.pathname === "/content/browser.xhtml" && win.gBrowser?.tabs) {
                for (const tab of win.gBrowser.tabs) {
                    const contentWindow = tab.linkedBrowser.contentWindow;
                    const urlPathname = contentWindow?.location?.pathname;
                    if (!processes || processes.some((process) => process === urlPathname)) {
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

    formatLabel(label) {
        return label
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
            .replace(/\n/g, "<br>");
    },

    convertPathsToNestedStructure(paths) {
        const result = [];
        const directoryMap = new Map();

        for (const path of paths) {
            const parts = path.split("/");

            if (parts.length === 1) {
                result.push(path);
            } else {
                const fileName = parts[parts.length - 1];
                const dirPath = parts.slice(0, -1).join("/");

                if (!directoryMap.has(dirPath)) {
                    directoryMap.set(dirPath, []);
                }
                directoryMap.get(dirPath).push(fileName);
            }
        }

        const processedDirs = new Set();

        for (const [dirPath, files] of directoryMap.entries()) {
            const topLevelDir = dirPath.split("/")[0];

            if (processedDirs.has(topLevelDir)) {
                continue;
            }

            const relatedPaths = Array.from(directoryMap.keys()).filter(
                (path) => path.startsWith(topLevelDir + "/") || path === topLevelDir
            );

            if (relatedPaths.length === 1 && relatedPaths[0].split("/").length === 1) {
                result.push({
                    directory: topLevelDir,
                    contents: directoryMap.get(topLevelDir),
                });
            } else {
                const buildNestedStructure = (rootDir, directoryMap, relatedPaths) => {
                    const contents = [];

                    if (directoryMap.has(rootDir)) {
                        contents.push(...directoryMap.get(rootDir));
                    }

                    const subdirs = new Map();
                    for (const path of relatedPaths) {
                        if (path !== rootDir && path.startsWith(rootDir + "/")) {
                            const relativePath = path.substring(rootDir.length + 1);
                            const firstDir = relativePath.split("/")[0];

                            if (!subdirs.has(firstDir)) {
                                subdirs.set(firstDir, []);
                            }

                            if (relativePath.includes("/")) {
                                subdirs.get(firstDir).push(rootDir + "/" + relativePath);
                            } else {
                                subdirs.get(firstDir).push(...directoryMap.get(path));
                            }
                        }
                    }

                    for (const [subdir, items] of subdirs.entries()) {
                        const hasNestedDirs = items.some((item) => typeof item === "string" && item.includes("/"));

                        if (hasNestedDirs) {
                            const nestedPaths = items.filter((item) => typeof item === "string" && item.includes("/"));
                            const directFiles = items.filter((item) => typeof item === "string" && !item.includes("/"));

                            const nestedStructure = buildNestedStructure(
                                rootDir + "/" + subdir,
                                directoryMap,
                                nestedPaths
                            );
                            if (directFiles.length > 0) {
                                nestedStructure.contents.unshift(...directFiles);
                            }
                            contents.push(nestedStructure);
                        } else {
                            contents.push({
                                directory: subdir,
                                contents: items,
                            });
                        }
                    }

                    return {
                        directory: rootDir,
                        contents: contents,
                    };
                };

                const nestedStructure = buildNestedStructure(topLevelDir, directoryMap, relatedPaths);
                result.push(nestedStructure);
            }

            processedDirs.add(topLevelDir);
        }

        return result;
    },
};
