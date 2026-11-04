import test from "node:test";
import assert from "node:assert/strict";
import { parse } from "acorn";
import { extractNodeReplSources } from "../scripts/extract-node-repl-sources.mjs";
import { createLifecycleHandlers } from "../packages/node-repl/src/lifecycle_handlers";
import { createPrivilegedHostOperations } from "../packages/node-repl/src/privileged_host_operations";
import { createExecContext } from "../packages/node-repl/src/exec_context";
const { files } = await extractNodeReplSources(
  process.env.CUA_NODE_REPL_BINARY,
);
function declarations(source: string, names: string[]) {
  return parse(source, { ecmaVersion: "latest", sourceType: "script" })
    .body.filter(
      (n: any) => n.type === "FunctionDeclaration" && names.includes(n.id.name),
    )
    .map((n) => source.slice(n.start, n.end))
    .join("\n");
}
const original = new Function(
  "Buffer",
  declarations(files["worker-runtime.js"], [
    "isPlainObject",
    "makeRejectedThenable",
    "trackExecBackgroundOperation",
  ]) +
    declarations(files["privileged-node-repl.js"], [
      "createLifecycleHandlers",
      "createPrivilegedHostOperations",
    ]) +
    ";return {createLifecycleHandlers,createPrivilegedHostOperations};",
)(Buffer);
async function result(run: () => any) {
  try {
    return { value: await run() };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
test("lifecycle handlers preserve validation, snapshots, removal and best-effort timeout behavior", async () => {
  const results = [];
  for (const factory of [
    original.createLifecycleHandlers,
    createLifecycleHandlers,
  ]) {
    const handlers = factory("addTurnEndedHandler"),
      trace: string[] = [],
      errors = [];
    for (const options of [
      null,
      {},
      [],
      { run: () => {}, timeoutMs: 0 },
      { run: () => {}, timeoutMs: 1.5 },
      { run: 1, timeoutMs: 3 },
    ])
      errors.push(await result(() => handlers.add(options)));
    let removeSecond: () => boolean;
    handlers.add({
      timeoutMs: 50,
      run: () => {
        trace.push("one");
        removeSecond();
        handlers.add({ timeoutMs: 50, run: () => trace.push("new") });
        throw new Error("ignored");
      },
    });
    removeSecond = handlers.add({
      timeoutMs: 50,
      run: () => trace.push("two"),
    });
    await handlers.run({});
    await handlers.run({});
    assert.deepEqual(trace, ["one", "two", "one", "new"]);
    assert.equal(removeSecond(), false);
    let finish!: () => void;
    const timed = factory("timeout");
    timed.add({
      timeoutMs: 5,
      run: () =>
        new Promise<void>((r) => {
          finish = r;
        }),
    });
    timed.add({ timeoutMs: 50, run: () => trace.push("after-timeout") });
    await timed.run(null);
    finish();
    assert.equal(trace.at(-1), "after-timeout");
    results.push({ trace, errors });
  }
  assert.deepEqual(results[1], results[0]);
});
test("concurrent lifecycle handlers start together and await every handler", async () => {
  for (const factory of [
    original.createLifecycleHandlers,
    createLifecycleHandlers,
  ]) {
    const handlers = factory("parallel", true),
      trace: string[] = [];
    let release!: () => void;
    handlers.add({
      timeoutMs: 1000,
      run: async () => {
        trace.push("first-start");
        await new Promise<void>((r) => {
          release = r;
        });
        trace.push("first-end");
      },
    });
    handlers.add({
      timeoutMs: 1000,
      run: () => {
        trace.push("second");
        release();
      },
    });
    await handlers.run({});
    assert.deepEqual(trace, ["first-start", "second", "first-end"]);
  }
});
function fixture(factory: any, supported = true) {
  const execContext = createExecContext<any>(),
    pendingRequests = new Map(),
    messages: any[] = [];
  let response: any = { ok: true, action: "accept" };
  const state = {
    id: "exec",
    formElicitationSupported: supported,
    pendingBackgroundTasks: new Set(),
  };
  execContext.activate("exec");
  const api = factory({
    execContext,
    pendingRequests,
    send: (message: any) => {
      messages.push(message);
      queueMicrotask(() => {
        const settle = pendingRequests.get(message.id);
        pendingRequests.delete(message.id);
        settle(response);
      });
    },
  });
  return {
    api,
    state,
    execContext,
    messages,
    setResponse: (value: any) => {
      response = value;
    },
  };
}
test("elicitation enforces active context/capability and preserves request/response projections", async () => {
  const results = [];
  for (const factory of [
    original.createPrivilegedHostOperations,
    createPrivilegedHostOperations,
  ]) {
    const f = fixture(factory),
      values = [];
    values.push(
      await result(() => f.api.createElicitation({ message: "outside" })),
    );
    await f.execContext.run(f.state, async () => {
      for (const request of [
        null,
        [],
        {},
        { message: "" },
        { message: " " },
        { message: "x", extra: 1 },
        { message: "x", meta: [] },
        { message: " x " },
        {
          message: "x",
          meta: { n: 1 },
          requestedSchema: { type: "object", properties: {} },
        },
      ])
        values.push(
          await result(() => f.api.createElicitation(Promise.resolve(request))),
        );
      f.setResponse({
        ok: true,
        action: "decline",
        content: { why: "fixture" },
        _meta: { persist: "session" },
      });
      values.push(
        await result(() => f.api.createElicitation({ message: "x" })),
      );
      f.setResponse({ ok: false, error: "" });
      values.push(
        await result(() => f.api.createElicitation({ message: "x" })),
      );
    });
    const disabled = fixture(factory, false);
    values.push(
      await disabled.execContext.run(disabled.state, () =>
        result(() => disabled.api.createElicitation({ message: "x" })),
      ),
    );
    assert.equal(disabled.messages.length, 0);
    assert.ok(f.state.pendingBackgroundTasks.size > 0);
    results.push({ values, messages: f.messages });
  }
  assert.deepEqual(results[1], results[0]);
  assert.equal(results[1].messages[0].message, " x ");
  assert.deepEqual(results[1].messages[0].requested_schema, {
    type: "object",
    properties: {},
  });
});
test("authenticated fetch retains originating context, normalized wire request and no drain tracking", async () => {
  const results = [];
  for (const factory of [
    original.createPrivilegedHostOperations,
    createPrivilegedHostOperations,
  ]) {
    const f = fixture(factory),
      values = [];
    values.push(
      await result(() => f.api.authenticatedFetch("https://fixture.invalid/")),
    );
    await f.execContext.run(f.state, async () => {
      f.execContext.activate("new-exec");
      for (const status of [200, 204, 205, 304]) {
        f.setResponse({
          ok: true,
          response: {
            status: String(status),
            headers: [{ name: "x-fixture", value: "yes" }],
            body_base64: Buffer.from("body").toString("base64"),
            status_text: "",
          },
        });
        const response = await f.api.authenticatedFetch(
          Promise.resolve("https://fixture.invalid/path"),
          { method: "POST", body: "payload", headers: { "X-Input": "value" } },
        );
        values.push({
          status: response.status,
          text: await response.text(),
          header: response.headers.get("x-fixture"),
        });
        assert.equal(f.state.pendingBackgroundTasks.size, 0);
      }
      for (const response of [
        { ok: false, error: "fixture failure" },
        { ok: false },
        { ok: true },
      ]) {
        f.setResponse(response);
        values.push(
          await result(() =>
            f.api.authenticatedFetch("https://fixture.invalid/"),
          ),
        );
      }
    });
    results.push({ values, messages: f.messages });
  }
  assert.deepEqual(results[1], results[0]);
  assert.equal(results[1].messages[0].exec_id, "exec");
  assert.equal(
    results[1].messages[0].request.body_base64,
    Buffer.from("payload").toString("base64"),
  );
  assert.equal(results[1].values[2].text, "");
});
