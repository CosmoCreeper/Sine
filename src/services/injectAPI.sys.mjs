/**
 * @file Injects Sine store and Zen Mods store window actors. This Source Code Form is subject to
 *   the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with
 *   this file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

try {
  ChromeUtils.registerWindowActor("SineModsMarketplace", {
    parent: {
      esModuleURI: "chrome://userscripts/content/actors/MarketplaceParent.sys.mjs",
    },
    child: {
      esModuleURI: "chrome://userscripts/content/actors/MarketplaceChild.sys.mjs",
      events: {
        DOMContentLoaded: {},
      },
    },
    matches: [
      "https://sineorg.github.io/store/*",
      "https://zen-browser.app/*",
      "https://share.zen-browser.app/*",
    ],
  });
} catch (err) {
  console.warn(`Failed to register JSWindowActor: ${err}`);
}
