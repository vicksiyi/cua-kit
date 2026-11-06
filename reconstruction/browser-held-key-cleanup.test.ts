import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { originalServiceBindings, serviceSourceSha256 } from "./service-source";
import { createKeyboardDispatch } from "../packages/browser/src/service/input/keyboard_dispatch";
import {
  keyDescription,
  modifierKey,
  modifierMask,
  editingCommands,
  normalizeKeys,
  classifyClipboardKeys,
  clipboardShortcutError,
} from "../packages/browser/src/service/input/keyboard_keys";
assert.equal(
  serviceSourceSha256,
  "396d4bcd890e8e41e336469eb1a050bafd36bb2d91152b75bb22b70b56622021",
);
// Compare current dispatch/release control flow and CDP payloads. Key-map helpers
// are shared dependencies here; this suite does not establish key-map parity.
function reference(guard: any) {
  const raw = originalServiceBindings(
    ["bc", "wc", "L_", "q_", "yc", "U_", "ka"],
    {
      MY: "__codexIabExpectedInputTargetToken",
      pt: 3,
      F_: guard,
      Lf: keyDescription,
      Uf: modifierKey,
      Ra: modifierMask,
      FY: editingCommands,
      j_: normalizeKeys,
      jf: classifyClipboardKeys,
      Ni: clipboardShortcutError,
    },
  );
  return { dispatchKeys: raw.ka };
}
async function scenario(
  original: boolean,
  mode: string,
  protectedInput: boolean,
  nested: boolean,
) {
  const trace: any[] = [];
  const controller = new AbortController();
  let downs = 0,
    ups = 0,
    guards = 0;
  const guard = async (...args: any[]) => {
    trace.push(["guard", args.slice(1)]);
    if (mode === "guard-fails" && ++guards === 2)
      throw Error("protected focus");
  };
  const api = original ? reference(guard) : createKeyboardDispatch(guard);
  const send = async (kind: string, ...args: any[]) => {
    trace.push([kind, ...args]);
    const p = args[2];
    if (p.type !== "keyUp") {
      downs++;
      if (mode === "down-fails" && downs === 2) throw Error("dispatch failed");
      if (mode === "abort-down" && downs === 2)
        controller.abort(Error("cancelled"));
    } else {
      ups++;
      if (mode === "up-fails") throw Error(`release ${ups}`);
    }
  };
  const cdp: any = {
    platform: "linux",
    call: (...args: any[]) => send("call", ...args),
    callTarget: (...args: any[]) => send("target", ...args),
  };
  if (mode === "pre-abort") controller.abort(Error("cancelled"));
  let error: string | undefined;
  try {
    await api.dispatchKeys(
      cdp,
      nested ? { tabId: 1, sessionId: "child" } : 1,
      ["Control", "Shift", "a"],
      {
        durationMs: 0,
        signal: controller.signal,
        blockClosedShadowInput: protectedInput,
        inputTargetToken: "token",
        deadlineMs: 100,
      },
    );
  } catch (e: any) {
    error = e.message;
  }
  return { trace, error, downs, ups };
}
test("current held-key source matches reverse release, error priority, guards, cancellation and child targets", async () => {
  for (const mode of [
    "ok",
    "guard-fails",
    "down-fails",
    "up-fails",
    "abort-down",
    "pre-abort",
  ])
    for (const protect of [false, true])
      for (const nested of [false, true]) {
        const actual = await scenario(false, mode, protect, nested);
        assert.deepEqual(
          actual,
          await scenario(true, mode, protect, nested),
          `${mode}/${protect}/${nested}`,
        );
        if (mode === "up-fails") {
          assert.equal(actual.ups, 3);
          assert.equal(actual.error, "release 1");
        }
        if (mode === "pre-abort") assert.equal(actual.downs, 0);
      }
});
test("real Chromium releases a held chord when cancelled during its duration", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(
    `<input><script>window.events=[]; for(const name of ["keydown","keyup"]) document.addEventListener(name,e=>window.events.push([e.type,e.key,e.ctrlKey,e.shiftKey]));</script>`,
  );
  await page.locator("input").focus();
  const session = await page.context().newCDPSession(page);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  t.after(() => clearTimeout(timer));
  const cdp: any = {
    platform: "linux",
    call: async (_id: number, method: string, p: any) => {
      const result = await session.send(method as any, p);
      if (p.type !== "keyUp" && p.code === "KeyA")
        timer = setTimeout(() => controller.abort(Error("cancelled")), 20);
      return result;
    },
  };
  const api = createKeyboardDispatch(async () => {
    throw Error("Unexpected protected-input guard");
  });
  await assert.rejects(
    api.dispatchKeys(cdp, 1, ["Control", "Shift", "a"], {
      durationMs: 1000,
      signal: controller.signal,
    }),
    /cancelled/,
  );
  const observed = await page.evaluate(() => (window as any).events);
  assert.deepEqual(
    observed.map((e: any) => e.slice(0, 2)),
    [
      ["keydown", "Control"],
      ["keydown", "Shift"],
      ["keydown", "A"],
      ["keyup", "A"],
      ["keyup", "Shift"],
      ["keyup", "Control"],
    ],
  );
  assert.deepEqual(observed.at(-1).slice(2), [false, false]);
});
