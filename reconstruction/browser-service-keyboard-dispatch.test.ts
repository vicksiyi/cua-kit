import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import { createKeyboardDispatch } from "../packages/browser/src/service/input/keyboard_dispatch";
const names = [
  "gt",
  "B5",
  "D5",
  "O5",
  "M5",
  "N5",
  "F5",
  "L5",
  "Jy",
  "$y",
  "vp",
  "Ds",
  "Sp",
  "bl",
  "Yy",
  "P5",
  "R5",
  "xp",
  "I5",
  "$A",
  "k5",
  "Tp",
  "di",
  "gl",
  "Os",
  "Ky",
  "Xy",
  "zA",
  "Ep",
  "zy",
  "hl",
  "A5",
];
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (error: any) {
    return { error: error?.message };
  }
}
function setup(original: boolean, mode: string, platform = "darwin") {
  const trace: any[] = [],
    controller = new AbortController();
  let dispatched = 0,
    guards = 0;
  const guard = async (_cdp: any, ...args: any[]) => {
    trace.push(["guard", args]);
    if (mode === "guard-fails" && ++guards === 2)
      throw new Error("protected focus");
  };
  const raw = original
    ? originalServiceBindings(names, { Vy: guard })
    : undefined;
  const api = raw
    ? {
        Keyboard: raw.gl,
        dispatchKeys: raw.Os,
        withHeldKeys: raw.Ky,
        dispatchTextCharacter: raw.zA,
      }
    : createKeyboardDispatch(guard);
  const send = async (kind: string, ...args: any[]) => {
    trace.push([kind, args]);
    dispatched++;
    if (mode === "down-fails" && dispatched === 2)
      throw new Error("dispatch failed");
    if (mode === "up-fails" && args[2]?.type === "keyUp")
      throw new Error("release failed");
    if (mode === "abort" && dispatched === 2)
      controller.abort(new Error("cancelled"));
  };
  const cdp = {
    platform,
    call: (...args: any[]) => send("call", ...args),
    callTarget: (...args: any[]) => send("target", ...args),
  };
  return { api, trace, controller, cdp };
}
async function sequence(
  original: boolean,
  mode: string,
  protectedInput: boolean,
  duration: boolean,
  nested: boolean,
) {
  const { api, trace, controller, cdp } = setup(original, mode);
  const result = await outcome(() =>
    api.dispatchKeys(
      cdp,
      nested ? { tabId: 1, sessionId: "frame" } : 1,
      ["Control", "Shift", "a"],
      {
        inputTargetToken: "expected",
        deadlineMs: 100,
        blockClosedShadowInput: protectedInput,
        ...(duration ? { durationMs: 0, signal: controller.signal } : {}),
      },
    ),
  );
  return { result, trace };
}
test("key dispatch matches protected/unprotected cleanup, nested targets, tokens, hold callbacks and abort failures", async () => {
  for (const mode of ["ok", "down-fails", "up-fails", "guard-fails", "abort"])
    for (const protect of [true, false])
      for (const duration of [true, false])
        for (const nested of [true, false])
          assert.deepEqual(
            await sequence(false, mode, protect, duration, nested),
            await sequence(true, mode, protect, duration, nested),
          );
});
async function characters(original: boolean, platform: string) {
  const { api, trace, cdp } = setup(original, "ok", platform);
  const results = [];
  for (const text of ["a", "A", "\n", "\t", "😀", "汉", "ab", ""])
    results.push(
      await outcome(() =>
        api.dispatchTextCharacter(cdp, 1, text, {
          blockClosedShadowInput: true,
        }),
      ),
    );
  for (const keys of [
    "Ctrl+c",
    "Shift+Insert",
    "",
    "ControlOrMeta+a",
    "Alt+ArrowLeft",
  ])
    results.push(await outcome(() => api.dispatchKeys(cdp, 1, keys)));
  return { results, trace };
}
test("character input and shortcut rejection preserve Unicode fallback, known key events and platform editing commands", async () => {
  for (const platform of ["darwin", "linux", "win32"])
    assert.deepEqual(
      await characters(false, platform),
      await characters(true, platform),
    );
});
async function keyboard(original: boolean) {
  const { api, trace, cdp } = setup(original, "ok"),
    keyboard = new api.Keyboard(cdp, { tabId: 1 }, undefined, undefined, false);
  const states = [];
  for (const key of ["Shift", "a", "Control", "a"]) {
    await keyboard.down(key);
    states.push([keyboard.modifiers, [...keyboard.pressedModifiers]]);
  }
  for (const key of ["a", "Control", "a", "Shift"]) await keyboard.up(key);
  await keyboard.insertText("text");
  return {
    trace,
    states,
    keys: Object.keys(keyboard),
    methods: Object.getOwnPropertyNames(api.Keyboard.prototype)
      .filter((name) => name !== "constructor")
      .map((name) => {
        const d = Object.getOwnPropertyDescriptor(
          api.Keyboard.prototype,
          name,
        )!;
        return [name, d.value?.length, d.get?.length];
      }),
  };
}
test("keyboard state retains modifier text suppression and original field/method shape", async () => {
  assert.deepEqual(await keyboard(false), await keyboard(true));
});
