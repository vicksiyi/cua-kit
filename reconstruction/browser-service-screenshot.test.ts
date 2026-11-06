import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings, serviceSourceSha256 } from "./service-source";
import * as screenshot from "../packages/browser/src/service/commands/screenshot";
import { defineCommand } from "../packages/browser/src/service/commands/define_command";
import { positiveTabId } from "../packages/browser/src/service/tab_id";
assert.equal(serviceSourceSha256, "396d4bcd890e8e41e336469eb1a050bafd36bb2d91152b75bb22b70b56622021",
  "Re-audit screenshot helper bindings for changed installed artifact");
const original = originalServiceBindings([
  "O", "H", "an", "Dee", "Mee", "Bee", "tN", "wv", "Uee",
  "Lee", "Fee", "Nee", "Oee", "Wi", "rN",
]);

async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (error) {
    return { error: { name: error.name, message: error.message } };
  }
}
function fixture(options: any = {}) {
  const calls: any[] = [];
  let index = 0;
  const events = options.events ?? [
    {
      method: "Page.screencastFrame",
      params: { sessionId: 1, data: "frame", metadata: { timestamp: 100 } },
    },
  ];
  const context: any = {
    acquireAuthority() {
      calls.push("authority");
      return {
        observeContent(url: any) {
          calls.push(["observe", url]);
          return {
            async assert() {
              calls.push("assert");
              if (options.authorityError) throw new Error("authority denied");
            },
          };
        },
      };
    },
    security: {
      async currentTabUrl(id: any) {
        calls.push(["url", id]);
        return "https://example.com";
      },
    },
    cdp: {
      async call(tab: any, method: any, params: any, extra: any) {
        calls.push([tab, method, params, extra]);
        if (options.fail === method) throw new Error("CDP failed");
        if (method === "Runtime.evaluate")
          return { result: { value: options.ratio ?? 2 } };
        if (method === "Page.getLayoutMetrics")
          return (
            options.metrics ?? {
              cssContentSize: { width: 100, height: 200 },
              cssVisualViewport: {
                pageX: 2,
                pageY: 3,
                clientWidth: 80.3,
                clientHeight: 60.8,
              },
            }
          );
        if (method === "Page.captureScreenshot")
          return {
            data: options.data === undefined ? "fallback" : options.data,
          };
        return {};
      },
      async withInternalScreencast(tab: any, run: any) {
        calls.push(["internal", tab]);
        return await run((event: any) => event.allowed !== false);
      },
      waitForEvent(tab: any, predicate: any, opts: any) {
        calls.push(["wait", tab, opts.timeoutMessage, opts.timeoutMs]);
        opts.signal.addEventListener("abort", () => calls.push("abort"), {
          once: true,
        });
        const event = events[index++];
        if (!event) return Promise.reject(new Error("timeout"));
        calls.push([
          "predicate",
          predicate(event),
          predicate({ method: "noise" }),
          predicate({ ...event, allowed: false }),
        ]);
        return Promise.resolve(event);
      },
    },
  };
  if (options.gate)
    context.credentialObservationGate = {
      async observe(run: any, tab: any) {
        calls.push(["gate", tab]);
        if (options.gate === "reject") throw new Error("observation denied");
        return await run();
      },
    };
  return { context, calls };
}
async function scenario(
  capture: any,
  options: any,
  payload: any,
  mode = "css",
) {
  const f = fixture(options);
  return {
    result: await outcome(() => capture(payload, f.context, mode)),
    calls: f.calls,
  };
}
test("service screenshot reproduces crop/full-page/viewport scale, fallback, validation and authority ordering", async () => {
  const now = Date.now;
  Date.now = () => 100000;
  try {
    for (const [options, payload, mode] of [
      [{}, { tab_id: "2" }, "css"],
      [{ ratio: 0.5 }, { tab_id: "2" }, "css"],
      [{}, { tab_id: "2" }, "device"],
      [{}, { tab_id: "2", fullPage: true }, "css"],
      [
        {},
        { tab_id: "2", cropX: 0, cropY: 0, cropWidth: 5, cropHeight: 6 },
        "css",
      ],
      [{}, { tab_id: "2", cropX: 0 }, "css"],
      [
        {},
        { tab_id: "2", cropX: 0, cropY: 0, cropWidth: 0, cropHeight: 2 },
        "css",
      ],
      [
        { metrics: { cssContentSize: { width: 0, height: 2 } } },
        { tab_id: "2", fullPage: true },
        "css",
      ],
      [{ fail: "Runtime.evaluate" }, { tab_id: "2", fullPage: true }, "css"],
      [{ events: [] }, { tab_id: "2" }, "css"],
      [{ events: [], data: "" }, { tab_id: "2" }, "device"],
      [{}, { tab_id: "bad" }, "css"],
      [
        {},
        {
          tab_id: "2",
          cropX: NaN,
          cropY: Infinity,
          cropWidth: NaN,
          cropHeight: 2,
        },
        "device",
      ],
    ] as any[])
      assert.deepEqual(
        await scenario(screenshot.captureTabScreenshot, options, payload, mode),
        await scenario(original.Wi, options, payload, mode),
      );
    for (const authorityError of [false, true])
      assert.deepEqual(
        await scenario(
          screenshot.TabScreenshotCommand,
          { authorityError },
          { tab_id: "2" },
        ),
        await scenario(
          original.rN,
          { authorityError },
          { tab_id: "2" },
        ),
      );
  } finally {
    Date.now = now;
  }
});
test("screencast acknowledges stale frames, cleans up failures and uses original event predicates", async () => {
  const now = Date.now;
  Date.now = () => 100000;
  try {
    for (const options of [
      {
        events: [
          {
            method: "Page.screencastFrame",
            params: { sessionId: 1, data: "old", metadata: { timestamp: 99 } },
          },
          {
            method: "Page.screencastFrame",
            params: { sessionId: 2, data: "new", metadata: { timestamp: 100 } },
          },
        ],
      },
      {
        events: [
          {
            method: "Page.screencastVisibilityChanged",
            params: { visible: false },
          },
        ],
      },
      {
        events: [
          { method: "Page.screencastFrame", params: { sessionId: "bad" } },
        ],
      },
      { fail: "Page.startScreencast" },
      { fail: "Page.stopScreencast" },
      { fail: "Page.screencastFrameAck" },
      {
        events: [
          {
            method: "Page.screencastFrame",
            params: { sessionId: 1, data: "", metadata: { timestamp: 100 } },
          },
        ],
      },
    ])
      assert.deepEqual(
        await scenario(screenshot.captureTabScreenshot, options, { tab_id: 1 }),
        await scenario(original.Wi, options, { tab_id: 1 }),
      );
    for (const event of [
      { method: "noise" },
      {
        method: "Page.screencastVisibilityChanged",
        params: { visible: false },
      },
      {
        method: "Page.screencastFrame",
        params: { metadata: { timestamp: NaN } },
      },
      {
        method: "Page.screencastFrame",
        params: { metadata: { timestamp: 100 } },
      },
    ]) {
      assert.equal(screenshot.isScreencastEvent(event), original.Nee(event));
      assert.equal(screenshot.screencastTimestamp(event), original.Lee(event));
      assert.equal(
        screenshot.isFreshScreencastFrame(event, 100),
        original.Fee(event, 100),
      );
    }
  } finally {
    Date.now = now;
  }
});
test("command registration stays synchronous and tab ids preserve original numeric coercion", async () => {
  for (const value of [
    1,
    "2",
    "1e3",
    0,
    -1,
    null,
    undefined,
    "bad",
    Number.MAX_SAFE_INTEGER + 1,
  ])
    assert.deepEqual(
      await outcome(() => positiveTabId(value)),
      await outcome(() => original.H(value)),
    );
  for (const define of [defineCommand, original.O]) {
    const error = new Error("sync");
    const cmd = define({ commandType: "test" }, () => {
      throw error;
    });
    assert.equal(cmd.type, "test");
    assert.equal(cmd.length, 2);
    assert.throws(
      () => cmd({}, {}),
      (value) => value === error,
    );
  }
});

// The current installed capture function no longer has this older gate wrapper.
// Keep its local guard tested explicitly; do not call this current-source parity.
test("retained credential observation guard denies before capture; authority denies before guard", async () => {
  const capture = await scenario(screenshot.captureTabScreenshot, {gate: "reject"}, {tab_id: "2"});
  assert.deepEqual(capture, {result: {error: {name: "Error", message: "observation denied"}}, calls: [["gate", 2]]});
  const denied = await scenario(screenshot.TabScreenshotCommand, {gate: "reject", authorityError: true}, {tab_id: "2"});
  assert.deepEqual(denied.result, {error: {name: "Error", message: "authority denied"}});
  assert.deepEqual(denied.calls, ["authority", ["url", 2], ["observe", "https://example.com"], "assert"]);
});
