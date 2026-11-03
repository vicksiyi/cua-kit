import test from "node:test";
import assert from "node:assert/strict";
import {
  serviceClassMethod,
  originalServiceBindings,
} from "./service-source.ts";
import { attachmentMethods } from "../packages/browser/dist/service/cdp/attachment_methods.js";
import { createCdpExecutionMethods } from "../packages/browser/dist/service/cdp/execute_methods.js";
import { tabAttachmentSetup } from "../packages/browser/dist/service/cdp/deadline.js";
import { classifyCommandError } from "../packages/browser/dist/service/classify_error.js";
const bindings = originalServiceBindings([
  "Cv",
  "eu",
  "Lh",
  "$t",
  "tu",
  "Av",
  "jN",
  "Pv",
  "At",
  "WN",
  "Tte",
  "Cte",
  "zN",
]);
const names = [
  "addTabCleanupHandler",
  "addTabAttachHandler",
  "runTabAttachHandlers",
  "runTabCleanupHandlers",
  "waitForTabAttachment",
  "ensureAttachedTab",
  "attachTab",
  "enableFocusEmulation",
  "enableOopifAutoAttachForTarget",
];
const original = new Function(
  ...Object.keys(bindings),
  "return {" +
    names.map((name) => serviceClassMethod("qh", name)).join(",") +
    "};",
)(...Object.values(bindings));
const executionDeps = { ...bindings, Qa: classifyCommandError, Dt: () => {} };
const originalExecution = new Function(
  ...Object.keys(executionDeps),
  "return {" +
    ["executeTargetCdp", "call", "callTarget"]
      .map((name) => serviceClassMethod("qh", name))
      .join(",") +
    "};",
)(...Object.values(executionDeps));
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (error) {
    return {
      error:
        typeof error === "object" && error !== null
          ? { name: error.name, message: error.message }
          : error,
    };
  }
}
function fixture(methods: any, token: symbol, config: any = {}) {
  const calls: any[] = [];
  let executeCount = 0;
  let resolveAttach: any;
  const held = new Promise<void>((resolve) => {
    resolveAttach = resolve;
  });
  const state: any = {
    attachedTabIds: new Set(),
    initializingTabIds: new Set(),
    tabAttachmentPromises: new Map(),
    tabAttachHandlers: new Set(),
    tabCleanupHandlers: new Set(),
    async readNetworkPolicy() {
      calls.push("policy");
      return { policy: "value" };
    },
    emit(event: any, id: any) {
      calls.push([event, id]);
      if (config.detachOnEmit) this.attachedTabIds.delete(id);
    },
    forgetAttachedTab(id: any, force: any) {
      calls.push(["forget", id, force]);
      this.attachedTabIds.delete(id);
      this.initializingTabIds.delete(id);
      this.tabAttachmentPromises.delete(id);
    },
    performanceSpan: {
      currentCommandAttrs() {
        return { command: "current" };
      },
      async withSpan(name: any, attrs: any, run: any) {
        calls.push(["span", name, attrs]);
        return await run();
      },
    },
    api: {
      async attach(id: any, policy: any) {
        calls.push(["attach", id, policy]);
        if (config.hold) await held;
        if (config.stale) state.tabAttachmentPromises.delete(id);
        if (config.attachError) throw new Error("attach failed");
      },
      async executeCdp(payload: any) {
        calls.push(["cdp", payload]);
        executeCount++;
        if (
          config.cdpError &&
          (config.cdpError !== "once" || executeCount === 1)
        )
          throw new Error(
            config.cdpError === "deadline" ? "Timed out" : "unsupported",
          );
        return { ok: true };
      },
    },
  };
  Object.assign(state, methods);
  state.addTabAttachHandler(async (id: any, opts: any) => {
    calls.push(["handler", id, opts.timeoutMs, opts[token] === id]);
    await state.ensureAttachedTab(id, opts);
    if (config.handlerError) throw new Error(config.handlerError);
  });
  return { state, calls, resolveAttach };
}
async function scenario(methods: any, token: symbol, config: any = {}) {
  const f = fixture(methods, token, config);
  const options = { timeoutMs: 50, preserveDebuggerOnTimeout: true };
  const result = await outcome(() => f.state.waitForTabAttachment(1, options));
  return {
    result,
    calls: f.calls,
    attached: [...f.state.attachedTabIds],
    initializing: [...f.state.initializingTabIds],
    promises: [...f.state.tabAttachmentPromises.keys()],
  };
}
test("attach reproduces policy/focus/handler ordering, setup-token reentrancy, stale attachment and failure cleanup", async () => {
  for (const config of [
    {},
    { attachError: true },
    { stale: true },
    { detachOnEmit: true },
    { cdpError: "unsupported" },
    { cdpError: "deadline" },
    { handlerError: "ordinary failure" },
    { handlerError: "deadline exceeded" },
  ])
    assert.deepEqual(
      await scenario(attachmentMethods, tabAttachmentSetup, config),
      await scenario(original, bindings.eu, config),
    );
});
async function concurrent(methods: any, token: symbol) {
  const f = fixture(methods, token, { hold: true });
  const first = f.state.waitForTabAttachment(1, { timeoutMs: 50 }),
    second = f.state.waitForTabAttachment(1, { timeoutMs: 900 });
  await Promise.resolve();
  await Promise.resolve();
  f.resolveAttach();
  await Promise.all([first, second]);
  await f.state.waitForTabAttachment(1);
  return { calls: f.calls, attached: [...f.state.attachedTabIds] };
}
test("concurrent waiters share one attach promise and keep the first attach timeout", async () => {
  assert.deepEqual(
    await concurrent(attachmentMethods, tabAttachmentSetup),
    await concurrent(original, bindings.eu),
  );
});
async function handlersScenario(methods: any, token: symbol) {
  const f = fixture(methods, token);
  f.state.tabAttachHandlers.clear();
  const trace: any[] = [];
  f.state.addTabAttachHandler(async () => {
    trace.push("ordinary");
    throw new Error("ordinary");
  });
  const remove = f.state.addTabAttachHandler(async () => trace.push("removed"));
  remove();
  f.state.addTabAttachHandler(async () => {
    trace.push("timeout");
    throw new Error("timed out");
  });
  f.state.addTabAttachHandler(async () => {
    trace.push("later");
    throw new Error("deadline later");
  });
  const result = await outcome(() => f.state.runTabAttachHandlers(1, {}));
  f.state.addTabCleanupHandler(async () => {
    trace.push("cleanup one");
    throw new Error("ignored");
  });
  f.state.addTabCleanupHandler(async () => trace.push("cleanup two"));
  await f.state.runTabCleanupHandlers(1);
  return { trace, result };
}
test("attach handlers settle in parallel and rethrow first deadline failure, while cleanup swallows rejections", async () => {
  assert.deepEqual(
    await handlersScenario(attachmentMethods, tabAttachmentSetup),
    await handlersScenario(original, bindings.eu),
  );
});
async function autoAttach(methods: any, token: symbol, cdpError: any) {
  const f = fixture(methods, token, { cdpError });
  const result = await outcome(() =>
    f.state.enableOopifAutoAttachForTarget({ tabId: 1 }, { timeoutMs: 10 }),
  );
  return { calls: f.calls, result };
}
test("auto-attach falls back from iframe filter only for non-deadline errors", async () => {
  for (const error of [undefined, "once", "unsupported", "deadline"])
    assert.deepEqual(
      await autoAttach(attachmentMethods, tabAttachmentSetup, error),
      await autoAttach(original, bindings.eu, error),
    );
});
async function combined(methods: any, token: symbol, execution: any) {
  const f = fixture(methods, token);
  Object.assign(f.state, execution, {
    throwIfJsDialogBlocksMethod() {},
    documentTarget: undefined,
  });
  f.state.tabAttachHandlers.clear();
  f.state.addTabAttachHandler(async (id: any, options: any) => {
    await f.state.call(id, "Page.enable", undefined, options);
  });
  const result = await f.state.call("1", "Page.getLayoutMetrics");
  return { calls: f.calls, result, attached: [...f.state.attachedTabIds] };
}
test("real reconstructed dispatch and attachment groups execute nested setup commands without deadlock", async () => {
  assert.deepEqual(
    await combined(
      attachmentMethods,
      tabAttachmentSetup,
      createCdpExecutionMethods(() => {}),
    ),
    await combined(original, bindings.eu, originalExecution),
  );
});
