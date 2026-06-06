/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { defineConfig } from "oxlint";
import globals from "globals";
import privileged from "../environments/privileged.mjs";
import specific from "../environments/specific.mjs";
import sysmjs from "../environments/sysmjs.mjs";
import sjs from "../environments/sjs.mjs";

/**
 * The configuration is based on eslint:recommended config. It defines the
 * recommended rules for all files, as well as for rules relating to modules
 * and other module like files.
 *
 * The configuration intentionally does not specify the globals for the
 * majority of files. The globals will only be specified for Mozilla specific
 * files (e.g. system modules). The subscriber to this configuration is expect
 * to include the correct globals that they require in their project.
 *
 * The details for all the ESLint rules, and which ones are in the ESLint
 * recommended configuration can be found here:
 *
 * https://eslint.org/docs/rules/
 *
 * Rules that we've explicitly decided not to enable:
 *
 *   require-atomic-updates - bug 1551829.
 *     - This generates too many false positives that are not easy to work
 *       around, and false positives seem to be inherent in the rule.
 *   max-depth
 *      - Don't enforce the maximum depth that blocks can be nested. The
 *        complexity rule is a better rule to check this.
 */

export default defineConfig({
  env: {
    builtin: true,
  },
  categories: {
    correctness: "error",
    suspicious: "error",
    perf: "error",
  },
  plugins: ["unicorn", "oxc", "eslint", "promise"],
  jsPlugins: ["oxlint-plugin-eslint"],
  rules: {
    "require-await": "error",

    // This may conflict with formatters, so we turn it off.
    "arrow-body-style": "off",

    // Warn about cyclomatic complexity in functions.
    complexity: ["error", { max: 20 }],

    // Functions must always return something or nothing
    "consistent-return": "error",

    // Encourage the use of dot notation whenever possible.
    "dot-notation": "error",

    // Maximum depth callbacks can be nested.
    "max-nested-callbacks": ["error", { max: 10 }],

    "mozilla/avoid-removeChild": "error",
    "mozilla/import-browser-window-globals": "error",
    "mozilla/import-globals": "error",
    "mozilla/no-compare-against-boolean-literals": "error",
    "mozilla/no-cu-reportError": "error",
    "mozilla/no-define-cc-etc": "error",
    "mozilla/no-throw-cr-literal": "error",
    "mozilla/no-useless-parameters": "error",
    "mozilla/no-useless-removeEventListener": "error",
    "mozilla/prefer-boolean-length-check": "error",
    "mozilla/prefer-formatValues": "error",
    "mozilla/reject-addtask-only": "error",
    "mozilla/reject-contenttask-spawn": "error",
    "mozilla/reject-import-preferences-module": "error",
    "mozilla/reject-importGlobalProperties": ["error", "allownonwebidl"],
    "mozilla/reject-multiple-await": "error",
    "mozilla/reject-multiple-getters-calls": "error",
    "mozilla/reject-scriptableunicodeconverter": "warn",
    "mozilla/rejects-requires-await": "error",
    "mozilla/use-cc-etc": "error",
    "mozilla/use-chromeutils-generateqi": "error",
    "mozilla/use-console-createInstance": "error",
    "mozilla/use-default-preference-values": "error",
    "mozilla/use-documentGlobal": "error",
    "mozilla/use-includes-instead-of-indexOf": "error",
    "mozilla/use-isInstance": "error",
    "mozilla/use-returnValue": "error",
    "mozilla/use-services": "error",
    "mozilla/valid-lazy": "error",
    "mozilla/valid-services": "error",

    // Use [] instead of Array()
    "no-array-constructor": "error",

    // Disallow use of arguments.caller or arguments.callee.
    "no-caller": "error",

    // Disallow the use of console, except for errors and warnings.
    "no-console": ["error", { allow: ["createInstance", "error", "warn"] }],

    // Disallows expressions where the operation doesn't affect the value.
    // TODO: This is enabled by default in ESLint's v9 recommended configuration.
    "no-constant-binary-expression": "error",

    // If an if block ends with a return no need for an else block
    "no-else-return": "error",

    // No empty statements
    "no-empty": ["error", { allowEmptyCatch: true }],

    // Disallow empty static blocks.
    // This rule will be a recommended rule in ESLint v9 so may be removed
    // when we upgrade to that.
    "no-empty-static-block": "error",

    // Disallow eval and setInteral/setTimeout with strings
    "no-eval": "error",

    // Disallow unnecessary calls to .bind()
    "no-extra-bind": "error",

    // Disallow fallthrough of case statements
    "no-fallthrough": [
      "error",
      {
        // The eslint rule doesn't allow for case-insensitive regex option.
        // The following pattern allows for a dash between "fall through" as
        // well as alternate spelling of "fall thru". The pattern also allows
        // for an optional "s" at the end of "fall" ("falls through").
        commentPattern:
          "[Ff][Aa][Ll][Ll][Ss]?[\\s-]?([Tt][Hh][Rr][Oo][Uu][Gg][Hh]|[Tt][Hh][Rr][Uu])",
      },
    ],

    // Disallow eval and setInteral/setTimeout with strings
    "no-implied-eval": "error",

    // Disallow the use of the __iterator__ property
    "no-iterator": "error",

    // No labels
    "no-labels": "error",

    // Disallow unnecessary nested blocks
    "no-lone-blocks": "error",

    // No single if block inside an else block
    "no-lonely-if": "error",

    // Nested ternary statements are confusing
    "no-nested-ternary": "error",

    // Disallow new operators with global non-constructor functions.
    // This rule will be a recommended rule in ESLint v9 so may be removed
    // when we upgrade to that.
    "no-new-native-nonconstructor": "error",

    // Disallow use of new wrappers
    "no-new-wrappers": "error",

    // Use {} instead of new Object(), unless arguments are passed.
    "no-object-constructor": "error",

    // Disable builtinGlobals for no-redeclare as this conflicts with our
    // globals declarations especially for browser window.
    "no-redeclare": ["error", { builtinGlobals: false }],

    // Disallow use of event global.
    "no-restricted-globals": ["error", "event"],

    // No unnecessary comparisons
    "no-self-compare": "error",

    // No comma sequenced statements
    "no-sequences": "error",

    // No declaring variables from an outer scope
    "no-shadow": "error",

    // Disallow throwing literals (eg. throw "error" instead of
    // throw new Error("error")).
    "no-throw-literal": "error",

    // Disallow the use of Boolean literals in conditional expressions.
    "no-unneeded-ternary": "error",

    // No unsanitized use of innerHTML=, document.write() etc.
    // cf. https://github.com/mozilla/eslint-plugin-no-unsanitized#rule-details
    // Uses custom methods that Sine provides, highly specialized.
    "eslint-js/no-restricted-syntax": [
      "error",
      {
        selector:
          "AssignmentExpression[operator=/^(\\+=|=||\\|&=|&&=|\\?\\?=)$/][left.property.name=/^(innerHTML|outerHTML)$/]:not([right.type='Literal']):not([right.type='TemplateLiteral'][right.expressions.length=0]):not([right.type='CallExpression'][right.callee.type='MemberExpression'][right.callee.object.name='utils'][right.callee.property.name=/^(formatLabel|escapeHTML)$/])",
        message:
          "Unsafe assignment to innerHTML/outerHTML using dynamic variables. Wrap the payload in utils.formatLabel() or utils.escapeHTML().",
      },
      {
        selector:
          "CallExpression[callee.property.name='insertAdjacentHTML']:not([arguments.1.type='Literal']):not([arguments.1.type='TemplateLiteral'][arguments.1.expressions.length=0]):not([arguments.1.type='CallExpression'][arguments.1.callee.type='MemberExpression'][arguments.1.callee.object.name='utils'][arguments.1.callee.property.name=/^(formatLabel|escapeHTML)$/])",
        message:
          "Unsafe usage of insertAdjacentHTML with dynamic content. The second argument must be wrapped in utils.formatLabel() or utils.escapeHTML().",
      },
      {
        selector:
          "CallExpression[callee.property.name=/^(createContextualFragment|setHTMLUnsafe)$/]:not([arguments.0.type='Literal']):not([arguments.0.type='TemplateLiteral'][arguments.0.expressions.length=0]):not([arguments.0.type='CallExpression'][arguments.0.callee.type='MemberExpression'][arguments.0.callee.object.name='utils'][arguments.0.callee.property.name=/^(formatLabel|escapeHTML)$/])",
        message:
          "Unsafe DOM manipulation using variables. The argument must be wrapped in utils.formatLabel() or utils.escapeHTML().",
      },
      {
        selector:
          "CallExpression[callee.object.name='document'][callee.property.name=/^(write|writeln)$/]:not([arguments.0.type='Literal']):not([arguments.0.type='TemplateLiteral'][arguments.0.expressions.length=0]):not([arguments.0.type='CallExpression'][arguments.0.callee.type='MemberExpression'][arguments.0.callee.object.name='utils'][arguments.0.callee.property.name=/^(formatLabel|escapeHTML)$/])",
        message:
          "Unsafe usage of document.write() with dynamic variables. The argument must be wrapped in utils.formatLabel() or utils.escapeHTML().",
      },
      {
        selector:
          "ImportExpression:not([source.value=/^(chrome|resource):\\/\\//]):not([source.type='Literal']):not([source.type='TemplateLiteral'][source.expressions.length=0])",
        message:
          "Dynamic import() expressions must be audited for unsanitized path strings when using variables.",
      },
    ],

    // Disallow unused private class members.
    // This rule will be a recommended rule in ESLint v9 so may be removed
    // when we upgrade to that.
    "no-unused-private-class-members": "error",

    // No declaring variables that are never used
    "no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        caughtErrors: "none",
        vars: "local",
      },
    ],

    // No using variables before defined
    // "no-use-before-define": ["error", "nofunc"],

    // Disallow unnecessary .call() and .apply()
    "no-useless-call": "error",

    // Don't concatenate string literals together (unless they span multiple
    // lines)
    "no-useless-concat": "error",

    // Disallow redundant return statements
    "no-useless-return": "error",

    // Require object-literal shorthand with ES6 method syntax
    "object-shorthand": ["error", "always", { avoidQuotes: true }],

    // This may conflict with prettier, so turn it off.
    // Errors out in oxlint?
    // "prefer-arrow-callback": "off",

    // Not passing anything to .catch/.then doesn't work, error:
    "promise/valid-params": "error",

    "mozilla/no-insecure-url": [
      "error",
      {
        exceptions: [
          "^http:\\/\\/localhost?.*",
          "^http:\\/\\/127\\.0\\.0\\.1?.*",
          // Exempt xmlns urls
          "^http:\\/\\/www\\.w3\\.org?.*",
          "^http:\\/\\/www\\.mozilla\\.org\\/keymaster\\/gatekeeper?.*",
        ],
        varExceptions: ["insecure?.*"],
      },
    ],
  },
  overrides: [
    {
      files: ["**/*.sys.mjs"],
      globals: {
        // System mjs files files are not loaded in the browser scope,
        // so we don't use that environment. Though we do have our own special
        // environment for them.
        ...privileged.globals,
        ...specific.globals,
        ...sysmjs.globals,
      },
      rules: {
        "mozilla/lazy-getter-object-name": "error",
        "mozilla/reject-eager-module-in-lazy-getter": "error",
        "mozilla/reject-globalThis-modification": "error",
        // For all system modules, we expect no properties to need importing,
        // hence reject everything.
        "mozilla/reject-importGlobalProperties": ["error", "everything"],
        "mozilla/reject-mixing-eager-and-lazy": "error",
        "mozilla/reject-top-level-await": "error",
      },
    },
    {
      files: ["**/*.mjs", "**/*.jsx", "**/?(*.)worker.?(m)js", "**/?(*.)serviceworker.?(m)js"],
      rules: {
        // We enable builtinGlobals for modules and workers due to their
        // contained scopes.
        "no-redeclare": ["error", { builtinGlobals: true }],
        "no-shadow": ["error", { allow: ["event"], builtinGlobals: true }],
        // Modules and workers are far easier to check for no-unused-vars on a
        // global scope, than our content files. Hence we turn that on here.
        "no-unused-vars": [
          "error",
          {
            argsIgnorePattern: "^_",
            caughtErrors: "none",
            vars: "all",
          },
        ],
      },
    },
    {
      files: ["**/*.mjs"],
      excludeFiles: ["**/*.sys.mjs"],
      rules: {
        "mozilla/reject-import-system-module-from-non-system": "error",
        "mozilla/reject-lazy-imports-into-globals": "error",
      },
    },
    {
      files: ["**/*.mjs", "**/*.jsx"],
      rules: {
        "mozilla/use-static-import": "error",
      },
    },
    {
      files: ["**/*.sjs"],
      globals: { ...sjs.globals },
      rules: {
        // For sjs files, reject everything as we should update the sandbox
        // to include the globals we need, as these are test-only files.
        "mozilla/reject-importGlobalProperties": ["error", "everything"],
      },
    },
    {
      files: [
        // Most files should use the `.worker.` format to be consistent with
        // other items like `.sys.mjs`, but we allow simply calling the file
        // "worker" as well.
        "**/?(*.)worker.?(m)js",
      ],
      globals: { ...globals.worker },
    },
    {
      files: [
        // Most files should use the `.serviceworker.` format to be consistent
        // with other items like `.sys.mjs`, but we allow simply calling the file
        // "serviceworker" as well.
        "**/?(*.)serviceworker.?(m)js",
      ],
      globals: { ...globals.serviceworker },
    },
  ],
});
