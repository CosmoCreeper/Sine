/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Parent config file for all mochitest files.

import globals from "globals";
import browserWindow from "../environments/browser-window.mjs";

export default {
  languageOptions: {
    globals: {
      // All globals made available in the test environment.
      ...globals.browser,
      ...browserWindow.globals,

      // SpecialPowers is injected into the window object via SimpleTest.js
      SpecialPowers: "readonly",
      afterEach: "readonly",
      beforeEach: "readonly",
      describe: "readonly",
      extractJarToTmp: "readonly",
      getChromeDir: "readonly",
      getJar: "readonly",
      getResolvedURI: "readonly",
      getRootDirectory: "readonly",
      it: "readonly",
    },
  },

  name: "mozilla/chrome-test",

  rules: {
    // We mis-predict globals for HTML test files in directories shared
    // with browser tests.
    "mozilla/no-redeclare-with-import-autofix": "off",
  },
};
