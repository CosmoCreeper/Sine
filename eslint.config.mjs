import json from "@eslint/json";
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
            methods: ["utils.formatLabel"],
          },
        },
      ],
    },
  },
  { files: ["**/*.json"], plugins: { json }, language: "json/json" },
]);
