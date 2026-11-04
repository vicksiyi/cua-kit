import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { create_tinysky_vision_only as restored } from "../packages/cua/src/tinysky_vision_only/create_tinysky_vision_only";
const root = process.env.CUA_VENDOR_ROOT ?? "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const original = (await import(pathToFileURL(`${root}/cua/dist/lib/js/oai_js_cua/src/tinysky_vision_only/create_tinysky_vision_only.js`).href)).create_tinysky_vision_only;

async function run(factory: any, mode: string) {
  const trace: unknown[] = [];
  const prior = (globalThis as any).nodeRepl;
  let pending = false;
  const computer = Object.fromEntries(["click", "drag", "scroll", "press_key"].map(name => [name, async (args: unknown) => {
    assert.equal(pending, false, "input operations must be sequential");
    pending = true;
    trace.push([name, args]);
    await Promise.resolve();
    pending = false;
    if (mode === "key-error" && name === "press_key") throw Error("input failed");
    return "operation-result";
  }]));
  computer.get_screenshot = async () => mode === "empty" ? [] : [{ bytes: new Uint8Array([1, 2, 3]) }];
  (globalThis as any).nodeRepl = { emitImage: async (bytes: Uint8Array) => {
    trace.push(["image", [...bytes]]);
    if (mode === "emit-error") throw Error("display failed");
  }};
  try {
    const api = factory(computer);
    trace.push(["screenshot", [...await api.screenshot()]]);
    trace.push(await api.click([10, 20]));
    trace.push(await api.click([10, 20], { mouseButton: "right", clickCount: 2 }));
    trace.push(await api.drag([1, 2], [3, 4]));
    trace.push(await api.scroll([5, 6], "down"));
    for (const pixels of [12, 0, -1, Infinity, NaN]) {
      try { trace.push(await api.scroll([5, 6], "up", { pixels })); }
      catch (error) { trace.push(String(error)); }
    }
    await api.typeText("a AZ+~");
    for (const text of ["", "中文", "a\nb", "é", "\u007f"]) {
      try { await api.typeText(text); trace.push(["typed", text]); }
      catch (error) { trace.push(String(error)); }
    }
    trace.push(await api.pressKey("ctrl+a"));
  } catch (error) { trace.push(String(error)); }
  finally {
    if (prior === undefined) delete (globalThis as any).nodeRepl;
    else (globalThis as any).nodeRepl = prior;
  }
  return trace;
}
for (const mode of ["normal", "empty", "emit-error", "key-error"]) {
  test(`vision-only matches installed source: ${mode}`, async () => {
    assert.deepEqual(await run(restored, mode), await run(original, mode));
  });
}
