/**
 * @file Main entrypoint for the MPL Oxlint plugin. This Source Code Form is subject to the terms of
 *   the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file,
 *   You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import packageData from "../package.json" with { type: "json" };

let plugin = {
  meta: { name: packageData.name, version: packageData.version },
  rules: {
    "require-mpl-header": (await import("./rules/require-mpl-header.mjs")).default,
  },
};

export default plugin;
