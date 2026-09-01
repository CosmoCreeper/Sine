/**
 * @file Asserts that necessary paths are defined.
 * @license
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// Ensure the chrome.manifest and path for Sine is valid
it("Sine path exists", () => {
  // Will fail if the path is invalid
  ChromeUtils.importESModule("chrome://userscripts/content/sine.sys.mjs");
});
