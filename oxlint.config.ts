import { defineConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";
import mozilla from "./tools/oxlint-plugin-mozilla/lib/index.mjs";

const mozillaConfig = (mozilla.configs as Record<string, OxlintConfig>)["flat/recommended"];

export default defineConfig({
  extends: [mozillaConfig],
  plugins: ["jsdoc"],
  jsPlugins: ["./tools/oxlint-plugin-mozilla/lib/index.mjs"],
  ignorePatterns: ["src/assets/imports/"],
});
