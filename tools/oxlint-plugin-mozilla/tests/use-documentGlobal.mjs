/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// ------------------------------------------------------------------------------
// Requirements
// ------------------------------------------------------------------------------

import rule from "../lib/rules/use-documentGlobal.mjs";
import { RuleTester } from "eslint";

const ruleTester = new RuleTester();

// ------------------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------------------

function invalidCode(code) {
  return {
    code,
    errors: [{ messageId: "useDocumentGlobal" }],
  };
}

ruleTester.run("use-documentGlobal", rule, {
  valid: [
    "aEvent.target.documentGlobal;",
    "this.DOMPointNode.documentGlobal.getSelection();",
    "windowToMessageManager(node.documentGlobal);",
  ],
  invalid: [
    invalidCode("aEvent.target.ownerDocument.defaultView;"),
    invalidCode("this.DOMPointNode.ownerDocument.defaultView.getSelection();"),
    invalidCode("windowToMessageManager(node.ownerDocument.defaultView);"),
  ],
});
