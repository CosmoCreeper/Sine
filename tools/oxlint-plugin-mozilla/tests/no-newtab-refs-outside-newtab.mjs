/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

import rule from "../lib/rules/no-newtab-refs-outside-newtab.mjs";
import { RuleTester } from "eslint";
import path from "path";

const ruleTester = new RuleTester();

function invalidCode(code, url) {
  return {
    code,
    errors: [
      {
        messageId: "noNewtabRefs",
        data: { url },
      },
    ],
  };
}

function validCodeInAllowedPath(code, filename) {
  return {
    code,
    filename,
  };
}

ruleTester.run("no-newtab-refs-outside-newtab", rule, {
  valid: [
    // Valid: Usage within browser/extensions/newtab/
    validCodeInAllowedPath(
      'import foo from "resource://newtab/lib/ActivityStream.sys.mjs"',
      path.join("path", "to", "browser", "extensions", "newtab", "lib", "SomeFile.sys.mjs")
    ),
    validCodeInAllowedPath(
      'ChromeUtils.importESModule("resource://newtab/common/Actions.mjs")',
      path.join(
        "path",
        "to",
        "browser",
        "extensions",
        "newtab",
        "test",
        "unit",
        "test_something.js"
      )
    ),
    validCodeInAllowedPath(
      'Services.wm.getMostRecentWindow("chrome://newtab/content/newtab.xhtml")',
      path.join("path", "to", "browser", "extensions", "newtab", "lib", "Feed.sys.mjs")
    ),

    // Valid: Usage within browser/components/newtab/
    validCodeInAllowedPath(
      'const ActivityStream = "resource://newtab/lib/ActivityStream.sys.mjs"',
      path.join(
        "path",
        "to",
        "browser",
        "components",
        "newtab",
        "AboutNewTabResourceMapping.sys.mjs"
      )
    ),
    validCodeInAllowedPath(
      'ChromeUtils.defineESModuleGetters(lazy, {"ActivityStream": "resource://newtab/lib/ActivityStream.sys.mjs"})',
      path.join("path", "to", "browser", "components", "newtab", "SomeComponent.sys.mjs")
    ),

    // Valid: Usage in AboutNewTab.sys.mjs
    validCodeInAllowedPath(
      'ActivityStream: "resource://newtab/lib/ActivityStream.sys.mjs"',
      path.join("path", "to", "browser", "modules", "AboutNewTab.sys.mjs")
    ),

    // Valid: Usage in AboutNewTabChild.sys.mjs
    validCodeInAllowedPath(
      '"resource://newtab/data/content/activity-stream.bundle.js"',
      path.join("path", "to", "browser", "actors", "AboutNewTabChild.sys.mjs")
    ),

    // Valid: Other chrome/resource URIs that don't match newtab
    'import foo from "chrome://global/content/aboutAbout.html"',
    'ChromeUtils.importESModule("resource://gre/modules/AppConstants.sys.mjs")',
    'import foo from "resource://app/modules/SomeModule.sys.mjs"',
    'Services.wm.getMostRecentWindow("chrome://browser/content/browser.xhtml")',
  ],

  invalid: [
    // Invalid: chrome://newtab usage in other directories
    invalidCode(
      'import foo from "chrome://newtab/content/newtab.xhtml"',
      "chrome://newtab/content/newtab.xhtml"
    ),
    invalidCode(
      'Services.wm.getMostRecentWindow("chrome://newtab/content/newtab.xhtml")',
      "chrome://newtab/content/newtab.xhtml"
    ),

    // Invalid: resource://newtab usage in various modules
    invalidCode(
      'ChromeUtils.importESModule("resource://newtab/lib/ActivityStream.sys.mjs")',
      "resource://newtab/lib/ActivityStream.sys.mjs"
    ),
    invalidCode(
      'const ActivityStream = "resource://newtab/lib/ActivityStream.sys.mjs"',
      "resource://newtab/lib/ActivityStream.sys.mjs"
    ),
    invalidCode(
      'ChromeUtils.defineESModuleGetters(lazy, {"TopSitesFeed": "resource://newtab/lib/TopSitesFeed.sys.mjs"})',
      "resource://newtab/lib/TopSitesFeed.sys.mjs"
    ),
    invalidCode(
      'import { ActivityStream } from "resource://newtab/lib/ActivityStream.sys.mjs"',
      "resource://newtab/lib/ActivityStream.sys.mjs"
    ),
  ],
});
