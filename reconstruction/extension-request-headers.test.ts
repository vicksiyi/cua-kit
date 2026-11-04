import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  parseRequestHeaders,
  resolveRequestHeaders,
  createRequestHeaderPolicyClass,
} from "../packages/browser-extension/src/request_headers";
const original = extensionBindings(["hc", "Cp", "cs", "ls", "Sr"], {});
const settle = async (run: () => any) => {
  try {
    return { value: await run() };
  } catch (error: any) {
    return { error: error.message };
  }
};

test("shared request-header parser matches extension cs structure, limits and template preservation", async () => {
  const samples: any[] = [
    undefined,
    null,
    {},
    "headers",
    [],
    [null],
    [{ name: "x", value: 1 }],
    [{ name: "x", value: "v", extra: false }],
    [Object.create({ name: "X-Inherited", value: "ok" })],
    [{ name: "X-Session-{{session_id}}", value: "session={{session_id}}" }],
    [{ name: "x", value: "{unknown}" }],
    [{ name: "", value: "v" }],
    [{ name: "x", value: "\n" }],
    [{ name: "x", value: "é" }],
    [{ name: "x", value: "\x7f" }],
    [{ name: "x", value: " ~" }],
    [
      { name: "X", value: "1" },
      { name: "x", value: "2" },
    ],
    [{ name: "x".repeat(256), value: "" }],
    [{ name: "x".repeat(257), value: "" }],
    [{ name: "x", value: "v".repeat(8192) }],
    [{ name: "x", value: "v".repeat(8193) }],
    Array.from({ length: 16 }, (_, i) => ({ name: `x-${i}`, value: "v" })),
    Array.from({ length: 17 }, (_, i) => ({ name: `x-${i}`, value: "v" })),
    Array(3),
    [{ name: "x", value: "v", [Symbol("ignored")]: true }],
  ];
  for (const name of [
    "authorization",
    "proxy-authorization",
    "cookie",
    "cookie2",
    "host",
    "connection",
    "content-length",
    "transfer-encoding",
    "upgrade",
    "te",
    "trailer",
    "origin",
    "referer",
    "accept-encoding",
    "sec-any",
    "proxy-any",
  ])
    samples.push([{ name: name.toUpperCase(), value: "value" }]);
  for (const sample of samples)
    assert.deepEqual(
      await settle(() => parseRequestHeaders(sample)),
      await settle(() => original.cs(sample)),
    );
  assert.deepEqual(
    parseRequestHeaders([
      { name: "X-{{session_id}}", value: "{{session_id}}" },
    ]),
    [{ name: "X-{{session_id}}", value: "{{session_id}}" }],
  );
});

test("shared request-header resolver matches extension ls expanded limits, collisions and literal replacement", async () => {
  const headers = [{ name: "X-{{session_id}}", value: "{{session_id}}" }];
  for (const session of [
    "session",
    "",
    "$&",
    "$`",
    "{brace}",
    "two words",
    "\n",
    "é",
    "x".repeat(255),
  ])
    assert.deepEqual(
      await settle(() => resolveRequestHeaders(headers, session)),
      await settle(() => original.ls(headers, session)),
    );
  for (const length of [32767, 32768, 32769]) {
    const group = Array.from({ length: 4 }, (_, i) => ({
      name: `x${i}`,
      value: "v".repeat(i === 3 ? length - 8 - 3 * 8192 : 8192),
    }));
    assert.deepEqual(
      await settle(() => resolveRequestHeaders(group, "s")),
      await settle(() => original.ls(group, "s")),
    );
    if (length === 32768)
      assert.equal(resolveRequestHeaders(group, "s").length, 4);
    if (length === 32769)
      assert.throws(
        () => resolveRequestHeaders(group, "s"),
        /Invalid request_headers/,
      );
  }
  assert.deepEqual(
    await settle(() =>
      resolveRequestHeaders(
        [
          { name: "x-{{session_id}}", value: "" },
          { name: "x-s", value: "" },
        ],
        "S",
      ),
    ),
    await settle(() =>
      original.ls(
        [
          { name: "x-{{session_id}}", value: "" },
          { name: "x-s", value: "" },
        ],
        "S",
      ),
    ),
  );
  assert.deepEqual(
    resolveRequestHeaders([{ name: "x", value: "{{session_id}}" }], "$&"),
    [{ name: "x", value: "$&" }],
  );
});

async function policyScenario(useOriginal: boolean) {
  const trace: any[] = [],
    key = "AGENT_REQUEST_HEADER_ENABLED";
  let persisted: any = false,
    failGet = false,
    failSet = false;
  const chrome: any = {
    storage: {
      local: {
        async get(name: string) {
          trace.push(["get", name]);
          if (failGet) throw Error("get failed");
          return { [name]: persisted };
        },
        async set(value: any) {
          trace.push(["set", value]);
          if (failSet) throw Error("set failed");
          persisted = value[key];
        },
      },
    },
  };
  const Policy = useOriginal
    ? extensionBindings(["Pa", "uS"], { chrome }).uS
    : createRequestHeaderPolicyClass(chrome);
  const policy = new Policy(),
    results: any[] = [];
  results.push(await policy.isEnabled(), await policy.applyDecision(false));
  persisted = "true";
  results.push(await policy.isEnabled());
  failGet = true;
  results.push(await settle(() => policy.applyDecision(true)));
  failGet = false;
  failSet = true;
  results.push(await settle(() => policy.applyDecision(true)), policy.enabled);
  failSet = false;
  results.push(await policy.applyDecision(true), policy.enabled);
  persisted = false;
  failGet = true;
  results.push(await policy.isEnabled(), await policy.applyDecision(false));
  failGet = false;
  results.push(await new Policy().isEnabled());
  persisted = true;
  const restored = new Policy();
  results.push(await restored.isEnabled(), await restored.applyDecision(false));
  return { trace, results, ownKeys: Object.keys(policy) };
}
test("request-header opt-in preserves original persisted monotonic decisions, cache and storage failures", async () => {
  const actual = await policyScenario(false);
  assert.deepEqual(actual, await policyScenario(true));
  assert.deepEqual(actual.results, [
    false,
    false,
    false,
    { error: "get failed" },
    { error: "set failed" },
    false,
    true,
    true,
    true,
    true,
    false,
    true,
    true,
  ]);
});
