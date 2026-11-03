import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import { DomCuaClick } from "../packages/browser/src/commands/cua_input";
import {
  DomCuaClickCommand as click,
  DomCuaDoubleClickCommand as doubleClick,
  DomCuaScrollCommand as scroll,
  DomCuaKeypressCommand as keypress,
  createDomCuaTypeCommand,
  domInputNode,
} from "../packages/browser/src/service/commands/dom_input";
import { dispatchClipboardKeypress } from "../packages/browser/src/service/clipboard/operations";
async function run(kind: string, original: boolean, mode: string) {
  const trace: any[] = [];
  const typeText: any = async (payload: any, _ctx: any, name: string) => {
    trace.push(["type", payload, name]);
  };
  const ref = originalServiceBindings(
    ["F", "W", "AN", "Nh", "CN", "PN", "RN", "IN", "kN", "yte", "Tv"],
    { oe: { DomCuaClick }, oo: dispatchClipboardKeypress, Hs: typeText },
  );
  const commands: any = {
    click: original ? ref.PN : click,
    double: original ? ref.RN : doubleClick,
    scroll: original ? ref.kN : scroll,
    key: original ? ref.IN : keypress,
    type: original ? ref.Tv : createDomCuaTypeCommand(typeText),
  };
  const input = (name: string) => async (payload: any) => {
    trace.push([name, payload]);
    if (mode === "input-error") throw Error("input failed");
  };
  const ctx: any = {
    acquireAuthority() {
      trace.push("authority");
      return {
        actInFrame(url: string) {
          trace.push(["act", url]);
          return {
            async assert() {
              trace.push("assert");
              if (mode === "denied") throw Error("denied");
            },
          };
        },
      };
    },
    security: {
      async currentTabUrl(id: number) {
        trace.push(["url", id]);
        return "https://fixture.test/";
      },
    },
    async followSessionTab(id: number) {
      trace.push(["follow", id]);
    },
    cua: {
      clickDomCuaNode: input("click"),
      scrollDomCuaNode: input("scroll-node"),
      scrollPoint: input("scroll-point"),
      dispatchKeyPress: input("keys"),
    },
    cdp: {
      platform: "linux",
      async call(id: number, method: string) {
        trace.push(["cdp", id, method]);
        return { cssVisualViewport: { clientWidth: 801, clientHeight: 601 } };
      },
    },
  };
  const payload: any = {
    tab_id: mode === "invalid-tab" ? 0 : "7",
    node_id:
      mode === "absent" ? undefined : mode === "invalid-node" ? null : "42",
    timeout_ms: 23,
    scroll_x: 5,
    scroll_y: -7,
    keys: mode === "string-keys" ? "ENTER" : ["ENTER"],
    text: "fixture",
  };
  try {
    return { value: await commands[kind](payload, ctx), trace };
  } catch (e) {
    return { error: (e as Error).message, trace };
  }
}
test("DOM input commands preserve original authority, validation and input routing", async () => {
  for (const kind of ["click", "double", "scroll", "key", "type"])
    for (const mode of [
      "normal",
      "denied",
      "absent",
      "invalid-node",
      "invalid-tab",
      "input-error",
      "string-keys",
    ])
      assert.deepEqual(
        await run(kind, false, mode),
        await run(kind, true, mode),
        `${kind}/${mode}`,
      );
  const result = await run("scroll", false, "absent");
  assert.deepEqual(result.trace.at(-1), [
    "scroll-point",
    {
      modifiers: 0,
      point: { x: 400.5, y: 300.5 },
      scrollX: 5,
      scrollY: -7,
      tabId: 7,
    },
  ]);
  assert.equal(
    (await run("click", false, "absent")).error,
    "dom_cua_click requires node_id",
  );
});
test("DOM node validation preserves optional absence and original schema errors", () => {
  const original = originalServiceBindings(["AN", "Nh", "CN"], {
    oe: { DomCuaClick },
  });
  const outcome = (fn: () => unknown) => {
    try {
      return { value: fn() };
    } catch (e) {
      return { error: (e as Error).message };
    }
  };
  for (const required of [true, false])
    for (const value of [
      undefined,
      null,
      0,
      1,
      -1,
      "",
      "0",
      "1",
      "42",
      "001",
      "1.5",
      "abc",
      {},
      [],
    ])
      assert.deepEqual(
        outcome(() => domInputNode(value, "fixture", required)),
        outcome(() => (required ? original.Nh : original.CN)(value, "fixture")),
      );
});
