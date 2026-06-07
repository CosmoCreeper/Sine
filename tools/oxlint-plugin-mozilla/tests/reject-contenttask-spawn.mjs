/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

import rule from "../lib/rules/reject-contenttask-spawn.mjs";
import { RuleTester } from "eslint";

const ruleTester = new RuleTester();

function invalidError() {
  return [{ messageId: "rejectContentTaskSpawn" }];
}

ruleTester.run("reject-contenttask-spawn", rule, {
  valid: ["SpecialPowers.spawn(browser, [], () => {})", "ContentTask.someOtherMethod()"],
  invalid: [
    {
      code: "ContentTask.spawn(browser, [], () => {})",
      errors: invalidError(),
    },
    {
      code: "await ContentTask.spawn(browser, args, async () => {})",
      errors: invalidError(),
    },
  ],
});
