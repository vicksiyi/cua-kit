import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings, serviceExpression } from "./service-source";
import {
  TabCdpCallCommand,
  TabCdpEventsCommand,
  supportsFullCdp,
} from "../packages/browser/src/service/commands/raw_cdp";
import {
  CdpCall,
  CdpEvents,
} from "../packages/browser/src/commands/tab_developer";
import {
  prepareRawCdpParams,
  rawCdpAuthorityUrls,
} from "../packages/browser/src/service/cdp/raw_policy";
const original = originalServiceBindings(
  [
    "F",
    "W",
    "Jh",
    "sF",
    "aF",
    "Bs",
    "Qt",
    "zr",
    "dl",
    "Zt",
    "ii",
    "np",
    "y5",
    "SC",
  ],
  {
    Tn: new Function("Tn", `return (${serviceExpression("Tn")})`)(undefined),
    Dn: { Call: CdpCall, Events: CdpEvents },
    nF: prepareRawCdpParams,
    oF: rawCdpAuthorityUrls,
  },
);
test("full CDP capability gate retains exact original backend, trimmed mode and string flag semantics", () => {
  for (const type of ["extension", "iab", "cdp", "mcpapps", "unknown"])
    for (const mode of [
      undefined,
      "gaas-browser-environment",
      " gaas-browser-environment ",
      "agent",
      1,
    ])
      for (const flag of [undefined, "1", "true", true, 1]) {
        const runtime = {
          env: {
            BROWSER_USE_SECURITY_MODE: mode,
            BROWSER_USE_FULL_CDP_ACCESS_ENABLED: flag,
          },
        };
        assert.equal(
          supportsFullCdp(runtime, type),
          original.Bs(runtime, type),
        );
      }
});
async function run(command: any, mode: string, events: boolean) {
  const trace: any[] = [];
  let approved = false,
    prepared = false;
  const authority: any = {
    useCdp(url: string) {
      trace.push(["cdp-authority", url]);
      return this;
    },
    async assert() {
      trace.push("cdp-assert");
      approved = true;
      if (mode === "cdp-denied") throw Error("cdp denied");
    },
  };
  const ctx: any = {
    runtime: { env: {} },
    clientInfo: { type: mode === "unsupported" ? "mcpapps" : "extension" },
    security: {
      async currentTabUrl(id: number) {
        trace.push(["url", id]);
        return "https://current.test/";
      },
      async currentTabFullCdpUrl(id: number) {
        trace.push(["full-url", id]);
        return "https://full.test/";
      },
    },
    acquireAuthority() {
      trace.push("authority");
      const act = (kind: string) => (url: string) => {
        trace.push([kind, url]);
        return {
          async assert() {
            trace.push("assert");
            if (mode === "denied") throw Error("denied");
          },
        };
      };
      return {
        actInFrame: act("act"),
        observeContent: act("observe"),
        useCdp: authority.useCdp.bind(authority),
      };
    },
    documentResponses: {
      hasRequestInterceptors() {
        trace.push("interceptors");
        return mode === "intercept";
      },
      hasOwnedPausedResponses() {
        trace.push("paused");
        return mode === "paused";
      },
      async ensureInterceptionReady(id: number) {
        trace.push(["prepare", id]);
        prepared = true;
      },
    },
    cdp: {
      hasBrowserAuthRawEventProtection() {
        trace.push("credential-check");
        return (
          mode === "credential" ||
          (mode === "approval-race" && approved) ||
          (mode === "prepare-race" && prepared)
        );
      },
      async callRawCdp(id: number, method: string, params: any, options: any) {
        trace.push([
          "dispatch",
          id,
          method,
          params,
          options.timeoutMs,
          options.target,
        ]);
        await options.prepareDispatch();
        options.beforeDispatch();
        trace.push("sent");
        return mode === "null-result" ? null : { ok: true };
      },
      async readRawCdpEvents(id: number, options: any) {
        trace.push(["read", id, options]);
        return { cursor: 2, events: [], hasMore: false, truncated: false };
      },
    },
  };
  const payload: any = {
    browser_id: "fixture",
    tab_id: mode === "bad-tab" ? "0" : "7",
    ...(events
      ? { after_sequence: 1, methods: ["Page.loadEventFired"], timeout_ms: 0 }
      : {
          method:
            mode === "blocked-method" ? "Page.navigate" : "Network.getCookies",
          params: { urls: ["https://affected.test/"] },
        }),
    ...(mode === "target" ? { target: { session_id: "child" } } : {}),
    ...(mode === "schema" ? { browser_id: 4 } : {}),
  };
  try {
    return { value: await command(payload, ctx), trace };
  } catch (e) {
    return { error: (e as Error).message, trace };
  }
}
test("raw CDP command assembly preserves validation, authority targets and late protection rechecks", async () => {
  for (const [command, reference, events] of [
    [TabCdpCallCommand, original.sF, false],
    [TabCdpEventsCommand, original.aF, true],
  ] as const)
    for (const mode of [
      "normal",
      "unsupported",
      "denied",
      "cdp-denied",
      "credential",
      "intercept",
      "paused",
      "approval-race",
      "prepare-race",
      "null-result",
      "bad-tab",
      "blocked-method",
      "target",
      "schema",
    ])
      assert.deepEqual(
        await run(command, mode, events),
        await run(reference, mode, events),
        `${events}/${mode}`,
      );
  const normal = await run(TabCdpCallCommand, "normal", false);
  assert.ok(
    normal.trace.some(
      (row) =>
        row[0] === "cdp-authority" && row[1] === "https://affected.test/",
    ),
  );
  for (const mode of ["approval-race", "prepare-race"]) {
    const result = await run(TabCdpCallCommand, mode, false);
    assert.ok(result.error?.includes("protecting credential saving"));
    assert.equal(result.trace.includes("sent"), false);
  }
  assert.deepEqual(
    (await run(TabCdpCallCommand, "null-result", false)).value,
    {},
  );
});
