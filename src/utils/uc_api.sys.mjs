/**
 * @file Common utilties API for userscripts and Sine. This Source Code Form is subject to the terms
 *   of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file,
 *   You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";
import Toast from "./toasts.sys.mjs";

/** A group of common userscript-related utilities. */
const utils = {
  os: AppConstants.platform.slice(0, 3),
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

  /** Restarts Firefox. */
  restart() {
    // eslint-disable-next-line no-bitwise
    Services.startup.quit(Ci.nsIAppStartup.eRestart | Ci.nsIAppStartup.eAttemptQuit);
  },

  /**
   * Generates a UUID with a custom number of groups, chracters per group, and character selection.
   *
   * @param {number} groupLength - Number of characters per group.
   * @param {number} numGroups - Number of groups where each group is deliminated by a dash. (e.g.
   *   {group}-{group})
   * @param {string} chars - Range of characters to choose from.
   * @returns {string} Generated UUID.
   */
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

/** A group of utilities designed for managing about:config preferences. */
const prefs = {
  /**
   * Returns the value of a preference.
   *
   * @param {string} pref - Preference to fetch the value of.
   * @returns {string | number | boolean} Value of the preference.
   */
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

  /**
   * Sets the value of a preference.
   *
   * @param {string} pref - Preference to set.
   * @param {string | number | boolean} value - Value to set it to.
   */
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

  /**
   * Opens a path in the system's native file explorer.
   *
   * @param {string} path - Path to open.
   */
  showInFileManager(path) {
    const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);

    file.initWithPath(path);

    if (!file.exists()) {
      throw new Error(`Path does not exist: ${path}`);
    }

    if (file.isFile()) {
      file.reveal();
    } else if (file.isDirectory()) {
      file.launch();
    }
  },

  /**
   * Displays a toast in all main browser windows.
   *
   * @param {object} options - Options for the toast.
   */
  showToast(options) {
    const windows = Services.wm.getEnumerator("navigator:browser");
    while (windows.hasMoreElements()) {
      // eslint-disable-next-line no-new
      new Toast(options, windows.getNext());
    }
  },

  /**
   * Fetches a URL, and parses to JSON if possible. WARNING: This function can lead to unexpected
   * results if the data parses to JSON instead of expected text. Two new functions that assert
   * either text or JSON must be developed in the future.
   *
   * @param {string} url - URL to fetch.
   * @returns {string | object | Array} Parsed data.
   */
  async fetch(url) {
    const response = await fetch(url)
      .then((res) => res.text())
      .catch((err) => console.warn(err));

    try {
      return JSON.parse(response);
    } catch {}

    return response;
  },

  /**
   * Downloads and unpacks a remote archive (zip).
   *
   * @param {object} options - Options to use.
   * @returns {Array} Entries in the zip.
   */
  async unpackRemoteArchive(options) {
    const resp = await fetch(options.url);
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    await IOUtils.write(options.zipPath, bytes);

    const zipFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    zipFile.initWithPath(options.zipPath);

    const zipReader = Cc["@mozilla.org/libjar/zip-reader;1"].createInstance(Ci.nsIZipReader);
    zipReader.open(zipFile);

    const targetDir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    targetDir.initWithPath(options.extractDir);

    const zipEntries = [];

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

      if (!origEntryName.endsWith("/")) {
        zipEntries.push(entryName);
      }

      if (!entryName) {
        continue;
      }

      if (origEntryName.endsWith("/")) {
        const dirFile = targetDir.clone();
        for (const segment of segments) {
          dirFile.append(segment);
          if (!dirFile.exists()) dirFile.create(Ci.nsIFile.DIRECTORY_TYPE, 0o0777);
        }
        continue;
      }

      const parentDir = targetDir.clone();
      for (let i = 0; i < segments.length - 1; i++) {
        parentDir.append(segments[i]);
        if (!parentDir.exists()) parentDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o0777);
      }

      const outFile = parentDir.clone();
      outFile.append(segments.at(segments.length - 1));

      zipReader.extract(origEntryName, outFile);
      // https://bugzilla.mozilla.org/show_bug.cgi?id=935553
      outFile.permissions = 0o0666;
    }

    zipReader.close();

    IOUtils.remove(options.zipPath);

    return zipEntries;
  },
};
