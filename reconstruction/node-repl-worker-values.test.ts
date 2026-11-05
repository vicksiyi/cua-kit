import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import vm from "node:vm";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { extractNodeReplSources } from "../scripts/extract-node-repl-sources.mjs";
import * as restored from "../packages/node-repl/src/worker_values";
import {
  makeRejectedThenable,
  trackExecBackgroundOperation,
} from "../packages/node-repl/src/background_operations";
import { createExecContext } from "../packages/node-repl/src/exec_context";
const { files } = await extractNodeReplSources(
  process.env.CUA_NODE_REPL_BINARY,
);
const realmModule = { exports: {} as any };
new Function("module", files["realmChecks.js"])(realmModule);
const require = createRequire(import.meta.url),
  module = { exports: {} };
const original = new Function(
  "require",
  "module",
  files["worker-runtime.js"] +
    ";return {getErrorDataProperty,isPlainObject,deepFreeze,formatLog,toByteArray,encodeByteImage,sniffImageMimeType,normalizeEmitImageValue,makeRejectedThenable,trackExecBackgroundOperation,createExecContext};",
)(
  (name: string) =>
    name === "./realmChecks.js" ? realmModule.exports : require(name),
  module,
);
const outcome = (run: () => unknown) => {
  try {
    return { value: run() };
  } catch (e) {
    return { error: (e as Error).message, name: (e as Error).name };
  }
};
test("worker value helpers preserve error descriptors, frozen cycles and log formatting", () => {
  const getter = Object.defineProperty({}, "message", {
    get() {
      throw new Error("must not invoke getter");
    },
  });
  const proxy = new Proxy(
    { message: "secret" },
    {
      getOwnPropertyDescriptor() {
        throw new Error("must not inspect proxy");
      },
      getPrototypeOf() {
        throw new Error("must not inspect proxy");
      },
    },
  );
  const inherited = Object.create({ message: "inherited" });
  for (const value of [
    null,
    undefined,
    1,
    "x",
    [],
    {},
    new Date(0),
    getter,
    proxy,
    inherited,
    new Error("fixture"),
  ]) {
    assert.deepEqual(
      outcome(() => restored.getErrorDataProperty(value, "message")),
      outcome(() => original.getErrorDataProperty(value, "message")),
    );
    assert.equal(restored.isPlainObject(value), original.isPlainObject(value));
  }
  assert.equal(restored.getErrorDataProperty(getter, "message"), undefined);
  assert.equal(
    restored.getErrorDataProperty(inherited, "message"),
    "inherited",
  );
  for (const freeze of [original.deepFreeze, restored.deepFreeze]) {
    const value: any = { child: { a: [1] } };
    value.self = value;
    assert.equal(freeze(value), value);
    assert.ok(Object.isFrozen(value.child.a));
    const skipped = { child: {} };
    Object.freeze(skipped);
    freeze(skipped);
    assert.equal(Object.isFrozen(skipped.child), false);
  }
  assert.equal(
    restored.formatLog(["x", null, { a: [1, 2] }, 42]),
    original.formatLog(["x", null, { a: [1, 2] }, 42]),
  );
});
test("worker image normalization matches original bytes, views, signatures and local-file behavior", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cua-worker-images-"));
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
  const filepath = path.join(dir, "fixture.png");
  await writeFile(filepath, png);
  try {
    const foreign = vm.runInNewContext("new Uint8Array([255,216,255,1])");
    const offset = new Uint8Array([0, ...png, 0]);
    const view = new DataView(offset.buffer, 1, png.length);
    const cases = [
      null,
      undefined,
      "",
      "https://example.com/a.png",
      "DATA:image/png;base64,AA==",
      pathToFileURL(filepath).href,
      pathToFileURL(path.join(dir, "missing")).href,
      png,
      foreign,
      view,
      png.buffer,
      new Uint8Array(),
      Uint8Array.from([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]),
      Uint8Array.from([1, 2]),
      { bytes: png, mimeType: "image/custom" },
      { bytes: png, mimeType: "" },
      { bytes: png, mimeType: "image/png", extra: true },
      { bytes: [], mimeType: "image/png" },
    ];
    for (const value of cases)
      assert.deepEqual(
        outcome(() => restored.normalizeEmitImageValue(value)),
        outcome(() => original.normalizeEmitImageValue(value)),
      );
    assert.equal(restored.toByteArray(png), png);
    assert.deepEqual([...restored.toByteArray(view)!], [...png]);
    assert.equal(restored.toByteArray({}), null);
    assert.equal(
      restored.normalizeEmitImageValue(png).image_url,
      "data:image/png;base64,iVBORw0KGgoB",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("tracked operations preserve observation semantics for then/catch/finally and deferred rejection", async () => {
  for (const lib of [
    original,
    { makeRejectedThenable, trackExecBackgroundOperation },
  ]) {
    for (const method of ["none", "then", "catch", "finally"])
      for (const fails of [false, true]) {
        const state = { pendingBackgroundTasks: new Set<Promise<any>>() };
        const error = new Error("fixture");
        const operation = fails ? Promise.reject(error) : Promise.resolve(42);
        const tracked = lib.trackExecBackgroundOperation(state, operation);
        if (method !== "none") {
          try {
            await tracked[method](
              method === "finally" ? () => {} : (value: any) => value,
            );
          } catch (e) {
            assert.equal(e, error);
          }
        }
        const [result] = await Promise.all(state.pendingBackgroundTasks);
        assert.equal(result.ok, !fails);
        assert.equal(result.observation.observed, method !== "none");
        assert.equal(result.error, fails ? error : null);
      }
    const error = new Error("lazy");
    const lazy = lib.makeRejectedThenable(error);
    await assert.rejects(Promise.resolve(lazy), (e) => e === error);
    assert.equal(await lazy.catch(() => 7), 7);
    let finalized = false;
    await assert.rejects(
      lazy.finally(() => {
        finalized = true;
      }),
      (e) => e === error,
    );
    assert.ok(finalized);
  }
});
test("execution context keeps originating async store but rejects outputs from inactive calls", async () => {
  for (const factory of [original.createExecContext, createExecContext]) {
    const context = factory();
    assert.equal(context.getOptional(), null);
    assert.throws(() => context.getCurrent(), /exec context not found/);
    const a = { id: "a" },
      b = { id: "b" };
    context.activate("a");
    let release!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((r) => {
      started = r;
    });
    const late = context.run(a, async () => {
      assert.equal(context.getCurrent(), a);
      started();
      await new Promise<void>((r) => {
        release = r;
      });
      assert.equal(context.getOptional(), a);
      assert.equal(context.getAsync(), a);
      assert.throws(() => context.getCurrent(), /exec context not found/);
    });
    await ready;
    context.activate("b");
    context.clear("a");
    assert.equal(context.activeId, "b");
    context.run(b, () => assert.equal(context.getCurrent(), b));
    release();
    await late;
    context.clear("b");
    assert.equal(context.activeId, null);
    for (const id of ["", 0, null])
      context.run({ id }, () => assert.equal(context.getOptional(), null));
  }
});

test("image unsupported-field errors preserve the updated machine-readable code", () => {
  for (const library of [original, restored]) {
    assert.throws(
      () =>
        library.normalizeEmitImageValue({
          bytes: new Uint8Array([1]),
          mimeType: "image/png",
          extra: true,
        }),
      (error) => (error as any).code === "NODE_REPL_IMAGE_UNSUPPORTED_KEYS",
    );
    assert.throws(
      () => library.normalizeEmitImageValue({ unrelated: true }),
      (error) =>
        (error as any).code === undefined &&
        (error as Error).message.includes("unsupported value"),
    );
  }
});
