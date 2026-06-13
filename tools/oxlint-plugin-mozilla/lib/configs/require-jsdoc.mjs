/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["jsdoc"],
  // Fill in missing rules with eslint-plugin-jsdoc implementations
  jsPlugins: [{ name: "jsdoc-js", specifier: "eslint-plugin-jsdoc" }],
  rules: {
    "jsdoc-js/require-jsdoc": [
      "error",
      {
        require: {
          ClassDeclaration: true,
          FunctionDeclaration: true,
          MethodDefinition: true,
        },
        contexts: [
          "ExportNamedDeclaration > FunctionDeclaration",
          "ExportDefaultDeclaration > FunctionDeclaration",
          "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression",
          "ExportDefaultDeclaration > ArrowFunctionExpression",
          "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ObjectExpression Property[method=true]",
          "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ObjectExpression Property[kind=/^(get|set)$/]",
          "ExportDefaultDeclaration > ObjectExpression Property[method=true]",
          "ExportDefaultDeclaration > ObjectExpression Property[kind=/^(get|set)$/]",
          "Program > VariableDeclaration > VariableDeclarator > ObjectExpression Property[method=true]",
          "Program > VariableDeclaration > VariableDeclarator > ObjectExpression Property[kind=/^(get|set)$/]",
        ],
      },
    ],
    "jsdoc-js/require-file-overview": [
      "error",
      {
        tags: {
          file: {
            initialCommentsOnly: true,
            mustExist: true,
            preventDuplicates: true,
          },
        },
      },
    ],
    "jsdoc-js/require-description": "error",
    "jsdoc/require-param": "error",
    "jsdoc/require-param-name": "error",
    "jsdoc/require-param-type": "error",
    "jsdoc/require-property": "error",
    "jsdoc/require-property-description": "error",
    "jsdoc/require-property-name": "error",
    "jsdoc/require-property-type": "error",
    "jsdoc/require-returns": "error",
    "jsdoc/require-throws-type": "error",
    "jsdoc/require-yields": "error",
    "jsdoc/require-yields-type": "error",
    "jsdoc-js/require-asterisk-prefix": "error",
    "jsdoc-js/require-hyphen-before-param-description": ["error", "always"],
  },
});
