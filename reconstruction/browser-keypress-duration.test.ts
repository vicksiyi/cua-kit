import test from "node:test";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { CUAAPI } from "../packages/browser/src/cua";
import { CuaKeypress } from "../packages/browser/src/commands/cua_input";
import { CuaKeypressCommand } from "../packages/browser/src/service/commands/coordinate_input";
import { defineCommand } from "../packages/browser/src/service/commands/define_command";
import { BrowserInput } from "../packages/browser/src/service/input/index";
import { positiveTabId } from "../packages/browser/src/service/tab_id";
import { dispatchClipboardKeypress } from "../packages/browser/src/service/clipboard/operations";
import {
  originalServiceBindings,
  serviceSourceSha256,
  serviceClassWithMethods,
  serviceClassMethod,
} from "./service-source";
assert.equal(
  serviceSourceSha256,
  "396d4bcd890e8e41e336469eb1a050bafd36bb2d91152b75bb22b70b56622021",
);
const original = originalServiceBindings(["TD"], {
  O: defineCommand,
  ee: { CuaKeypress },
  bo: dispatchClipboardKeypress,
}).TD;
const inputClass = serviceClassWithMethods([
  "dispatchKeyPress",
  "clickPoint",
  "dragPath",
]);
const OriginalInput = new Function(
  "ka",
  "H",
  `return class {${serviceClassMethod(inputClass, "dispatchKeyPress")}}`,
);

test("keypress service matches current duration validation, authorization and seconds-to-ms ordering", async () => {
  async function run(command: any, duration: unknown, denied: boolean) {
    const trace: any[] = [];
    const ctx: any = {
      security: {
        currentTabUrl: async (id: number) => {
          trace.push(["url", id]);
          return "https://fixture.test";
        },
      },
      acquireAuthority: () => ({
        actInFrame: (url: string) => ({
          assert: async () => {
            trace.push(["assert", url]);
            if (denied) throw Error("denied");
          },
        }),
      }),
      followSessionTab: async (id: number) => {
        trace.push(["follow", id]);
      },
      cdp: { platform: "linux" },
      cua: {
        dispatchKeyPress: async (input: unknown) => {
          trace.push(["dispatch", input]);
        },
      },
    };
    try {
      return {
        value: await command({ tab_id: "7", keys: ["Enter"], duration }, ctx),
        trace,
      };
    } catch (e: any) {
      return { error: e.message, trace };
    }
  }
  for (const duration of [
    undefined,
    0,
    0.001,
    0.25,
    30,
    31,
    -1,
    Infinity,
    NaN,
    "1",
    null,
  ])
    for (const denied of [false, true])
      assert.deepEqual(
        await run(CuaKeypressCommand, duration, denied),
        await run(original, duration, denied),
      );
});

test("BrowserInput forwards hold duration exactly as the installed input method", async () => {
  for (const durationMs of [undefined, 0, 25, 30000]) {
    const expected: any[] = [],
      actual: any[] = [];
    const Ref = OriginalInput(
      async (...args: any[]) => expected.push(args),
      positiveTabId,
    );
    const ref = new Ref();
    ref.cdp = {};
    ref.blockClosedShadowInput = true;
    const { createInputClass } =
      await import("../packages/browser/src/service/input/input");
    const Local = createInputClass({
      dispatchKeys: async (...args: any[]) => {
        actual.push(args);
      },
    } as any);
    const local = new Local(ref.cdp, {} as any, undefined, true);
    const request = {
      commandName: "cua_keypress",
      tabId: "7",
      keys: ["Enter"],
      durationMs,
    };
    await ref.dispatchKeyPress(request);
    await local.dispatchKeyPress(request);
    assert.deepEqual(actual, expected);
  }
});

test("composed service and keyboard dispatcher hold keydown before keyup", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(
    `<input autofocus><script>window.observed=[]; for(const kind of ["keydown","keyup"]) document.addEventListener(kind,e=>window.observed.push({type:e.type,key:e.key,at:performance.now()}));</script>`,
  );
  await page.locator("input").focus();
  const session = await page.context().newCDPSession(page);
  const events: { method: string; payload: any; at: number }[] = [];
  const cdp: any = {
    platform: "linux",
    call: async (_target: unknown, method: string, payload: any) => {
      events.push({ method, payload, at: performance.now() });
      return session.send(method as any, payload);
    },
  };
  const input = new BrowserInput(cdp, {} as any);
  const ctx: any = {
    security: { currentTabUrl: async () => "https://fixture.test" },
    acquireAuthority: () => ({
      actInFrame: () => ({ assert: async () => {} }),
    }),
    followSessionTab: async () => {},
    cdp,
    cua: input,
  };
  const api = new CUAAPI({
    browserId: "owned",
    tabId: "7",
    transport: {
      send: async ({ command, timeoutMs }: any) => {
        assert.equal(timeoutMs, 2030);
        return CuaKeypressCommand(command.parse(), ctx);
      },
    } as any,
  });
  await api.keypress({ keys: ["Enter"], duration: 0.03 });
  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map((e) => e.method),
    ["Input.dispatchKeyEvent", "Input.dispatchKeyEvent"],
  );
  assert.deepEqual(
    events.map((e) => e.payload.type),
    ["keyDown", "keyUp"],
  );
  assert(
    events[1].at - events[0].at >= 20,
    "hold interval must reach real keyboard dispatch",
  );
  const observed = await page.evaluate(() => (window as any).observed);
  assert.deepEqual(
    observed.map((e: any) => [e.type, e.key]),
    [
      ["keydown", "Enter"],
      ["keyup", "Enter"],
    ],
  );
  assert(
    observed[1].at - observed[0].at >= 20,
    "actual page must observe the held key",
  );
});
