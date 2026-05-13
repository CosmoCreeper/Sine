import { defineConfig } from "eslint/config";
import mozilla from "eslint-plugin-mozilla";
import noUnsanitizedPlugin from "eslint-plugin-no-unsanitized";

export default defineConfig([
  ...mozilla.configs["flat/recommended"],
  {
    ignores: [".browsercfg", "src/assets/imports"],
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { "no-unsanitized": noUnsanitizedPlugin },
    rules: {
      // All are rules that the mozilla config disables,
      // but we want them, so we enable them here.
      "no-inner-declarations": "error",
      "no-prototype-builtins": "error",
      "no-useless-escape": "error",

      // Every rule linting JS files needs to specify globals or disable it,
      // the mozilla plugin lints the globals for us, so we can just disable it here.
      "no-undef": "off",

      // Register a valid sanitizer/formatter
      "no-unsanitized/property": [
        "error",
        {
          escape: {
            methods: ["utils.formatLabel", "utils.escapeHTML"],
          },
        },
      ],
      "no-unsanitized/method": [
        "error",
        {
          escape: {
            methods: ["utils.formatLabel", "utils.escapeHTML"],
          },
        },
      ],

      // Use a smaller max complexity than Mozilla's default
      complexity: ["error", 20],
    },
  },
]);
