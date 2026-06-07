/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { defineConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";
import mozilla from "./tools/oxlint-plugin-mozilla/lib/index.mjs";

const mozillaConfig = (mozilla.configs as Record<string, OxlintConfig>)["flat/recommended"];

export default defineConfig({
  extends: [mozillaConfig],
  plugins: ["jsdoc"],
  jsPlugins: [
    "./tools/oxlint-plugin-mozilla/lib/index.mjs",
    "./tools/oxlint-plugin-mpl/lib/index.mjs",
  ],
  overrides: [
    {
      files: ["**/*.{tsx,ts,mjs,js,jsx,cjs}"],
      rules: {
        "oxlint-plugin-mpl/require-mpl-header": "error",
      },
    },
  ],
  ignorePatterns: ["src/assets/imports/"],
});
