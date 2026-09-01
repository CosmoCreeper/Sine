/**
 * @file Prevents using insecure URLs.
 * @license
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

const DEFAULT_EXCEPTIONS = [
  "^http:\\/\\/mochi\\.test?.*",
  "^http:\\/\\/mochi\\.xorigin-test?.*",
  "^http:\\/\\/localhost?.*",
  "^http:\\/\\/127\\.0\\.0\\.1?.*",
  "^http:\\/\\/www\\.w3\\.org?.*",
  "^http:\\/\\/www\\.mozilla\\.org\\/keymaster\\/gatekeeper?.*",
  "^ws:?.*",
  "^ftp:?.*",
];

const DEFAULT_VAR_EXCEPTIONS = ["insecure?.*"];

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Flag insecure URLs and protocols while allowing specific Mozilla/local exceptions.",
    },
    schema: [
      {
        type: "object",
        properties: {
          exceptions: { type: "array", items: { type: "string" } },
          varExceptions: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      insecureUrl:
        "The URL '{{ url }}' uses an insecure protocol. Use HTTPS or a secure alternative instead.",
    },
  },
  create(context) {
    const options = context.options[0] || {};
    const exceptions = (options.exceptions || DEFAULT_EXCEPTIONS).map((p) => new RegExp(p, "i"));
    const varExceptions = (options.varExceptions || DEFAULT_VAR_EXCEPTIONS).map(
      (p) => new RegExp(p, "i")
    );

    const insecureProtocolRegex = /^(http|ftp|ws):\/\//i;

    function isExempt(url) {
      return exceptions.some((regex) => regex.test(url));
    }

    function isVarExempt(varName) {
      return varExceptions.some((regex) => regex.test(varName));
    }

    return {
      Literal(node) {
        if (typeof node.value !== "string") return;

        const url = node.value.trim();

        if (insecureProtocolRegex.test(url) && !isExempt(url)) {
          if (
            node.parent &&
            node.parent.type === "VariableDeclarator" &&
            node.parent.id.type === "Identifier"
          ) {
            if (isVarExempt(node.parent.id.name)) {
              return;
            }
          }

          context.report({
            node,
            messageId: "insecureUrl",
            data: { url },
          });
        }
      },

      TemplateLiteral(node) {
        // Evaluate static parts of template strings (quasis)
        const firstQuasi = node.quasis[0]?.value.cooked;
        if (firstQuasi && insecureProtocolRegex.test(firstQuasi) && !isExempt(firstQuasi)) {
          context.report({
            node,
            messageId: "insecureUrl",
            data: { url: firstQuasi + "..." },
          });
        }
      },
    };
  },
};
