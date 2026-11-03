import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { originalServiceBindings } from "./service-source.ts";
import { clipboardInstallationScript } from "../packages/browser/dist/service/context/clipboard_page.js";
const original = originalServiceBindings(["gie", "bie", "IL"]).IL;
function environment(script: (name: string) => string, mode: string) {
  const requests: any[] = [],
    listeners = new Map();
  const old = () => "native";
  let clipboard: any =
    mode === "absent"
      ? undefined
      : { read: old, readText: old, write: old, writeText: old };
  if (mode === "prototype") {
    clipboard = Object.preventExtensions(Object.create({ ...clipboard }));
  }
  const nav: any = {};
  if (clipboard)
    Object.defineProperty(nav, "clipboard", {
      configurable: true,
      value: clipboard,
    });
  const context: any = {
    navigator: nav,
    Blob,
    Uint8Array,
    ArrayBuffer,
    atob,
    btoa,
    DOMException,
    document: { querySelectorAll: () => [] },
    HTMLIFrameElement: class {},
    HTMLFrameElement: class {},
    addEventListener: (name: string, fn: any) => listeners.set(name, fn),
    removeEventListener: (name: string) => listeners.delete(name),
  };
  const ctx = vm.createContext(context);
  context.binding = (payload: string) => {
    const request = JSON.parse(payload);
    requests.push(request);
    context.__browserUseClipboardBridge.respond(
      JSON.stringify({
        id: request.id,
        ok: true,
        items: [
          {
            entries: [
              { mime_type: "text/plain", text: "hello" },
              { mime_type: "application/octet-stream", base64: "AQI=" },
            ],
          },
        ],
      }),
    );
  };
  vm.runInContext(script("binding"), ctx);
  return { ctx, context, requests, listeners, nav, old, clipboard };
}
test("page clipboard script preserves reads, writes, binary conversion and receiver checks", async () => {
  async function run(script: any) {
    const e = environment(script, "absent"),
      clip = e.nav.clipboard;
    const text = await clip.readText();
    const items = await clip.read();
    const bytes = [
      ...new Uint8Array(
        await (
          await items[0].getType("application/octet-stream")
        ).arrayBuffer(),
      ),
    ];
    let missing;
    try {
      await items[0].getType("missing");
    } catch (error) {
      missing = (error as Error).name;
    }
    await clip.write(items);
    await clip.write([]);
    await clip.writeText(42);
    const errors = [];
    for (const fn of [
      () => clip.write(),
      () => clip.writeText(),
      () => clip.readText.call({}),
    ])
      try {
        await fn();
      } catch (error) {
        errors.push((error as Error).message);
      }
    e.context.__browserUseClipboardBridge.cleanup();
    return {
      text,
      bytes,
      missing,
      errors,
      requests: e.requests,
      restored: !Object.hasOwn(e.nav, "clipboard"),
      listeners: e.listeners.size,
    };
  }
  assert.deepEqual(await run(clipboardInstallationScript), await run(original));
});
test("page clipboard patching restores own or prototype methods without replacing original identity", async () => {
  async function run(script: any, mode: string) {
    const e = environment(script, mode);
    const same = e.nav.clipboard === e.clipboard;
    const text = await e.nav.clipboard.readText();
    e.context.__browserUseClipboardBridge.cleanup();
    return {
      same,
      text,
      restored: e.nav.clipboard.read === e.old,
      own: Object.hasOwn(e.nav.clipboard, "read"),
      requests: e.requests,
    };
  }
  for (const mode of ["own", "prototype"])
    assert.deepEqual(
      await run(clipboardInstallationScript, mode),
      await run(original, mode),
    );
});
test("page clipboard cleanup rejects pending requests and preserves later method overrides", async () => {
  async function run(script: any) {
    const e = environment(script, "own");
    e.context.__browserUseClipboardBridge.cleanup();
    e.context.binding = () => {};
    vm.runInContext(script("binding"), e.ctx);
    const clip = e.nav.clipboard;
    const pending = clip.readText().then(
      () => "resolved",
      (error: any) => error.message,
    );
    const replacement = () => "later";
    clip.read = replacement;
    e.context.__browserUseClipboardBridge.cleanup();
    return {
      result: await pending,
      override: clip.read === replacement,
      binding: "binding" in e.context,
      bridge: "__browserUseClipboardBridge" in e.context,
    };
  }
  assert.deepEqual(await run(clipboardInstallationScript), await run(original));
});
