/* import-globals-from import-globals-from-1-additional.js */
/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// importScripts should not be handled, as this is not in a worker environment.
// eslint-disable-next-line no-undef
importScripts(
  "/tests/tools/lint/eslint/eslint-plugin-mozilla/tests/globals-data/import-globals-from-2.js"
);

ChromeUtils.defineESModuleGetters(this, {
  foo: "resource:///bar.sys.mjs",
});

var foo1 = 1;
