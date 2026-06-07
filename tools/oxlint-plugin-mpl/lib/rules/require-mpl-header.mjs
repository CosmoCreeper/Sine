/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export default {
  meta: {
    type: "suggestion",
    docs: {
      description: "Enforce MPL 2.0 license header at the top of necessary files.",
      category: "Legalities",
      recommended: false,
    },
  },
  create(context) {
    return {
      Program(node) {
        const sourceCode = context.getSourceCode();
        const rawText = sourceCode.getText();
        const topOfFile = rawText.slice(0, 1200);

        const normalizedTop = topOfFile
          // Strip shebangs
          .replace(/^#![^\r\n]*/, "")
          // Strip standard comments
          .replace(/\/\*|\*\/|\/\/|\*/g, "")
          .replace(/\s+/g, " ")
          .trim();

        const expectedPhrases = [
          "This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.",
          // Strip out the // from http:// to match weirdly normalized top
          "If a copy of the MPL was not distributed with this file, You can obtain one at http:mozilla.org/MPL/2.0/.",
        ];

        const hasFirstPart = normalizedTop.includes(expectedPhrases[0]);
        const hasSecondPart = normalizedTop.includes(expectedPhrases[1]);

        if (!hasFirstPart || !hasSecondPart) {
          context.report({
            node,
            loc: {
              start: { line: 1, column: 0 },
              end: { line: 3, column: 0 },
            },
            message: "Missing MPL 2.0 license header.",
          });
          return;
        }

        const leadingComments = sourceCode.getCommentsBefore(node);

        if (leadingComments.length !== 0) {
          const licenseComment = leadingComments.find((comment) => {
            const value = comment.value.toLowerCase();
            return value.includes("mozilla public license") || value.includes("mpl");
          });

          if (licenseComment) {
            const commentText = licenseComment.value;
            if (/\n\s*\n\s*\n/.test(commentText)) {
              context.report({
                node,
                loc: {
                  start: { line: 1, column: 0 },
                  end: { line: 3, column: 0 },
                },
                message: "MPL license header contains too many blank lines between sections.",
              });
            }
          }
        }
      },
    };
  },
};
