import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings, serviceExpression } from "./service-source";
import { AuthorityBuilder } from "../packages/browser/src/service/security/authority_builder";
import { AuthorityGateError } from "../packages/browser/src/service/errors/authority_gate_error";
import {
  shouldBypassGate,
  assertNavigationUrlAllowed,
  navigationUrlPolicy,
  urlSchemeCategory,
} from "../packages/browser/src/service/security/gate_policy";
const symbols = [
  "bf",
  "DX",
  "OX",
  "Oe",
  "St",
  "wa",
  "j8",
  "JT",
  "el",
  "F8",
  "U8",
  "L8",
  "q8",
  "qe",
  "UB",
  "IX",
  "Es",
  "qB",
  "ze",
  "B_",
  "NX",
  "FX",
  "LX",
  "XB",
  "Li",
  "Fn",
  "KX",
  "Qt",
  "Zt",
  "dl",
  "ii",
  "y5",
  "SC",
  "zX",
  "zT",
  "ZT",
  "$B",
  "vy",
  "O8",
];
const source = originalServiceBindings(symbols, {
  Tn: new Function("var Tn; return " + serviceExpression("Tn"))(),
});
const gates = Object.keys(source.OX);
function errorView(error: any): any {
  if (error == null) return error;
  return {
    name: error.name,
    message: error.message,
    reason: error.reason,
    gate: error.gate,
    context: error.context,
    urlPolicyReason: error.urlPolicyReason,
    urlSchemeCategory: error.urlSchemeCategory,
    cause: errorView(error.cause),
  };
}
async function outcome(fn: () => any) {
  try {
    await fn();
    return "ok";
  } catch (error) {
    return errorView(error);
  }
}
function snapshot(builder: any) {
  return Object.fromEntries(
    Object.entries(builder)
      .filter(([key]) => key !== "options")
      .map(([key, value]) => [
        key,
        value instanceof Map || value instanceof Set ? [...value] : value,
      ]),
  );
}
function populate(builder: any) {
  builder
    .triggerNetworkEgress("https://a.test/path")
    .observeContent("https://a.test/other", { bypassApproval: true })
    .observeContent("file:///tmp/page?x#y")
    .actInFrame("https://b.test/frame")
    .readBrowsingHistory({ query: "one" })
    .readBrowsingHistory({ query: "one" })
    .uploadFiles("https://a.test/up")
    .downloadFiles({ type: "file", url: "https://a.test/file" })
    .downloadFiles({ type: "page-assets", pageUrl: "https://a.test/page" })
    .downloadFiles({
      type: "page-asset-fetch",
      pageUrl: "https://a.test/page",
      assetUrl: "https://a.test/img",
    })
    .downloadFiles({
      type: "page-asset-fetch",
      pageUrl: "https://a.test/page",
      assetUrl: "https://asset.test/img",
    })
    .useCdp("https://a.test/raw")
    .useWebMcp("https://b.test/tool", { name: "tool" }, 1);
}
async function scenario(
  original: boolean,
  mode: string,
  failure?: { gate: string; phase: string; url?: boolean; ordinary?: boolean },
) {
  const trace: any[] = [],
    logs: any[] = [],
    Constructor = original ? source.bf : AuthorityBuilder,
    ErrorClass = original ? source.Oe : AuthorityGateError;
  const runtime = { env: { BROWSER_USE_SECURITY_MODE: mode } };
  const fail = () => {
    throw failure?.ordinary
      ? new Error("provider broke")
      : new ErrorClass(
          failure!.gate,
          failure?.url ? "navigation_url_policy_blocked" : "user_declined",
          "denied",
          {
            origin: "https://user:pass@a.test/path?secret",
            toolName: "tool",
            source: "test",
            ...(failure?.url
              ? {
                  urlPolicyReason: "unsupported_protocol",
                  urlSchemeCategory: "file",
                }
              : {}),
          },
        );
  };
  const providers = Object.fromEntries(
    gates.map((gate) => [
      gate,
      (...args: any[]) => {
        trace.push(["prepare", gate, args]);
        if (failure?.gate === gate && failure.phase === "sync") fail();
        if (failure?.gate === gate && failure.phase === "reject")
          return Promise.reject().catch(fail);
        if (gate.endsWith("Approval"))
          return Promise.resolve(async () => {
            trace.push(["approve", gate, args]);
            if (failure?.gate === gate && failure.phase === "approval") fail();
            return { gate, source: "test" };
          });
        return gate === "urlPolicy" ? undefined : Promise.resolve();
      },
    ]),
  );
  const builder = new Constructor({
    providers,
    shouldBypassGate: (gate: string) => {
      trace.push(["bypass", gate]);
      return (original ? source.KX : shouldBypassGate)(runtime, gate);
    },
    displayOptions: {
      elicitationDisplayName: "Test browser",
      browserBackend: "extension",
      browserFamily: "chrome",
    },
    otel: { log: (...args: any[]) => logs.push(args) },
  });
  populate(builder);
  const result = await outcome(() => builder.assert());
  await Promise.resolve();
  return { snapshot: snapshot(builder), result, trace, logs };
}
test("authority builder preserves gate accumulation, bypass routing and serial approval order", async () => {
  for (const mode of [
    "",
    "disabled-for-local-testing",
    "gaas-browser-environment",
    " invalid ",
  ])
    assert.deepEqual(await scenario(false, mode), await scenario(true, mode));
});
test("authority errors preserve sync/rejected/approval failure boundaries, audit results and specialized URL errors", async () => {
  for (const failure of [
    { gate: "urlPolicy", phase: "sync", url: true },
    { gate: "hostUrl", phase: "reject" },
    { gate: "originApproval", phase: "approval" },
    { gate: "downloadApproval", phase: "approval" },
    { gate: "webMcpConfiguration", phase: "sync", ordinary: true },
    { gate: "fullCdpApproval", phase: "reject", ordinary: true },
  ])
    assert.deepEqual(
      await scenario(false, "", failure),
      await scenario(true, "", failure),
    );
});

test("MCP App authority keys, missing targets and repeated calls retain original state and class shape", async () => {
  for (const isMcpApp of [true, false])
    for (const url of [
      undefined,
      "codex-sandbox://web-sandbox.oaiusercontent.com/page",
      "about:blank",
      "invalid",
      "https://a.test/path",
    ]) {
      const build = async (Constructor: any) => {
        const builder = new Constructor({ isMcpApp });
        const results = [];
        for (const [method, args] of [
          ["actInFrame", [url]],
          ["observeContent", [url, { bypassApproval: true }]],
          ["useWebMcp", [url, { name: "tool" }, 4]],
          ["triggerNetworkEgress", ["https://a.test"]],
          ["observeContent", ["https://a.test", { bypassApproval: true }]],
        ] as any)
          results.push(
            await outcome(() => {
              assert.equal(builder[method](...args), builder);
            }),
          );
        return {
          results,
          state: snapshot(builder),
          keys: Object.keys(builder),
          methods: Object.getOwnPropertyNames(Constructor.prototype)
            .filter((name) => name !== "constructor")
            .map((name) => {
              const d = Object.getOwnPropertyDescriptor(
                Constructor.prototype,
                name,
              )!;
              return [name, d.value.length, d.enumerable];
            }),
        };
      };
      assert.deepEqual(await build(AuthorityBuilder), await build(source.bf));
    }
});

test("navigation URL gates and security-mode routing preserve exact protocol and environment rules", async () => {
  for (const url of [
    "about:blank",
    "about:blank#x",
    " about:blank",
    "https://a.test",
    "HTTP://A.TEST",
    "file:///tmp/a",
    "data:text/html,hi",
    "javascript:alert(1)",
    "chrome-error://x",
    "edge-error://x",
    "blob:https://a.test/a",
    "not a url",
  ]) {
    assert.deepEqual(navigationUrlPolicy(url), source.zT(url));
    assert.equal(urlSchemeCategory(url), source.$B(url));
    assert.deepEqual(
      await outcome(() => assertNavigationUrlAllowed(url)),
      await outcome(() => source.zX(url)),
    );
  }
  for (const mode of [
    undefined,
    null,
    0,
    "",
    "disabled-for-local-testing",
    " gaas-browser-environment ",
    "invalid",
  ])
    for (const gate of [...gates, "unknown"])
      assert.equal(
        shouldBypassGate({ env: { BROWSER_USE_SECURITY_MODE: mode } }, gate),
        source.KX({ env: { BROWSER_USE_SECURITY_MODE: mode } }, gate),
      );
});

async function concurrency(Constructor: any) {
  const policy = Promise.withResolvers<void>(),
    prepared = Promise.withResolvers<void>(),
    trace: string[] = [];
  const providers = Object.fromEntries(
    gates.map((gate) => [
      gate,
      () => {
        trace.push("prepare:" + gate);
        if (gate === "hostUrl") return policy.promise;
        if (gate === "originApproval")
          return prepared.promise.then(() => async () => {
            trace.push("approve");
          });
      },
    ]),
  );
  const builder = new Constructor({
    providers,
    shouldBypassGate: () => false,
    otel: {
      log: () => {
        trace.push("log");
        throw new Error("ignored telemetry");
      },
    },
  });
  builder.triggerNetworkEgress("https://a.test");
  const pending = builder.assert();
  prepared.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  trace.push("before-policy-resolves");
  policy.resolve();
  await pending;
  return trace;
}
test("authority builder waits for policy and preparation promises before prompting and isolates telemetry failure", async () => {
  const actual = await concurrency(AuthorityBuilder);
  assert.deepEqual(actual, await concurrency(source.bf));
  assert.ok(
    actual.indexOf("approve") > actual.indexOf("before-policy-resolves"),
  );
});
