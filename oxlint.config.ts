/**
 * @file Oxlint configuration. This Source Code Form is subject to the terms of the Mozilla Public
 *   License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at
 *   http://mozilla.org/MPL/2.0/.
 */

import { defineConfig } from "oxlint";
import type { OxlintConfig, OxlintGlobals } from "oxlint";
import mozilla from "./tools/oxlint-plugin-mozilla/lib/index.mjs";
import browserWindow from "./tools/oxlint-plugin-mozilla/lib/environments/browser-window.mjs";

const mozillaConfig = (mozilla.configs as Record<string, OxlintConfig>)["flat/recommended"];
const requireJsdoc = (mozilla.configs as Record<string, OxlintConfig>)["flat/require-jsdoc"];
const validJsdoc = (mozilla.configs as Record<string, OxlintConfig>)["flat/valid-jsdoc"];

const browserGlobals = browserWindow.globals as OxlintGlobals;

export default defineConfig({
  extends: [mozillaConfig, validJsdoc, requireJsdoc],
  jsPlugins: [
    "./tools/oxlint-plugin-mozilla/lib/index.mjs",
    "./tools/oxlint-plugin-mpl/lib/index.mjs",
  ],
  rules: {
    "oxlint-plugin-mpl/require-mpl-header": "error",
  },
  overrides: [
    {
      files: ["tests/**/*.test.js"],
      // Browsercfg supplies isolated privileged script scopes, not Mozilla's
      // import-globals directives. That rule also relies on ESLint scope internals
      // absent from Oxlint; keep all other test lint rules enabled.
      rules: { "mozilla/import-globals": "off" },
      globals: { it: "readonly" },
    },
    {
      files: ["src/core/settings.mjs"],
      globals: {
        gCategoryInits: "readonly",
      },
    },
    {
      files: ["src/core/browser.mjs", "src/services/updates.mjs"],
      globals: Object.assign({}, browserGlobals, { gZenMods: "readonly" }),
    },
  ],
  ignorePatterns: ["src/assets/imports/"],
});
