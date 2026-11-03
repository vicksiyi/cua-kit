import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source.ts";
import {
  createClipboardClass,
  validateClipboardItems,
} from "../packages/browser/dist/service/context/clipboard.js";
const helpers = originalServiceBindings(["_ie", "wie", "yie", "vie"]);
function original(Bridge: any) {
  return originalServiceBindings(["Eg"], { ...helpers, xg: Bridge }).Eg;
}
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
test("clipboard entry validation and projection retain exact original precedence", async () => {
  for (const input of [
    null,
    [],
    [{}],
    [{ entries: [], presentation_style: "bad" }],
    [{ entries: [{}], presentation_style: "bad" }],
    [{ entries: [{ mime_type: "" }] }],
    [
      {
        entries: [{ mime_type: "text/plain", text: "", base64: 42, extra: 1 }],
        extra: 2,
      },
    ],
    [{ entries: [{ mime_type: "a", base64: "YQ" }] }],
    [{ entries: [{ mime_type: "a", base64: "!" }] }],
    [{ entries: [{ mime_type: "a", text: "x", base64: "YQ==" }] }],
  ])
    assert.deepEqual(
      await outcome(() => validateClipboardItems(input, "write")),
      await outcome(() => helpers.yie(input, "write")),
    );
});
test("clipboard store copies reads and serializes operations without poisoning the queue", async () => {
  async function run(factory: any) {
    class Bridge {
      async ensure() {}
      async cleanup() {}
      async dispose() {}
    }
    const C = factory(Bridge),
      o = new C(),
      trace: any[] = [];
    const input = [{ entries: [{ mime_type: "text/plain", text: "one" }] }];
    o.write(input, "write");
    input[0].entries[0].text = "mutated";
    const read = o.read();
    read[0].entries[0].text = "read mutation";
    const results = await Promise.allSettled([
      o.runExclusive(async () => {
        trace.push("first");
        throw Error("failed");
      }),
      o.runExclusive(() => {
        trace.push("second");
        return o.read();
      }),
    ]);
    return {
      trace,
      results: results.map((r) =>
        r.status === "fulfilled"
          ? { value: r.value }
          : { error: r.reason.message },
      ),
      items: o.read(),
      fields: Object.keys(o),
    };
  }
  assert.deepEqual(await run(createClipboardClass), await run(original));
});
test("clipboard bridge cache, cleanup and failed disposal match original state transitions", async () => {
  async function run(factory: any, fail: boolean) {
    const trace: any[] = [];
    class Bridge {
      constructor(public cdp: any) {
        trace.push(["new", cdp]);
      }
      async ensure(target: any) {
        trace.push(["ensure", this.cdp, target]);
      }
      async cleanup() {
        trace.push(["cleanup", this.cdp]);
      }
      async dispose() {
        trace.push(["dispose", this.cdp]);
        if (fail && this.cdp === 1) throw Error("failed");
      }
    }
    const C = factory(Bridge),
      o = new C();
    o.write([{ entries: [{ mime_type: "a", text: "x" }] }], "write");
    await o.ensurePageClipboard(1, { tabId: 1 });
    await o.ensurePageClipboard(1, { tabId: 2 });
    await o.ensurePageClipboard(2, { tabId: 3 });
    await o.cleanupPageClipboards();
    const one = await outcome(() => o.disposePageClipboard(1));
    const all = await outcome(() => o.dispose());
    const after = await outcome(() => o.ensurePageClipboard(3, { tabId: 4 }));
    return {
      trace,
      one,
      all,
      after,
      disposed: o.disposed,
      bridges: [...o.bridges.keys()],
      items: o.read(),
    };
  }
  for (const fail of [false, true])
    assert.deepEqual(
      await run(createClipboardClass, fail),
      await run(original, fail),
    );
});
