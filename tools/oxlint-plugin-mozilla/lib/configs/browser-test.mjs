/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Parent config file for all browser-chrome files.

import globals from "globals";
import browserWindow from "../environments/browser-window.mjs";
import simpleTest from "../environments/simpletest.mjs";

export default {
  languageOptions: {
    globals: {
      ...globals.browser,
      ...browserWindow.globals,
      ...simpleTest.globals,
      // `$` is defined in SimpleTest.js
      $: "readonly",
      Assert: "readonly",
      BrowserTestUtils: "readonly",
      ContentTask: "readonly",
      EventUtils: "readonly",
      IOUtils: "readonly",
      PathUtils: "readonly",
      PromiseDebugging: "readonly",
      SpecialPowers: "readonly",
      TestUtils: "readonly",
      addLoadEvent: "readonly",
      add_setup: "readonly",
      add_task: "readonly",
      afterEach: "readonly",
      beforeEach: "readonly",
      content: "readonly",
      describe: "readonly",
      executeSoon: "readonly",
      expectUncaughtException: "readonly",
      export_assertions: "readonly",
      extractJarToTmp: "readonly",
      finish: "readonly",
      gTestPath: "readonly",
      getChromeDir: "readonly",
      getJar: "readonly",
      getResolvedURI: "readonly",
      getRootDirectory: "readonly",
      getTestFilePath: "readonly",
      ignoreAllUncaughtExceptions: "readonly",
      info: "readonly",
      is: "readonly",
      isnot: "readonly",
      it: "readonly",
      ok: "readonly",
      record: "readonly",
      registerCleanupFunction: "readonly",
      requestLongerTimeout: "readonly",
      stringContains: "readonly",
      stringMatches: "readonly",
      testSignal: "readonly",
      todo: "readonly",
      todo_is: "readonly",
      todo_isnot: "readonly",
      waitForClipboard: "readonly",
      waitForExplicitFinish: "readonly",
      waitForFocus: "readonly",
    },
  },

  name: "mozilla/browser-test",

  rules: {
    "mozilla/no-addtask-setup": "error",
    "mozilla/no-comparison-or-assignment-inside-ok": "error",
    "mozilla/no-redeclare-with-import-autofix": ["error", { errorForNonImports: false }],
  },
};
