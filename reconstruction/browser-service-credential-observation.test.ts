import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { serviceExpression } from "./service-source";
import { createCredentialObservationState } from "../packages/browser/src/service/security/credential_observation";

const bindings = [
  "vX",
  "SX",
  "xX",
  "EX",
  "TX",
  "CX",
  "Tt",
  "A_",
  "ac",
  "Fi",
  "SB",
  "xB",
  "EB",
  "Er",
  "P_",
  "Mn",
  "TB",
  "AX",
  "C_",
  "Lt",
  "Me",
  "xt",
];
function original() {
  return new Function(
    "let fo=new Map(),ff=new Set(),E_=new Set(),T_=new Set(),oc,vB,sc=false,ic;" +
      bindings
        .map((name) => `const ${name}=${serviceExpression(name)};`)
        .join("\n") +
      "return {getGate:TB,allGates:Mn,beginObservation:P_,initialize:EB,ensureResumed:Fi,resume:SB,isUnavailable:A_};",
  )();
}
class Cdp extends EventEmitter {
  frame: any = {
    id: "main",
    loaderId: "secret",
    url: "https://site.test/login",
    securityOrigin: "https://site.test",
  };
  calls: any[] = [];
  failure: unknown;
  async call(...args: any[]) {
    this.calls.push(args);
    if (this.failure) throw this.failure;
    return { frameTree: { frame: { ...this.frame } } };
  }
  navigate(loader: string, origin = "https://site.test") {
    this.frame = {
      id: "main",
      loaderId: loader,
      url: origin + "/next",
      securityOrigin: origin,
    };
    this.emit("event", {
      source: { tabId: 1 },
      method: "Page.frameNavigated",
      params: { frame: this.frame },
    });
  }
}
async function outcome(fn: () => any) {
  try {
    const value = await fn();
    return { value: typeof value === "symbol" ? "symbol" : value };
  } catch (error: any) {
    return { name: error.name, reason: error.reason, message: error.message };
  }
}
function snapshot(gate: any) {
  return {
    keys: Object.keys(gate),
    epoch: gate.epoch,
    observationEpoch: gate.observationEpoch,
    restriction: gate.restriction,
    pending: gate.pending,
    documents: [...gate.documents].map(([id, values]: any) => [
      id,
      [...values],
    ]),
    permitted: [...gate.permittedDocuments],
    ordinary: [...gate.ordinaryInteractionTabs],
    private: [...gate.privateInteractionOrigins],
    manual: [...gate.manualSavingTabs],
    pendingTabs: [...gate.pendingInteractions.keys()],
  };
}
async function scenario(factory: () => any, mode: "private" | "ordinary") {
  const state = factory(),
    cdp = new Cdp(),
    gate = state.getGate("browser", cdp),
    other = state.getGate("other", new Cdp());
  const trace: any[] = [];
  const dispose = gate.bindNavigationEvents(cdp);
  trace.push(await outcome(() => gate.observe(() => "before", 1)));
  const token = await gate.protectManualSaving(
    1,
    () => trace.push("before-drain"),
    mode,
  );
  trace.push(snapshot(gate), snapshot(other));
  trace.push(
    await outcome(() => gate.observe(() => "secret", 1)),
    await outcome(() => gate.assertRetainedObservationAllowed()),
  );
  trace.push(
    await outcome(() =>
      gate.allowPrivateInteraction(1, "http://site.test", token),
    ),
  );
  if (mode === "private")
    gate.allowPrivateInteraction(1, "https://site.test", token);
  else gate.allowOrdinaryInteraction(1, token, true);
  trace.push(await outcome(() => gate.observe(() => "same-document", 1)));
  cdp.navigate("next");
  trace.push(
    await outcome(() => gate.observe(() => "new-document", 1)),
    snapshot(gate),
  );
  cdp.navigate("outside", "https://outside.test");
  trace.push(await outcome(() => gate.observe(() => "outside", 1)));
  trace.push(
    await outcome(() =>
      gate.permitNavigatedDocument(1, "outside", gate.epoch - 1),
    ),
  );
  gate.permitNavigatedDocument(1, "outside", gate.epoch);
  trace.push(await outcome(() => gate.observe(() => "permitted", 1)));
  cdp.emit("tabDetached", 1, "turnEnded");
  trace.push(snapshot(gate));
  const rebound = new Cdp();
  assert.equal(state.getGate("browser", rebound), gate);
  cdp.navigate("stale");
  trace.push(snapshot(gate));
  dispose();
  trace.push(snapshot(gate), cdp.eventNames(), cdp.calls);
  return trace;
}
test("credential gate matches original document protection, navigation, manual-saving and rebinding", async () => {
  for (const mode of ["private", "ordinary"] as const)
    assert.deepEqual(
      await scenario(createCredentialObservationState, mode),
      await scenario(original, mode),
    );
});

async function raceScenario(factory: () => any) {
  const state = factory(),
    cdp = new Cdp(),
    gate = state.getGate("a", cdp),
    trace: any[] = [];
  const release = state.beginObservation();
  const protecting = gate.protect(1, () => trace.push("protect-start"));
  trace.push(gate.protectionPending, cdp.calls.length);
  trace.push(
    await outcome(() => gate.protect(1)),
    await outcome(() => state.beginObservation()),
  );
  release();
  await protecting;
  trace.push(snapshot(gate));
  cdp.frame.loaderId = "allowed";
  gate.permitNavigatedDocument(1, "allowed", gate.epoch);
  const operation = Promise.withResolvers<string>(),
    started = Promise.withResolvers<void>();
  const observation = outcome(() =>
    gate.observe(() => {
      started.resolve();
      return operation.promise;
    }, 1),
  );
  await started.promise;
  const second = gate.protect(1);
  operation.resolve("must not escape");
  trace.push(await observation);
  await second;
  cdp.failure = new Error("sensitive provider details");
  trace.push(
    await outcome(() => gate.readFrame(1)),
    await outcome(() => gate.protect(1)),
    snapshot(gate),
  );
  for (const id of [0, -1, 1.5, NaN])
    trace.push(await outcome(() => gate.readFrame(id)));
  return trace;
}
test("credential gate matches original observation drain, concurrent protection and redacted failures", async () => {
  assert.deepEqual(
    await raceScenario(createCredentialObservationState),
    await raceScenario(original),
  );
});

async function bootstrap(factory: () => any, kind: string) {
  const state = factory(),
    trace: any[] = [];
  const runtime: any = {
    env: {
      BROWSER_AUTH_BROKER_CREDENTIAL_BINDING_VERSION: "1",
      ENABLE_BROWSER_SESSION_TAB_OWNERSHIP: "true",
      BROWSER_AUTH_BROKER_SOCKET_PATH:
        "/run/codex-browser-auth/browser-auth-broker.sock",
    },
    requestMeta: { "x-codex-turn-metadata": { session_id: "session" } },
    gaas: {
      getNativeCredentialObservationStatus: async (...args: any[]) => {
        trace.push(args);
        return false;
      },
    },
  };
  if (kind === "disabled")
    runtime.env.BROWSER_AUTH_BROKER_CREDENTIAL_BINDING_VERSION = "0";
  if (kind === "invalid")
    runtime.env.ENABLE_BROWSER_SESSION_TAB_OWNERSHIP = "false";
  if (kind === "subagent")
    runtime.requestMeta["x-codex-turn-metadata"] = {
      thread_source: "subagent",
      thread_id: "child",
      session_id: "parent",
    };
  trace.push(
    await outcome(() => state.initialize(runtime)),
    state.isUnavailable(),
  );
  trace.push(
    await outcome(() => state.resume("one")),
    await outcome(() => state.resume("one", null)),
  );
  trace.push(await outcome(() => state.ensureResumed()));
  trace.push(
    await outcome(() => state.resume("two", "wrong")),
    state.isUnavailable(),
  );
  trace.push(await outcome(() => state.beginObservation()));
  // Remove successful release functions before comparison.
  return trace.map((entry) =>
    entry && typeof entry.value === "function" ? { value: "release" } : entry,
  );
}
test("credential broker initialization and resume epochs match original fail-closed state", async () => {
  for (const kind of ["enabled", "disabled", "invalid", "subagent"])
    assert.deepEqual(
      await bootstrap(createCredentialObservationState, kind),
      await bootstrap(original, kind),
    );
});

async function boundary(factory: () => any) {
  const state = factory(),
    cdp = new Cdp(),
    gate = state.getGate("a", cdp),
    results: any[] = [];
  for (let i = 0; i < 64; i++) {
    cdp.frame.loaderId = "loader" + i;
    await gate.protect(1);
  }
  results.push(await outcome(() => gate.protect(1)), snapshot(gate));
  cdp.frame = { id: "main", loaderId: "" };
  results.push(await outcome(() => gate.readFrame(1)));
  return results;
}
test("credential gate preserves 64-document boundary and malformed frame errors", async () => {
  assert.deepEqual(
    await boundary(createCredentialObservationState),
    await boundary(original),
  );
});

async function resumptionRace(factory: () => any) {
  const state = factory(),
    first = Promise.withResolvers<boolean>(),
    queried = Promise.withResolvers<void>(),
    trace: any[] = [];
  let calls = 0;
  const runtime: any = {
    env: {
      BROWSER_AUTH_BROKER_MANUAL_SAVE_BINDING_VERSION: "10",
      ENABLE_BROWSER_SESSION_TAB_OWNERSHIP: "true",
      BROWSER_AUTH_BROKER_SOCKET_PATH:
        "/run/codex-browser-auth/browser-auth-broker.sock",
    },
    requestMeta: {
      "x-codex-turn-metadata": JSON.stringify({ session_id: "thread" }),
    },
    gaas: {
      getNativeCredentialObservationStatus: async (...args: any[]) => {
        trace.push(args);
        calls++;
        if (calls === 2) {
          queried.resolve();
          return first.promise;
        }
        return false;
      },
    },
  };
  await state.initialize(runtime);
  trace.push(state.resume("initial", null));
  const init = state.ensureResumed();
  await queried.promise;
  trace.push(state.resume("next", "initial"));
  first.resolve(true);
  await init;
  trace.push(state.isUnavailable(), calls);
  const gate = state.getGate("browser", new Cdp());
  await gate.protect(1);
  await state.ensureResumed();
  trace.push(calls);
  const prototype = Object.getPrototypeOf(gate);
  trace.push(
    Object.getOwnPropertyNames(prototype)
      .filter((name) => name !== "constructor")
      .map((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, name)!;
        return [
          name,
          descriptor.value?.length,
          descriptor.get?.length,
          descriptor.enumerable,
        ];
      }),
  );
  return trace;
}
test("credential resumption handles an epoch change while the broker request is in flight and preserves gate method descriptors", async () => {
  assert.deepEqual(
    await resumptionRace(createCredentialObservationState),
    await resumptionRace(original),
  );
});
