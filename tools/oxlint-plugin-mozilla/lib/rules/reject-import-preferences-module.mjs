/**
 * @file Reject use of the deprecated Preferences.sys.mjs module.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export default {
  meta: {
    docs: {
      url: "https://firefox-source-docs.mozilla.org/code-quality/lint/linters/eslint-plugin-mozilla/rules/reject-import-preferences-module.html",
    },
    messages: {
      rejectPreferencesModule:
        "Preferences.sys.mjs is deprecated. Use Services.prefs directly instead.",
    },
    schema: [],
    type: "problem",
  },

  create(context) {
    return {
      Literal(node) {
        if (typeof node.value != "string") {
          return;
        }
        /* eslint-disable-next-line mozilla/reject-import-preferences-module */
        if (node.value == "resource://gre/modules/Preferences.sys.mjs") {
          context.report({ node, messageId: "rejectPreferencesModule" });
        }
      },
    };
  },
};
