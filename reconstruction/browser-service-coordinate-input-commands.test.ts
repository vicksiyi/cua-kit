import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  CuaClickCommand as click,
  CuaDoubleClickCommand as doubleClick,
  CuaScrollCommand as scroll,
  CuaMoveCommand as move,
  CuaDragCommand as drag,
  CuaKeypressCommand as keypress,
  createCuaTypeCommand,
} from "../packages/browser/src/service/commands/coordinate_input";
import { dispatchClipboardKeypress } from "../packages/browser/src/service/clipboard/operations";
async function run(kind: string, original: boolean, mode: string) {
  const trace: any[] = [];
  const typeText: any = async (payload: any, _ctx: any, name: string) => {
    trace.push(["type", payload, name]);
  };
  const ref = originalServiceBindings(
    [
      "F",
      "W",
      "$y",
      "Ds",
      "vp",
      "ar",
      "Kr",
      "FA",
      "LA",
      "UA",
      "qA",
      "XA",
      "YA",
      "JA",
      "n_",
    ],
    { oo: dispatchClipboardKeypress, Hs: typeText },
  );
  const commands: any = {
    move: original ? ref.YA : move,
    drag: original ? ref.qA : drag,
    click: original ? ref.LA : click,
    double: original ? ref.UA : doubleClick,
    scroll: original ? ref.JA : scroll,
    key: original ? ref.XA : keypress,
    type: original ? ref.n_ : createCuaTypeCommand(typeText),
  };
  const input = (name: string) => async (payload: any) => {
    trace.push([name, payload]);
    if (mode === "input-error") throw Error("input failed");
  };
  const ctx: any = {
    runtime: { platform: mode === "mac" ? "darwin" : "linux" },
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
      clickPoint: input("click"),
      dragPath: input("drag"),
      async dispatchMouseMove(...args: any[]) {
        trace.push(["move", ...args]);
      },

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
    x: mode === "invalid-point" ? Infinity : -3.5,
    y: 8.25,
    button: mode === "invalid-button" ? 0 : 3,
    path:
      mode === "empty-path"
        ? []
        : [
            { x: 1, y: 2 },
            { x: mode === "invalid-point" ? NaN : 4, y: 5 },
          ],
    timeout_ms: 23,
    scroll_x: 5,
    scroll_y: -7,
    keys:
      mode === "string-keys" ? "ENTER" : ["ControlOrMeta", "Shift", "ENTER"],
    text: "fixture",
  };
  try {
    return { value: await commands[kind](payload, ctx), trace };
  } catch (e) {
    return { error: (e as Error).message, trace };
  }
}
test("Coordinate commands match original routing, authority and validation ordering", async () => {
  for (const kind of [
    "click",
    "double",
    "drag",
    "move",
    "scroll",
    "key",
    "type",
  ])
    for (const mode of [
      "normal",
      "denied",
      "invalid-tab",
      "input-error",
      "string-keys",
      "invalid-point",
      "invalid-button",
      "empty-path",
      "mac",
    ])
      assert.deepEqual(
        await run(kind, false, mode),
        await run(kind, true, mode),
        `${kind}/${mode}`,
      );
  assert.equal(
    (await run("drag", false, "empty-path")).error,
    "cua_drag requires a non-empty path",
  );
  assert.equal(
    (await run("click", false, "invalid-button")).error,
    "Unsupported CUA mouse button: 0",
  );
  assert.equal(
    (await run("move", false, "normal")).trace.some(
      (x) => Array.isArray(x) && x[0] === "follow",
    ),
    false,
  );
  const click = (await run("click", false, "mac")).trace.at(-1);
  assert.deepEqual(click, [
    "click",
    {
      button: "right",
      clickCount: 1,
      modifiers: 12,
      point: { x: -3.5, y: 8.25 },
      tabId: 7,
      timeoutMs: 10000,
    },
  ]);
  assert.equal(
    "button" in (await run("double", false, "normal")).trace.at(-1)[1],
    false,
  );
});
