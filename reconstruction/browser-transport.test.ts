import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { FunctionAgentTransport } from "../packages/browser/dist/runtime/function_agent_transport.js";
import { createDisplaySideEffect } from "../packages/browser/dist/runtime/display.js";
import { Agent } from "../packages/browser/dist/agent.js";
import { Command } from "../packages/browser/dist/commands/command.js";
import { AxClient } from "../packages/browser/dist/ax.js";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const source = await readFile(
  `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js`,
  "utf8",
);
const original = await import(
  `data:text/javascript;base64,${Buffer.from(source + "\nexport {xm as FunctionAgentTransport,m as createDisplaySideEffect,Fl as AxClient,nl as Agent,_ as Command};").toString("base64")}`
);

async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (error) {
    return { error: { name: error.name, message: error.message } };
  }
}

test("function transport preserves raw payload, timeout overwrite, response parsing and sequential effects", async () => {
  async function run(
    Class: any,
    response: any,
    timeoutMs: any,
    failEffect = false,
  ) {
    const log: any[] = [];
    const transport = new Class({
      executeAgentCommand: async (payload: any) => {
        log.push(["execute", payload]);
        return response;
      },
      displaySideEffect: async (value: any) => {
        log.push(["display-start", value]);
        await Promise.resolve();
        if (failEffect) throw new Error("display failed");
        log.push(["display-end", value]);
      },
    });
    const result = await outcome(() =>
      transport.send({
        command: {
          toJSON() {
            log.push(["toJSON"]);
            return { type: "raw", client_timeout_ms: 50, extra: true };
          },
          parse() {
            throw new Error("parse must not be called here");
          },
        },
        timeoutMs,
      }),
    );
    return {
      result,
      log,
      sameResponse: "value" in result && result.value === response,
    };
  }
  for (const response of [
    undefined,
    null,
    false,
    0,
    "",
    "text",
    [],
    {},
    { x: 1 },
    { side_effects: ["one", "two"], nested: { a: 1 } },
    { side_effects: [], value: false },
    { side_effects: ["one", 2], value: "invalid effect is not consumed" },
    { side_effects: null },
    Object.assign(Object.create({ inherited: 3 }), { side_effects: [] }),
  ])
    for (const timeout of [undefined, 0, -1, 10, NaN, Infinity, "10"]) {
      assert.deepEqual(
        await run(FunctionAgentTransport, response, timeout),
        await run(original.FunctionAgentTransport, response, timeout),
      );
    }
  assert.deepEqual(
    await run(FunctionAgentTransport, { side_effects: ["a", "b"] }, 1, true),
    await run(
      original.FunctionAgentTransport,
      { side_effects: ["a", "b"] },
      1,
      true,
    ),
  );
});

test("transport constructor, execution failure, display fallback and receiver semantics match original", async () => {
  for (const options of [undefined, {}, { executeAgentCommand: 3 }, null]) {
    assert.deepEqual(
      await outcome(() => new (FunctionAgentTransport as any)(options)),
      await outcome(() => new original.FunctionAgentTransport(options)),
    );
  }
  const previous = (globalThis as any).display;
  const previousLog = console.log;
  try {
    async function run(Class: any, fallback: "global" | "console" | "throws") {
      const log: any[] = [];
      if (fallback === "global")
        (globalThis as any).display = function (value: any) {
          log.push(["global", value, this === undefined]);
        };
      else if (fallback === "throws")
        (globalThis as any).display = () => {
          throw new Error("fallback failure");
        };
      else (globalThis as any).display = null;
      console.log = (...values) => log.push(["console", ...values]);
      const transport = new Class({
        executeAgentCommand: function () {
          log.push(["execute-this", this === transport]);
          throw new Error("rpc failure");
        },
      });
      const display = await outcome(() => transport.display("hello"));
      const send = await outcome(() =>
        transport.send({ command: { toJSON: () => ({}) } }),
      );
      return { log, display, send };
    }
    for (const fallback of ["global", "console", "throws"] as const)
      assert.deepEqual(
        await run(FunctionAgentTransport, fallback),
        await run(original.FunctionAgentTransport, fallback),
      );
  } finally {
    (globalThis as any).display = previous;
    console.log = previousLog;
  }
});

test("display bridge matches primitive boxing, JSON fallback, image errors and UTF-16 truncation", async () => {
  const cycle: any = {};
  cycle.self = cycle;
  const values = [
    undefined,
    null,
    true,
    false,
    0,
    -0,
    NaN,
    Infinity,
    "abc😀xyz",
    new String("abc"),
    new Boolean(false),
    new Number(NaN),
    new Number(5),
    () => 1,
    Symbol("s"),
    4n,
    cycle,
    { a: 1 },
    [1, undefined],
    { toJSON: () => undefined, toString: () => "fallback" },
    {
      toJSON: () => {
        throw new Error("serialization failed");
      },
    },
    new Uint8Array([1, 2, 3]),
  ];
  async function run(factory: any, value: any, limit: any, fail?: string) {
    const log: any[] = [];
    const display = factory({
      displayTruncateMaxChars: limit,
      displayBridge: {
        async displayImage(value: any) {
          log.push(["image", value, this === undefined]);
          if (fail === "image") throw new Error("image failed");
        },
        async displayValue(value: any) {
          log.push(["value", value, this === undefined]);
          if (fail === "value") throw new Error("value failed");
        },
      },
    });
    return { result: await outcome(() => display(value)), log };
  }
  for (const value of values)
    for (const limit of [undefined, 0, -1, 1, 4, 100, Infinity, 1.5, "4"]) {
      assert.deepEqual(
        await run(createDisplaySideEffect, value, limit),
        await run(original.createDisplaySideEffect, value, limit),
      );
    }
  for (const [value, fail] of [
    [new Uint8Array([1]), "image"],
    ["abc", "value"],
  ])
    assert.deepEqual(
      await run(createDisplaySideEffect, value, 5, fail),
      await run(original.createDisplaySideEffect, value, 5, fail),
    );
});

test("AX -> actual function transport -> display bridge preserves service effects before AX output", async () => {
  async function run(Ax: any, Transport: any, displayFactory: any) {
    const log: any[] = [];
    const transport = new Transport({
      executeAgentCommand: async (payload: any) => {
        log.push(["rpc", payload]);
        if (payload.type === "tab_ax_get_state")
          return { state: "AX", data: "AQID", side_effects: ["service note"] };
        return { side_effects: [] };
      },
      displaySideEffect: displayFactory({
        displayTruncateMaxChars: 1e5,
        displayBridge: {
          displayImage: (v: any) => log.push(["image", v]),
          displayValue: (v: any) => log.push(["value", v]),
        },
      }),
    });
    const ax = new Ax({ browserId: "b", tabId: "t", transport });
    await ax.write("both");
    // Validation does NOT happen in the real function transport, unlike the prior schema-test fixture.
    await ax.click(-1, { duration: 31 });
    return log;
  }
  const actual = await run(
    AxClient,
    FunctionAgentTransport,
    createDisplaySideEffect,
  );
  assert.deepEqual(
    actual,
    await run(
      original.AxClient,
      original.FunctionAgentTransport,
      original.createDisplaySideEffect,
    ),
  );
  assert.equal(actual[1][1].value, "service note");
  assert.equal(actual[2][1].value, "AX");
  assert.equal(actual[4][1].action.target, -1);
});

test("assignment-only constructors preserve inherited setter behavior without emitted TS field initializers", () => {
  function run(Base: any, keys: string[], args: any[]) {
    const log: unknown[] = [];
    class Derived extends Base {}
    for (const key of keys)
      Object.defineProperty(Derived.prototype, key, {
        set(value) {
          log.push([key, typeof value]);
          Object.defineProperty(this, key, {
            value,
            writable: true,
            enumerable: true,
            configurable: true,
          });
        },
        configurable: true,
      });
    const instance = new Derived(...args);
    return { log, keys: Object.keys(instance) };
  }
  const cases = [
    [
      Command,
      original.Command,
      ["type", "schema", "payload"],
      ["command", { parse: (v: any) => v }, {}],
    ],
    [
      FunctionAgentTransport,
      original.FunctionAgentTransport,
      ["executeAgentCommand", "displaySideEffect"],
      [{ executeAgentCommand: () => ({}) }],
    ],
    [
      Agent,
      original.Agent,
      ["documentation", "browsers"],
      [{ transport: {}, createBrowser: () => ({}) }],
    ],
  ];
  for (const [restored, vendor, keys, args] of cases as any)
    assert.deepEqual(run(restored, keys, args), run(vendor, keys, args));
});
