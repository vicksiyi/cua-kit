import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import { javaScriptDialogTree } from "../packages/browser/src/service/accessibility/dialog_tree";
const original = originalServiceBindings(["Lt", "q2"]);
test("AX synthetic dialog trees preserve original roles, properties, focus and control identities", () => {
  for (const type of ["alert", "confirm", "prompt", "beforeunload"])
    for (const url of [
      "https://example.com:8443/path",
      "file:///page",
      "invalid",
      "",
    ])
      for (const title of [undefined, null, "", "标题"])
        for (const promptText of [undefined, "", "输入"]) {
          const dialog = {
              id: "dialog:1",
              type,
              url,
              message: "Message",
              promptText,
            },
            tab = { title };
          assert.deepEqual(
            javaScriptDialogTree(tab, dialog),
            original.q2(tab, dialog),
          );
        }
});
