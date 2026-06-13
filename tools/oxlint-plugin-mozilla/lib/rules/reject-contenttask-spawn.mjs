/**
 * @file Reject calls to ContentTask.spawn in favour of SpecialPowers.spawn.
 * @license
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

function isIdentifier(node, id) {
  return node && node.type === "Identifier" && node.name === id;
}

export default {
  meta: {
    docs: {
      url: "https://firefox-source-docs.mozilla.org/code-quality/lint/linters/eslint-plugin-mozilla/rules/reject-contenttask-spawn.html",
    },
    messages: {
      rejectContentTaskSpawn: "ContentTask.spawn is deprecated. Use SpecialPowers.spawn instead.",
    },
    schema: [],
    type: "problem",
  },

  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type === "MemberExpression" &&
          isIdentifier(node.callee.object, "ContentTask") &&
          isIdentifier(node.callee.property, "spawn")
        ) {
          context.report({
            node,
            messageId: "rejectContentTaskSpawn",
          });
        }
      },
    };
  },
};
