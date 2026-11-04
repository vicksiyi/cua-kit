import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { extractNodeReplSources } from "../scripts/extract-node-repl-sources.mjs";
import { createPrivilegedWorkerRuntime } from "../packages/node-repl/src/privileged_runtime";
import { createExecContext } from "../packages/node-repl/src/exec_context";
const { files } = await extractNodeReplSources(
    process.env.CUA_NODE_REPL_BINARY,
  ),
  require = createRequire(import.meta.url),
  cache = new Map();
function originalModule(name: string): any {
  if (cache.has(name)) return cache.get(name);
  const module = { exports: {} };
  new Function("require", "module", files[name])(
    (dependency: string) =>
      dependency.startsWith("./")
        ? originalModule(dependency.slice(2))
        : require(dependency),
    module,
  );
  cache.set(name, module.exports);
  return module.exports;
}
const Original = originalModule(
  "privileged-node-repl.js",
).createPrivilegedWorkerRuntime;
const tick = () => new Promise((r) => setImmediate(r));
function fixture(factory: any) {
  const context = createExecContext<any>(),
    pendingRequests = new Map(),
    messages: any[] = [];
  let response: any = { ok: true, value: { fixture: true } },
    telemetry: any = { version: 1 };
  const state = {
    id: "fixture",
    gaasBrowserConfig: { fixture: 1 },
    responseMeta: null,
    contentItems: [],
    pendingBackgroundTasks: new Set(),
    formElicitationSupported: true,
  };
  const base = {
    write: (value: unknown) => state.contentItems.push(value as never),
  };
  const runtime = {
    nodeRepl: base,
    execContext: context,
    pendingRequests,
    send: (message: any) => {
      messages.push(message);
      if (
        ["config_action", "launch_services_action", "elicit"].includes(
          message.type,
        )
      )
        queueMicrotask(() => {
          const resolver = pendingRequests.get(message.id);
          pendingRequests.delete(message.id);
          resolver(response);
        });
    },
  };
  const privileged = factory({
    runtime,
    env: { FIXTURE: "yes" },
    getTelemetryBridge: () => telemetry,
  });
  context.activate("fixture");
  return {
    privileged,
    state,
    context,
    messages,
    base,
    setResponse: (value: any) => {
      response = value;
    },
    setTelemetry: (value: any) => {
      telemetry = value;
    },
  };
}
async function result(run: () => any) {
  try {
    return { value: await run() };
  } catch (e) {
    return { error: (e as Error).message, name: (e as Error).name };
  }
}
test("privileged runtime assembles frozen descriptors over base bridge with live context/telemetry", async () => {
  const runs = [];
  for (const factory of [Original, createPrivilegedWorkerRuntime]) {
    const f = fixture(factory),
      node = f.privileged.nodeRepl;
    assert.equal(Object.getPrototypeOf(node), f.base);
    assert.ok(Object.isFrozen(node));
    assert.ok(Object.isFrozen(node.config));
    assert.ok(Object.isFrozen(node.launchServices));
    assert.ok(Object.isFrozen(node.otel));
    assert.equal(Object.hasOwn(node, "write"), false);
    const descriptors = Object.fromEntries(
      Object.entries(Object.getOwnPropertyDescriptors(node)).map(
        ([name, d]: any) => [
          name,
          {
            enumerable: d.enumerable,
            configurable: d.configurable,
            writable: d.writable,
            get: typeof d.get,
            valueType: typeof d.value,
          },
        ],
      ),
    );
    assert.throws(() => node.gaasBrowserConfig, /context not found/);
    assert.equal(node.telemetry.version, 1);
    f.setTelemetry({ version: 2 });
    assert.equal(node.telemetry.version, 2);
    f.context.run(f.state, () => {
      assert.equal(node.gaasBrowserConfig, f.state.gaasBrowserConfig);
      node.write("inherited");
      node.emitContentItem("content");
      assert.throws(() => node.emitContentItem(1), /expected a string/);
      node.setResponseMeta({ a: { value: 1 } });
      node.setResponseMeta({ b: 2 });
      node.otel.log("fixture", { count: 1 });
    });
    node.otel.log("ignored-outside");
    assert.deepEqual(f.state.contentItems, ["inherited", "content"]);
    assert.deepEqual(f.state.responseMeta, { a: { value: 1 }, b: 2 });
    runs.push({ descriptors, messages: f.messages });
  }
  assert.deepEqual(runs[1], runs[0]);
  assert.equal(runs[1].descriptors.config.writable, false);
});
test("privileged operations preserve launch validation, config wire IDs and host error/default results", async () => {
  const runs = [];
  for (const factory of [Original, createPrivilegedWorkerRuntime]) {
    const f = fixture(factory),
      node = f.privileged.nodeRepl,
      values = [];
    values.push(await result(() => node.config.read()));
    await f.context.run(f.state, async () => {
      for (const target of [
        null,
        [],
        {},
        { applicationPath: " " },
        { applicationPath: "x", bundleIdentifier: "y" },
        { applicationPath: "x", extra: 1 },
        { applicationPath: " /fixture/app " },
        { bundleIdentifier: " fixture.app " },
      ])
        values.push(
          await result(() =>
            node.launchServices.openApplication(Promise.resolve(target)),
          ),
        );
      values.push(
        await result(() =>
          node.config.writeValue({ keyPath: "fixture", value: 1 }),
        ),
      );
      f.setResponse({ ok: true });
      values.push(await result(() => node.config.read()));
      f.setResponse({ ok: true, value: undefined });
      values.push(await result(() => node.config.readRequirements()));
      f.setResponse({ ok: false, error: "" });
      values.push(await result(() => node.config.readToml("fixture.toml")));
      f.setResponse({ ok: false, error: "fixture denied" });
      values.push(
        await result(() =>
          node.launchServices.openApplication({ bundleIdentifier: "fixture" }),
        ),
      );
    });
    runs.push({ values, messages: f.messages });
  }
  assert.deepEqual(runs[1], runs[0]);
  assert.equal(runs[1].messages[0].application_path, "/fixture/app");
  assert.equal(runs[1].messages[0].id, "fixture-privileged-node-repl-0");
  assert.ok(
    runs[1].values.some(
      (v: any) => v.error === "nodeRepl.config.readToml failed",
    ),
  );
});
test("suspended timeout resumes on failure and lifecycle hooks connect to composed runtime", async () => {
  const runs = [];
  for (const factory of [Original, createPrivilegedWorkerRuntime]) {
    const f = fixture(factory),
      node = f.privileged.nodeRepl,
      trace: string[] = [],
      values = [];
    values.push(await result(() => node.withSuspendedTimeout(() => 1)));
    await f.context.run(f.state, async () => {
      values.push(await result(() => node.withSuspendedTimeout(1)));
      values.push(await result(() => node.withSuspendedTimeout(() => 42)));
      values.push(
        await result(() =>
          node.withSuspendedTimeout(async () => {
            throw new Error("fixture failure");
          }),
        ),
      );
      node.addAfterSubmittedCodeHook({
        timeoutMs: 100,
        run: () => trace.push("after"),
      });
      const remove = node.addTurnEndedHandler({
        timeoutMs: 100,
        run: () => trace.push("turn"),
      });
      await f.privileged.afterSubmittedCodeHooks.run({});
      await f.privileged.turnEndedHandlers.run({});
      remove();
      await f.privileged.turnEndedHandlers.run({});
      f.setResponse({ ok: true, action: "accept", content: { x: 1 } });
      values.push(
        await result(() =>
          node.createElicitation({ message: "fixture approval" }),
        ),
      );
    });
    await tick();
    runs.push({ values, trace, messages: f.messages });
  }
  assert.deepEqual(runs[1], runs[0]);
  assert.deepEqual(
    runs[1].messages.slice(0, 4).map((m: any) => m.type),
    ["suspend_timeout", "resume_timeout", "suspend_timeout", "resume_timeout"],
  );
  assert.deepEqual(runs[1].trace, ["after", "turn"]);
});
