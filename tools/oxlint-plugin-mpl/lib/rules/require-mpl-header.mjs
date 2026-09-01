/**
 * @file Defines the MPL header enforcement rule.
 * @license
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
  /**
   * Returns main program for Oxlint.
   *
   * @param {object} context - Data of location plugin is running in.
   * @returns {object} Object with main plugin program.
   */
  create(context) {
    return {
      /**
       * Processes the root Program node of the AST.
       *
       * @param {object} node - The root AST node representing the file.
       */
      Program(node) {
        const sourceCode = context.getSourceCode();
        const rawText = sourceCode.getText();
        const topOfFile = rawText.slice(0, 1200);

        const normalizedTop = topOfFile
          // Strip shebangs
          .replace(/^#![^\r\n]*/u, "")
          // Strip standard comments
          .replaceAll(/\/\*|\*\/|\/\/|\*/gu, "")
          .replaceAll(/\s+/gu, " ")
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
              end: { line: 2, column: 0 },
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
            if (/\n\s*\n\s*\n/u.test(commentText)) {
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
