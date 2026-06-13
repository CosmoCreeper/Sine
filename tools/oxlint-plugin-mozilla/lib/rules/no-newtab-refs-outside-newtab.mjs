/**
 * @file Reject use of chrome://newtab or resource://newtab from code outside of
 *   browser/extensions/newtab, browser/components/newtab, browser/modules/AboutNewTab.sys.mjs, and
 *   browser/actors/AboutNewTabChild.sys.mjs. This prevents coupling with the newtab codebase, which
 *   can update out band from the rest of the browser.
 * @license
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import path from "path";

const EXTENSION_FOLDER = path.join("browser", "extensions", "newtab");
const COMPONENT_FOLDER = path.join("browser", "components", "newtab");
const ABOUTNEWTAB_MODULE = path.join("browser", "modules", "AboutNewTab.sys.mjs");
const ABOUTNEWTABCHILD_ACTOR = path.join("browser", "actors", "AboutNewTabChild.sys.mjs");

export default {
  meta: {
    docs: {
      url: "https://firefox-source-docs.mozilla.org/code-quality/lint/linters/eslint-plugin-mozilla/rules/no-newtab-refs-outside-newtab.html",
    },
    messages: {
      noNewtabRefs:
        "> {{url}} is part of the newtab codebase and cannot be " +
        "used by code outside of browser/extensions/newtab, browser/components/newtab, " +
        "browser/modules/AboutNewTab.sys.mjs, or browser/actors/AboutNewTabChild.sys.mjs as " +
        "it may update out-of-band from the rest of the browser.",
    },
    schema: [],
    type: "suggestion",
  },

  create(context) {
    const filename = context.filename;

    // Hard-code some directories and files that should always be exempt.
    if (
      filename.includes(EXTENSION_FOLDER) ||
      filename.includes(COMPONENT_FOLDER) ||
      filename.endsWith(ABOUTNEWTAB_MODULE) ||
      filename.endsWith(ABOUTNEWTABCHILD_ACTOR)
    ) {
      return {};
    }

    return {
      Literal(node) {
        if (typeof node.value != "string") {
          return;
        }
        if (
          node.value.startsWith("chrome://newtab") ||
          node.value.startsWith("resource://newtab")
        ) {
          context.report({
            node,
            messageId: "noNewtabRefs",
            data: { url: node.value },
          });
        }
      },
    };
  },
};
