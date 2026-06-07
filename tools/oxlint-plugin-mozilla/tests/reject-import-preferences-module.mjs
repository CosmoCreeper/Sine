/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

import rule from "../lib/rules/reject-import-preferences-module.mjs";
import { RuleTester } from "eslint";

const ruleTester = new RuleTester();

ruleTester.run("reject-import-preferences-module", rule, {
  valid: [
    '"resource://gre/modules/Foo.sys.mjs"',
    "42",
    `ChromeUtils.defineESModuleGetters(lazy, {
      Foo: "resource://gre/modules/Foo.sys.mjs",
    });`,
  ],
  invalid: [
    {
      code: '"resource://gre/modules/Preferences.sys.mjs"',
      errors: [{ messageId: "rejectPreferencesModule" }],
    },
    {
      code: `import { Preferences } from "resource://gre/modules/Preferences.sys.mjs";`,
      errors: [{ messageId: "rejectPreferencesModule" }],
    },
    {
      code: `ChromeUtils.defineESModuleGetters(lazy, {
        Preferences: "resource://gre/modules/Preferences.sys.mjs",
      });`,
      errors: [{ messageId: "rejectPreferencesModule" }],
    },
  ],
});
