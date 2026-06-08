/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["jsdoc"],
  rules: {
    "jsdoc/check-access": "error",
    // Handled by prettier
    // "jsdoc/check-alignment": "error",
    "jsdoc/check-param-names": "error",
    "jsdoc/check-property-names": "error",
    "jsdoc/check-tag-names": [
      "error",
      {
        definedTags: [
          // Used to record backwards compatibility handling for newtab, devtools
          // and other code.
          "backward-compat",
          // jsdoc doesn't have this, but it seems reasonable to allow documentation
          // of rejections.
          "rejects",
          // Tags supported by the custom elements manifest analyzer.
          // https://custom-elements-manifest.open-wc.org/analyzer/getting-started/#supported-jsdoc
          "attribute",
          "default",
          "csspart",
          "cssproperty",
          "cssState",
          "property",
          "slot",
          "summary",
          "tagname",
        ],
      },
    ],
    "jsdoc/check-types": "error",
    "jsdoc/empty-tags": "error",
    "jsdoc/multiline-blocks": "error",
    "jsdoc/no-bad-blocks": "error",
    "jsdoc/no-multi-asterisks": ["error", { allowWhitespace: true }],
    "jsdoc/reject-function-type": "error",
    "jsdoc/require-param-type": "error",
    "jsdoc/require-returns-type": "error",
    "jsdoc/tag-lines": ["error", "any", { startLines: 1 }],
    "jsdoc/valid-types": "error",
  },

  settings: {
    jsdoc: {
      /* eslint-disable sort-keys */
      tagNamePreference: {
        // We allow "return" or "returns" and "yield" or "yields" as they are
        // similar variations, for other tag names we prefer the version that
        // the JSDoc specification defines.
        return: "return",
        yield: "yield",
        // For the custom elements manifest analyzer, we prefer the long forms
        // as they are more descriptive.
        attr: "attribute",
        prop: "property",
        part: "csspart",
        cssprop: "cssproperty",
        tag: "tagname",
      },
      /* eslint-enable sort-keys */
    },
  },
});
