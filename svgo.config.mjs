/**
 * @file Defines SVGO config for maximum SVG optimization. This Source Code Form is subject to the
 *   terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this
 *   file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

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
