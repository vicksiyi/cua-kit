import test from "node:test";
import assert from "node:assert/strict";
import { extractNodeReplSources } from "../scripts/extract-node-repl-sources.mjs";
import { createPrivilegedNodeReplConfig } from "../packages/node-repl/src/privileged_config";
import { isPlainObject } from "../packages/node-repl/src/worker_values";
const { files } = await extractNodeReplSources(
  process.env.CUA_NODE_REPL_BINARY,
);
const module = { exports: {} as any };
new Function("module", files["privileged-node-repl-config.js"])(module);
const original = module.exports.createPrivilegedNodeReplConfig;
async function result(operation: () => unknown) {
  try {
    return { value: await operation() };
  } catch (error) {
    return { error: (error as Error).message, name: (error as Error).name };
  }
}
function fixture(factory: any) {
  const calls: string[] = [];
  const bridge = factory({
    isPlainObject,
    handlePrivilegedNodeReplOperation: (
      name: string,
      build: () => Promise<unknown>,
    ) => {
      calls.push(name);
      return build();
    },
  });
  return { calls, bridge };
}
async function compare(cases: [string, unknown[]][]) {
  const runs = [];
  for (const factory of [original, createPrivilegedNodeReplConfig]) {
    const { calls, bridge } = fixture(factory);
    const values = [];
    for (const [method, args] of cases)
      values.push(await result(() => bridge[method](...args)));
    runs.push({
      calls,
      values,
      keys: Object.keys(bridge),
      frozen: Object.isFrozen(bridge),
    });
  }
  assert.deepEqual(runs[1], runs[0]);
  assert.equal(runs[1].frozen, true);
  return runs[1];
}
test("privileged TOML bridge preserves exact path guard and cloned-object payloads", async () => {
  const paths = [
    undefined,
    null,
    "",
    "config.toml",
    "CONFIG.TOML",
    " config.toml ",
    "nested/config.toml",
    "settings.toml",
    1,
  ];
  const cases: [string, unknown[]][] = [];
  for (const path of paths) {
    cases.push(
      ["readToml", [path]],
      ["writeToml", [path, { nested: { value: 1 } }]],
    );
  }
  for (const value of [
    null,
    [],
    1,
    "x",
    { x: undefined },
    { date: new Date(0) },
    new Map([["x", 1]]),
    { fn: () => {} },
  ])
    cases.push(["writeToml", ["fixture.toml", value]]);
  const run = await compare(cases);
  assert.ok(
    run.values.some((value: any) =>
      value.error?.includes("does not allow writing"),
    ),
  );
  const { bridge } = fixture(createPrivilegedNodeReplConfig),
    source = { nested: { value: 1 } };
  const message = await bridge.writeToml(
    Promise.resolve("fixture.toml"),
    Promise.resolve(source),
  );
  source.nested.value = 2;
  assert.equal(message.value.nested.value, 1);
  assert.equal(message.action, "write_toml");
});
test("privileged config reads preserve option validation and requirement request shape", async () => {
  const options = [
    undefined,
    null,
    [],
    {},
    { cwd: null },
    { cwd: "" },
    { cwd: 2 },
    { includeLayers: null },
    { includeLayers: true },
    { includeLayers: false },
    { includeLayers: "true" },
    { extra: true },
  ];
  const run = await compare([
    ...options.map((value) => ["read", [value]] as [string, unknown[]]),
    ["readRequirements", []],
  ]);
  assert.deepEqual(run.values[0], {
    value: {
      type: "config_action",
      action: "read_config",
      cwd: undefined,
      include_layers: false,
    },
  });
  assert.deepEqual(run.values.at(-1), {
    value: { type: "config_action", action: "read_config_requirements" },
  });
});
test("privileged config writes preserve JSON compatibility, merge/version rules and field access order", async () => {
  const values = [
    null,
    true,
    false,
    0,
    1.5,
    "",
    [],
    { nested: [1, "x", null] },
    undefined,
    NaN,
    Infinity,
    1n,
    () => {},
    Symbol("x"),
    { x: undefined },
    [undefined],
    new Date(0),
    new Map([["a", 1]]),
    new Array(2),
  ];
  const cases: [string, unknown[]][] = values.map((value) => [
    "writeValue",
    [{ keyPath: " fixture.key ", value }],
  ]);
  for (const keyPath of ["", " ", 1, null])
    cases.push(["writeValue", [{ keyPath, value: 1 }]]);
  for (const mergeStrategy of [undefined, "replace", "upsert", "merge", null])
    for (const expectedVersion of [undefined, null, "", 1])
      cases.push([
        "writeValue",
        [{ keyPath: "key", value: 1, mergeStrategy, expectedVersion }],
      ]);
  cases.push(["writeValue", [null]], ["writeValue", [[]]]);
  await compare(cases);
  const traces = [];
  for (const factory of [original, createPrivilegedNodeReplConfig]) {
    const trace: string[] = [];
    const { bridge } = fixture(factory);
    const request = Object.defineProperties(
      {},
      Object.fromEntries(
        Object.entries({
          keyPath: "key",
          mergeStrategy: "replace",
          value: { n: 1 },
          expectedVersion: "v",
        }).map(([key, value]) => [
          key,
          {
            get() {
              trace.push(key);
              return value;
            },
            enumerable: true,
          },
        ]),
      ),
    );
    const message = await bridge.writeValue(request);
    traces.push({ trace, message });
  }
  assert.deepEqual(traces[1], traces[0]);
  assert.deepEqual(traces[1].trace, [
    "keyPath",
    "mergeStrategy",
    "value",
    "expectedVersion",
  ]);
});
test("privileged batch writes retain edit ordering, sparse arrays and asynchronous input timing", async () => {
  const cases: [string, unknown[]][] = [
    ["batchWrite", [undefined]],
    ["batchWrite", [null]],
    ["batchWrite", [{}]],
    ["batchWrite", [{ edits: [] }]],
    ["batchWrite", [{ edits: [null] }]],
    [
      "batchWrite",
      [
        {
          edits: [
            { keyPath: "a", value: 1 },
            { keyPath: "b", value: null, mergeStrategy: "replace" },
          ],
          expectedVersion: null,
          reloadUserConfig: true,
        },
      ],
    ],
    ["batchWrite", [{ edits: new Array(2) }]],
  ];
  for (const reloadUserConfig of [undefined, false, true, null, "yes"])
    cases.push([
      "batchWrite",
      [{ edits: [{ keyPath: "a", value: 1 }], reloadUserConfig }],
    ]);
  await compare(cases);
  for (const factory of [original, createPrivilegedNodeReplConfig]) {
    const { calls, bridge } = fixture(factory);
    let release!: (value: unknown) => void;
    const pending = new Promise((r) => {
      release = r;
    });
    const output = bridge.batchWrite(pending);
    assert.deepEqual(calls, ["nodeRepl.config.batchWrite"]);
    release({ edits: [{ keyPath: "a", value: 1 }] });
    assert.equal((await output).reload_user_config, false);
  }
});
