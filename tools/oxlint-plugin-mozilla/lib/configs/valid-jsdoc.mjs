/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["jsdoc"],
  // Fill in missing rules with eslint-plugin-jsdoc implementations
  jsPlugins: [{ name: "jsdoc-js", specifier: "eslint-plugin-jsdoc" }],
  rules: {
    "jsdoc/check-access": "error",
    "jsdoc-js/check-param-names": "error",
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
    "jsdoc-js/check-types": "error",
    "jsdoc-js/check-syntax": "error",
    "jsdoc-js/imports-as-dependencies": "error",
    "jsdoc-js/no-undefined-types": "error",
    "jsdoc/empty-tags": "error",
    "jsdoc-js/multiline-blocks": "error",
    "jsdoc-js/no-bad-blocks": "error",
    "jsdoc-js/no-multi-asterisks": ["error", { allowWhitespace: true }],
    "jsdoc-js/reject-function-type": "error",
    "jsdoc/require-param-type": "error",
    "jsdoc/require-returns-type": "error",
    "jsdoc-js/tag-lines": ["error", "any", { startLines: 1 }],
    "jsdoc-js/valid-types": "error",
  },

  settings: {
    jsdoc: {
      mode: "typescript",
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
        virtual: "abstract",
        extends: "extends",
        constructor: "constructor",
      },
      /* eslint-enable sort-keys */
    },
  },
});
