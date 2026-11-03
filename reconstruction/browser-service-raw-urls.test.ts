import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import * as readable from "../packages/browser/src/service/cdp/raw_urls";
import { TabDevLogsCommand } from "../packages/browser/src/service/commands/dev_logs";
const original = originalServiceBindings([
  "Nc",
  "Xv",
  "iF",
  "sne",
  "nne",
  "one",
  "tF",
  "Kv",
  "ine",
  "ane",
  "rne",
  "F",
  "W",
  "dF",
]);
function outcome(fn: () => unknown) {
  try {
    return { value: fn() };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
test("raw CDP URL extraction preserves original cookie/header validation and authority target lists", () => {
  const inputs: any[] = [
    undefined,
    {},
    { url: "https://a.test/" },
    { url: 2 },
    { domain: undefined, url: "https://a.test/" },
    { sourcePort: 443, url: "https://a.test/" },
    {
      url: "https://a.test/",
      partitionKey: { topLevelSite: "https://b.test/" },
    },
    { url: "https://a.test/", partitionKey: [] },
    { urls: [] },
    { urls: ["https://a.test/", "https://b.test/"] },
    { urls: [2] },
    {
      cookies: [
        { url: "https://a.test/" },
        { url: "https://b.test/", domain: "b.test" },
      ],
    },
    { cookies: [null] },
    { responseHeaders: [{ name: " Location ", value: "https://b.test/" }] },
    { responseHeaders: [{ name: "Location", value: 7 }] },
    { responseHeaders: {} },
    { cookies: {} },
    { url: "", partitionKey: { topLevelSite: null } },
  ];
  for (const [a, b] of [
    [readable.rawRequestUrls, original.nne],
    [readable.rawCookieReadUrls, original.one],
    [readable.rawResponseUrls, original.tF],
    [readable.rawCookieUrls, original.Kv],
    [readable.rawCookiesUrls, original.ine],
  ])
    for (const input of inputs)
      assert.deepEqual(
        outcome(() => a("fixture", input)),
        outcome(() => b("fixture", input)),
      );
  assert.deepEqual(
    readable.rawCookieUrls("cookie", {
      url: "https://a.test/",
      partitionKey: { topLevelSite: "https://b.test/" },
    }),
    ["https://a.test/", "https://b.test/"],
  );
});
test("raw CDP parameter exclusions preserve exact boolean checks and tracing conditions", () => {
  const inputs = [
    undefined,
    {},
    { binaryResponseHeaders: "" },
    { maxTotalBufferSize: 0 },
    { enableDurableMessages: true },
    { enableDurableMessages: 1 },
    { grantUniveralAccess: true },
    { grantUniversalAccess: true },
    { scriptToEvaluateOnLoad: "" },
    { perfettoConfig: "" },
    { tracingBackend: "system" },
    { options: "foo, enable-systrace " },
    { traceConfig: { memoryDumpConfig: {} } },
    { traceConfig: { enableSystrace: true } },
  ];
  for (const method of [
    "Fetch.continueResponse",
    "Fetch.fulfillRequest",
    "Network.configureDurableMessages",
    "Network.enable",
    "Page.createIsolatedWorld",
    "Page.reload",
    "Tracing.start",
    "Runtime.evaluate",
  ])
    for (const input of inputs)
      assert.equal(
        readable.rawParametersBlocked(method, input),
        original.rne(method, input),
      );
  assert.equal(
    readable.rawParametersBlocked("Page.createIsolatedWorld", {
      grantUniveralAccess: true,
    }),
    true,
  );
});
test("dev logs command preserves authority order and strips non-public fields", async () => {
  async function run(command: any, mode: string) {
    const trace: any[] = [];
    const ctx: any = {
      acquireAuthority() {
        trace.push("authority");
        return {
          observeContent(url: any) {
            trace.push(url);
            return {
              async assert() {
                trace.push("assert");
                if (mode === "denied") throw Error("denied");
              },
            };
          },
        };
      },
      security: {
        async currentTabUrl(id: number) {
          trace.push(id);
          return "https://fixture.test/";
        },
      },
      dev: {
        async logs(options: any) {
          trace.push(options);
          return [
            {
              level: "log",
              message: "fixture",
              timestamp: "now",
              url: mode === "no-url" ? undefined : "https://fixture.test/",
              secret: "hidden",
            },
          ];
        },
      },
    };
    try {
      return {
        value: await command(
          {
            tab_id: mode === "invalid" ? 0 : 7,
            filter: "fixture",
            levels: ["log"],
            limit: 2,
          },
          ctx,
        ),
        trace,
      };
    } catch (e) {
      return { error: (e as Error).message, trace };
    }
  }
  for (const mode of ["normal", "no-url", "denied", "invalid"])
    assert.deepEqual(
      await run(TabDevLogsCommand, mode),
      await run(original.dF, mode),
    );
  assert.equal(
    "secret" in (await run(TabDevLogsCommand, "normal")).value.logs[0],
    false,
  );
});
