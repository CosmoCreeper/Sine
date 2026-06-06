export default {
  multipass: true,
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
    "convertStyleToAttrs",
    {
      name: "cleanupNumericValues",
      params: {
        floatPrecision: 2,
      },
    },
    {
      name: "convertPathData",
      params: {
        floatPrecision: 2,
      },
    },
    "cleanupIds",
    {
      name: "removeAttrs",
      params: {
        attrs: ["version", "x", "y", "xml:space", "xmlns:xlink"],
      },
    },
    "removeViewBox",
  ],
};
