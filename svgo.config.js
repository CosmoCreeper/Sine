export default {
  plugins: [
    "removeMetadata",
    "removeEditorsNSData",
    "removeEmptyAttrs",
    "convertShapeToPath",
    "collapseGroups",
    "mergePaths",
    "removeXMLProcInst",
    "removeUnknownsAndDefaults",
    "removeUselessDefs",
    "reusePaths",
    "convertStyleToAttrs",
    {
      name: "removeAttrs",
      params: {
        attrs: ["version", "y", "x", "id"],
      },
    },
  ],
};
