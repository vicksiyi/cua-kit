import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings, serviceSourceSha256 } from "./service-source";
import {
  observeSiwc,
  committedSiwcPage,
  isSiwcPageCurrent,
} from "../packages/browser/src/service/siwc/observation";
import { inputTimeout } from "../packages/browser/src/service/input/input";
assert.equal(
  serviceSourceSha256,
  "396d4bcd890e8e41e336469eb1a050bafd36bb2d91152b75bb22b70b56622021",
);
const original = originalServiceBindings(["Dc", "Co", "bN", "Pv"], {
  Oe: inputTimeout,
});
test("SIWC observation matches generation changes, empty results and unavailable observations", async () => {
  for (const mode of ["match", "empty", "changed", "failed"]) {
    const results = [];
    for (const observe of [original.Co, observeSiwc]) {
      let generation = "one";
      const calls: any[] = [];
      const injected = {
        siwcDocumentId: () => generation,
        siwcDetect: () =>
          mode === "empty"
            ? []
            : [
                {
                  ref: "s1",
                  evidence: "siwc_marker_detected",
                  visibility: "rendered",
                },
              ],
      };
      const context = {
        getCurrentSessionId: () => "session",
        playwright: {
          evaluateOnPlaywrightPage: async (tab: any, fn: any, options: any) => {
            calls.push([tab, options]);
            if (mode === "failed") throw Error("no observation");
            const value = fn(injected);
            if (mode === "changed") generation = "two";
            return value;
          },
        },
      };
      results.push({ result: await observe({ tab_id: "7" }, context), calls });
    }
    assert.deepEqual(results[1], results[0]);
  }
});
test("SIWC committed-page identity matches source origin validation and navigation changes", async () => {
  for (const frame of [
    {
      id: "f",
      loaderId: "l",
      url: "https://example.test/p",
      securityOrigin: "https://example.test",
      urlFragment: "#fragment",
    },
    {
      id: "f",
      loaderId: "",
      url: "https://example.test",
      securityOrigin: "https://example.test",
    },
    {
      id: "f",
      loaderId: "l",
      url: "https://example.test",
      securityOrigin: "https://other.test",
    },
    {
      id: "f",
      loaderId: "l",
      url: "data:text/plain,hello",
      securityOrigin: "null",
    },
  ]) {
    const ctx = { cdp: { call: async () => ({ frameTree: { frame } }) } };
    const results = [];
    for (const read of [original.bN, committedSiwcPage])
      try {
        results.push(await read(7, ctx));
      } catch (e) {
        results.push({ error: (e as Error).message });
      }
    assert.deepEqual(results[1], results[0]);
    if (!("error" in results[0]))
      for (const patch of [
        {},
        { id: "other" },
        { loaderId: "new" },
        { url: "https://example.test/different" },
      ])
        assert.equal(
          await isSiwcPageCurrent(7, { ...results[0], ...patch }, ctx),
          await original.Pv(7, { ...results[0], ...patch }, ctx),
        );
  }
});
