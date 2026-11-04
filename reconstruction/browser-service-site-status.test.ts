import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings, serviceExpression } from "./service-source";
import {
  SiteStatus,
  siteStatusRequest,
  siteStatusBackend,
  siteStatusBlocked,
} from "../packages/browser/src/service/security/site_status";
import { approvalRuntime } from "../packages/browser/src/service/security/approval";
const names = [
  "D_",
  "qX",
  "eC",
  "W8",
  "$8",
  "G8",
  "QT",
  "H8",
  "YT",
  "N8",
  "xy",
  "tp",
  "Rs",
  "Lt",
  "_C",
  "wC",
  "Me",
  "mf",
  "nt",
  "ze",
  "UB",
  "qB",
  "St",
  "j8",
  "JT",
  "el",
  "F8",
  "U8",
  "L8",
  "q8",
  "Fn",
  "Qt",
  "Zt",
  "dl",
  "ii",
  "SC",
  "y5",
  "XB",
  "B_",
  "NX",
  "FX",
  "LX",
];
// XB requires its sets to exist when its initializer runs.
const ordered = [
  "B_",
  "NX",
  "FX",
  "LX",
  ...names.filter((name) => !["B_", "NX", "FX", "LX"].includes(name)),
];
let audit: any[] = [];
const source = originalServiceBindings(ordered, {
  Tn: new Function("var Tn;return " + serviceExpression("Tn"))(),
  hf: (build: () => any) => audit.push(build()),
});
function view(error: any) {
  return {
    name: error.name,
    message:
      error instanceof TypeError &&
      error.message.endsWith("?.trim is not a function")
        ? "<renamed env access>?.trim is not a function"
        : error.message,
    reason: error.reason,
  };
}
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (error) {
    return { error: view(error) };
  }
}
test("site status request URL, display sanitization, localhost exclusions and backend validation match original", async () => {
  for (const url of [
    "https://user:pass@WWW.Example.test:8443/path?q=secret#hash",
    "http://localhost/x",
    "http://x.localhost",
    "http://127.0.0.1",
    "http://[::1]",
    "file:///tmp/a",
    "about:blank",
    "invalid",
    "https://example.test/",
  ])
    for (const options of [
      {},
      {
        conversationId: "thread",
        turnId: "turn",
        urlRequestSource: "source",
        backendApiBaseUrl: "https://api.test/base",
      },
    ])
      assert.deepEqual(
        await outcome(() => siteStatusRequest(url, options)),
        await outcome(() => source.eC(url, options)),
      );
  for (const url of [
    undefined,
    "",
    " https://api.test/base/// ",
    "ftp://api.test",
    "https://u:p@api.test",
    "https://api.test?x",
    3,
  ])
    for (const environment of [undefined, "staging", "production"]) {
      const runtime = {
        env: {
          BROWSER_USE_BACKEND_API_URL: url,
          BROWSER_USE_CHATGPT_ENVIRONMENT: environment,
        },
      };
      assert.deepEqual(
        await outcome(() => siteStatusBackend(runtime)),
        await outcome(() => source.Rs(runtime)),
      );
    }
  for (const value of [
    undefined,
    null,
    [],
    {},
    true,
    { feature_status: { agent: true } },
    { feature_status: { agent: 1 } },
    { feature_status: [] },
  ])
    assert.equal(siteStatusBlocked(value), source.QT(value));
});
async function caching(Constructor: any) {
  let now = 10,
    calls = 0;
  const service = new Constructor(() => now),
    trace: any[] = [];
  const pending = Array.from({ length: 6 }, () => Promise.withResolvers<any>());
  const runtime = {
    env: {},
    fetch: async (...args: any[]) => {
      trace.push(args);
      return pending[calls++].promise;
    },
  };
  const request = {
    cacheKey: "site.test",
    displayUrl: "https://site.test",
    endpoint: "https://api.test/status",
  };
  const a = service.isBlocked(runtime, request),
    b = service.isBlocked(runtime, request);
  assert.equal(calls, 2);
  pending[1].resolve({
    ok: true,
    json: async () => ({ feature_status: { agent: false } }),
  });
  pending[0].resolve({
    ok: true,
    json: async () => ({ feature_status: { agent: true } }),
  });
  trace.push(await a, await b);
  const cached = await service.isBlocked(runtime, request);
  trace.push(cached, calls);
  pending[2].reject(new Error("ignored background failure"));
  now += 86400000;
  trace.push(service.cachedBlocked(request.cacheKey));
  const fresh = service.isBlocked(runtime, request);
  pending[3].resolve({
    ok: true,
    json: async () => ({ feature_status: { agent: false } }),
  });
  trace.push(await fresh);
  trace.push([...service.cache], service.inflightRequests.size);
  await new Promise((resolve) => setImmediate(resolve));
  return trace;
}
test("site status starts background fetches on cache/inflight hits but preserves original winning request and expiry", async () => {
  assert.deepEqual(await caching(SiteStatus), await caching(source.D_));
});
async function failures(Constructor: any) {
  const service = new Constructor(),
    results = [];
  for (const mode of ["missing", "reject", "http", "json", "blocked"]) {
    const runtime: any = {
      env: {},
      requestMeta: {
        "x-codex-turn-metadata": { session_id: "s", turn_id: "t" },
      },
    };
    if (mode !== "missing")
      runtime.fetch = async () => {
        if (mode === "reject") throw new Error("network");
        return {
          ok: mode !== "http",
          json: async () => {
            if (mode === "json") throw new Error("parse");
            return { feature_status: { agent: true } };
          },
        };
      };
    results.push(
      await outcome(() =>
        service.checkUrl(runtime, "https://" + mode + ".test", "chrome"),
      ),
    );
    results.push(
      await outcome(() =>
        service.fetchBlocked(runtime, {
          endpoint: "https://api.test",
          cacheKey: mode,
        }),
      ),
    );
  }
  results.push(await outcome(() => service.checkUrl({ env: {} }, "invalid")));
  return results;
}
test("site status suppresses fetch failures only inside checkUrl and retains invalid URL failures", async () => {
  assert.deepEqual(await failures(SiteStatus), await failures(source.D_));
});
async function blocking(Constructor: any) {
  audit = [];
  approvalRuntime.setAuditSink((record) => audit.push(record));
  try {
    const service = new Constructor(() => 0),
      results = [];
    for (const mode of ["", "disabled-for-local-testing"]) {
      const runtime = {
        env: { BROWSER_USE_SECURITY_MODE: mode },
        fetch: async () => ({
          ok: true,
          json: async () => ({ feature_status: { agent: true } }),
        }),
      };
      for (let i = 0; i < 2; i++)
        results.push(
          await outcome(() =>
            service.throwIfBlocksUrl(
              runtime,
              "https://u:p@site.test/path?q=1",
              "extension",
              { elicitationDisplayName: "Chrome", browserFamily: "chrome" },
            ),
          ),
        );
    }
    return { results, audit };
  } finally {
    approvalRuntime.setAuditSink(undefined);
  }
}
test("site status block audits and testing-mode bypass match original", async () => {
  assert.deepEqual(await blocking(SiteStatus), await blocking(source.D_));
});

test("failed site-status requests are not cached and the next command awaits a fresh request, matching original", async () => {
  const run = async (Constructor: any) => {
    const service = new Constructor();
    let requests = 0;
    const runtime = {
      env: {},
      fetch: async () => {
        requests++;
        throw Error("transport timeout");
      },
    };
    const outcomes = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      outcomes.push(
        await service.checkUrl(runtime, "https://www.baidu.com/", "chrome"),
      );
      assert.equal(service.cache.size, 0);
      assert.equal(service.inflightRequests.size, 0);
    }
    return { requests, outcomes };
  };
  const restored = await run(SiteStatus);
  assert.deepEqual(restored, await run(source.D_));
  assert.equal(restored.requests, 2);
});
