import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source.ts";
import {
  BrowserDev,
  consoleEventLog,
  exceptionEventLog,
  consoleArguments,
} from "../packages/browser/dist/service/context/dev.js";
import { CdpEventEmitter } from "../packages/browser/dist/service/cdp/event_emitter.js";
const b = originalServiceBindings([
  "Qi",
  "jc",
  "qF",
  "uoe",
  "aoe",
  "soe",
  "ioe",
  "noe",
  "ooe",
  "dg",
]);
function normalize(value: any): any {
  if (value == null) return value;
  const { timestamp, ...rest } = value;
  assert.equal(new Date(timestamp).toISOString(), timestamp);
  return { ...rest, timestamp: "clock" };
}
function setup(Class: any) {
  const cdp: any = new CdpEventEmitter();
  const trace: any[] = [];
  let attach: any;
  cdp.addTabAttachHandler = (fn: any) => {
    attach = fn;
  };
  cdp.call = async (...args: any[]) => {
    trace.push(args);
  };
  cdp.hasBrowserAuthRawEventProtection = () => false;
  return { o: new Class(cdp), cdp, trace, getAttach: () => attach };
}
test("console conversion preserves remote values, level aliases, stack URL and exception priority", () => {
  const args = [
    { type: "string", value: null },
    { value: null },
    { value: false },
    { description: "object" },
    {},
    null,
    { value: [1, 2] },
  ];
  assert.equal(consoleArguments(args), b.soe(args));
  for (const params of [
    null,
    [],
    {},
    {
      type: "warning",
      args,
      stackTrace: { callFrames: [{ url: "page" }, { url: "ignored" }] },
    },
    { type: "unknown", args: [{ type: "string", value: 7 }], timestamp: 1 },
  ])
    assert.deepEqual(
      normalize(consoleEventLog(params)),
      normalize(b.noe(params)),
    );
  for (const params of [
    null,
    {},
    {
      exceptionDetails: {
        exception: { value: "", description: "ignored" },
        text: "text",
        url: "url",
      },
    },
    {
      exceptionDetails: { exception: { value: 4, description: "description" } },
    },
    { exceptionDetails: {} },
  ])
    assert.deepEqual(
      normalize(exceptionEventLog(params)),
      normalize(b.ooe(params)),
    );
});
test("developer logs preserve retention, zero limit, filtering, protection and detach clearing", async () => {
  async function run(Class: any) {
    const { o, cdp, trace } = setup(Class);
    for (let i = 0; i < 503; i++)
      o.pushLog(1, {
        level: i % 2 ? "warn" : "log",
        message: String(i),
        timestamp: "fixed",
      });
    const results = [
      await o.logs({ tabId: 1, limit: 2 }),
      await o.logs({ tabId: 1, limit: 0, levels: ["warn"], filter: "50" }),
      await o.logs({ tabId: 1, levels: [] }),
    ];
    const size = o.logsByTabId.get(1).length;
    cdp.hasBrowserAuthRawEventProtection = () => true;
    cdp.emit("event", {
      source: { tabId: 1 },
      method: "Runtime.consoleAPICalled",
      params: { type: "error" },
    });
    const protectedSize = o.logsByTabId.get(1).length;
    cdp.emit("tabDetached", 1);
    return {
      results,
      size,
      protectedSize,
      trace,
      logs: o.logsByTabId.size,
      enabled: o.runtimeEnabledTabIds.size,
      pending: o.runtimeEnablePromises.size,
    };
  }
  assert.deepEqual(await run(BrowserDev), await run(b.dg));
});
test("runtime enabling shares pending work and retains original detach/in-flight race", async () => {
  async function run(Class: any) {
    const { o, cdp, getAttach } = setup(Class);
    const resolvers: Array<() => void> = [];
    let calls = 0;
    cdp.call = () => {
      calls++;
      return new Promise<void>((resolve) => resolvers.push(resolve));
    };
    const a = o.ensureRuntimeEnabled(1),
      b = o.ensureRuntimeEnabled(1);
    const skipped = getAttach()(1, {});
    cdp.emit("tabDetached", 1);
    const c = o.ensureRuntimeEnabled(1);
    resolvers[0]();
    await a;
    await b;
    const middle = {
      pending: o.runtimeEnablePromises.has(1),
      enabled: o.runtimeEnabledTabIds.has(1),
    };
    resolvers[1]();
    await c;
    return { calls, skipped, middle, enabled: o.runtimeEnabledTabIds.has(1) };
  }
  assert.deepEqual(await run(BrowserDev), await run(b.dg));
});
