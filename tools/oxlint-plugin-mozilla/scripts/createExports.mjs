/**
 * @file A script to export the known globals to a file.
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// This is a non-production script.
/* eslint-disable no-console */

import fsPromises from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import plugin from "../lib/index.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const toolsDir = path.join(__dirname, "../../");

const globalsFile = path.join(
  toolsDir,
  "oxlint-plugin-mozilla",
  "lib",
  "environments",
  "saved-globals.json"
);

console.log("Copying services.json");

const shipServicesFile = path.join(toolsDir, "oxlint-plugin-mozilla", "lib", "services.json");

await fsPromises.writeFile(
  shipServicesFile,
  await fetch(
    "https://hg.mozilla.org/mozilla-central/raw-file/tip/tools/lint/eslint/eslint-plugin-mozilla/lib/services.json"
  ).then((res) => res.text())
);

console.log("Generating globals file");

// Export the environments.
await fsPromises.writeFile(globalsFile, JSON.stringify({ environments: plugin.environments }));

console.log("Globals file generation complete");
