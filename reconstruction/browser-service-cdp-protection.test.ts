import test from "node:test";
import assert from "node:assert/strict";
import { serviceClassMethod, serviceClassWithMethods, serviceSourceSha256 } from "./service-source.ts";
import { protectionMethods } from "../packages/browser/src/service/cdp/protection_methods";
const sourceClass = serviceClassWithMethods(Object.keys(protectionMethods));
const original = new Function(
  "return {" +
    Object.keys(protectionMethods)
      .map((n) => serviceClassMethod(sourceClass, n))
      .join(",") +
    "}",
)();
function owner(methods: any) {
  const trace: any[] = [];
  const o: any = {
    ...methods,
    trace,
    attachedTabIds: new Set([1]),
    browserAuthCredentialDiagnosticsTabs: new Set(),
    configuredWorkerStartProtection: new Set(),
  };
  for (const key of [
    "suppressedRawNetworkByTab",
    "workerStartProtectionByTab",
    "browserAuthWorkerBypassByTab",
    "workerStartConfigurationByTab",
  ])
    o[key] = new Map();
  o.waitForTabAttachment = async (id: number) => {
    trace.push(["attach", id]);
  };
  o.call = async (...args: any[]) => {
    trace.push(["call", ...args]);
  };
  o.enableOopifAutoAttachForTarget = async (...args: any[]) => {
    trace.push(["restore", ...args]);
  };
  o.api = {
    async browserAuthNewTargetProtection(req: any) {
      trace.push(req);
      return true;
    },
  };
  return o;
}
test("raw protection suppression releases once while diagnostics protection persists", () => {
  function run(methods: any) {
    const o = owner(methods),
      a = o.suppressRawNetworkEvents(1),
      b = o.suppressRawNetworkEvents(1),
      results = [];
    results.push(o.hasBrowserAuthRawEventProtection(1));
    a();
    a();
    results.push(o.suppressedRawNetworkByTab.get(1));
    b();
    results.push(o.hasBrowserAuthRawEventProtection(1));
    o.protectBrowserAuthCredentialDiagnostics(1);
    results.push(
      o.hasBrowserAuthRawEventProtection(1),
      o.isTabAttached("1"),
      o.isTabAttached("bad"),
    );
    return results;
  }
  assert.deepEqual(run(protectionMethods), run(original));
});
test("credential target protection requires true and reuses the acquired lease on every release", async () => {
  async function run(methods: any) {
    const o = owner(methods);
    const release = await o.protectBrowserAuthNewTargets(1);
    await release();
    await release();
    const leases = o.trace.map((v: any) => v.leaseId);
    assert.equal(typeof leases[0], "string");
    assert.equal(leases[0], leases[1]);
    assert.equal(leases[1], leases[2]);
    const results = [];
    for (const value of [true, false, 1, null, "throw"]) {
      o.api.browserAuthNewTargetProtection = async () => {
        if (value === "throw") throw Error("provider");
        return value;
      };
      results.push(await o.browserAuthNewTargetCheck(1));
      try {
        results.push(await o.closeBrowserAuthPausedTarget(1, "t"));
      } catch (e) {
        results.push((e as Error).message);
      }
      try {
        await o.protectBrowserAuthNewTargets(1);
        results.push("acquired");
      } catch (e) {
        results.push((e as Error).message);
      }
    }
    return {
      results,
      trace: o.trace.map((v: any) => ({ ...v, leaseId: "lease" })),
    };
  }
  assert.deepEqual(await run(protectionMethods), await run(original));
});
test("worker start leases share configuration and restore OOPIF only on final release", async () => {
  async function run(methods: any) {
    const o = owner(methods);
    const [a, b] = await Promise.all([
      o.protectServiceWorkerStarts(1),
      o.protectServiceWorkerStarts(1),
    ]);
    await a();
    await a();
    await b();
    await b();
    await o.configureServiceWorkerStarts(99);
    return {
      trace: o.trace,
      counts: o.workerStartProtectionByTab,
      configured: o.configuredWorkerStartProtection,
      pending: o.workerStartConfigurationByTab.size,
    };
  }
  assert.deepEqual(await run(protectionMethods), await run(original));
});
test("worker bypass leases serialize transitions and ignore replaced state", async () => {
  async function run(methods: any) {
    const o = owner(methods);
    const [a, b] = await Promise.all([
      o.protectBrowserAuthServiceWorkerBypass(1),
      o.protectBrowserAuthServiceWorkerBypass(1),
    ]);
    await a();
    await a();
    await b();
    await b();
    const c = await o.protectBrowserAuthServiceWorkerBypass(1);
    o.browserAuthWorkerBypassByTab.delete(1);
    await c();
    return { trace: o.trace, size: o.browserAuthWorkerBypassByTab.size };
  }
  assert.deepEqual(await run(protectionMethods), await run(original));
});
test("protection acquisition failures roll back counts and preserve source error precedence", async () => {
  async function run(methods: any, kind: string) {
    const o = owner(methods);
    let calls = 0;
    o.call = async () => {
      calls++;
      throw Error("provider " + calls);
    };
    let error;
    try {
      await o[kind](1);
    } catch (e) {
      error = (e as Error).message;
    }
    return {
      error,
      calls,
      start: o.workerStartProtectionByTab.size,
      bypass: o.browserAuthWorkerBypassByTab.size,
      pending: o.workerStartConfigurationByTab.size,
    };
  }
  for (const kind of [
    "protectServiceWorkerStarts",
    "protectBrowserAuthServiceWorkerBypass",
  ])
    assert.deepEqual(
      await run(protectionMethods, kind),
      await run(original, kind),
    );
});

test("protection oracle provenance", (t) => { t.diagnostic(`Installed browser-service ${serviceSourceSha256}; class ${sourceClass}`); });
