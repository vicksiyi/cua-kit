import test from "node:test";
import assert from "node:assert/strict";
import {
  createBrowserHandshake,
  addFullCdpCapability,
  createProfileEnrichment,
} from "../packages/browser/src/service/runtime/browser_handshake";
import { createBrowserDiscovery } from "../packages/browser/src/service/runtime/browser_discovery";
import { originalServiceBindings, serviceSourceSha256 } from "./service-source";
if (
  serviceSourceSha256 !==
  "396d4bcd890e8e41e336469eb1a050bafd36bb2d91152b75bb22b70b56622021"
)
  throw Error(
    "Browser handshake source changed; re-audit helper bindings before comparison",
  );
const base = originalServiceBindings(["mc", "Jt", "Zt", "Qr", "Ia", "NI"], {
  xi: "BROWSER_USE_SECURITY_MODE",
  EY: ["", "gaas-browser-environment"],
  HR: "",
  Em: "BROWSER_USE_FULL_CDP_ACCESS_ENABLED",
});
const capability = { id: base.NI.id, info: base.NI };
test("handshake AX and full CDP capability policies match original matrices and identity", async () => {
  for (const type of ["iab", "extension", "cdp", "mcpapps", "unknown"])
    for (const ax of [undefined, false, true])
      for (const setting of [undefined, "", " 1 ", "0"])
        for (const environment of ["local", "cloud", "orbit"])
          for (const production of [false, true]) {
            const runtime = {
                env: {
                  BROWSER_USE_TINYSKY_ENABLED: setting,
                  CUA_REPL_BROWSER_ENV: environment,
                  BROWSER_USE_ENABLE_TINYSKY_ACCESSIBILITY: "1",
                },
              },
              info = {
                type,
                apiSupportOverrides: {
                  "Tab.ax": ax,
                  "Tab.cua": true,
                  fixture: true,
                },
              };
            async function run(original: boolean) {
              const trace: any[] = [];
              const enabled = (_r: any, name: any, options: any) => {
                trace.push([name, options]);
                return options.enabledByDefault;
              };
              const fn = original
                ? originalServiceBindings(["Kle"], {
                    Jt: base.Jt,
                    jR: "BROWSER_USE_TINYSKY_ENABLED",
                    R_: enabled,
                    mo: () => (production ? "production" : "development"),
                  }).Kle
                : createBrowserHandshake({
                    enrichProfile: async (x) => x,
                    reportError() {},
                    featureEnabled: enabled,
                    deploymentEnvironment: () =>
                      production ? "production" : "development",
                  }).applyAccessibility;
              const result = fn(runtime, info);
              return { trace, result, same: result === info };
            }
            assert.deepEqual(await run(false), await run(true));
          }
  const { Vle } = originalServiceBindings(["Vle"], {
    Ia: base.Ia,
    js: capability,
  });
  for (const type of ["iab", "extension", "cdp", "mcpapps", "unknown"])
    for (const mode of ["", "gaas-browser-environment"])
      for (const enabled of [false, true])
        for (const present of [false, true]) {
          const runtime = {
              env: {
                BROWSER_USE_SECURITY_MODE: mode,
                BROWSER_USE_FULL_CDP_ACCESS_ENABLED: "1",
              },
            },
            info = {
              type,
              capabilities: {
                browser: [{ id: "fixture" }],
                tab: present ? [base.NI] : [],
              },
            };
          for (const permission of [undefined, false, true, "error"]) {
            async function run(original: boolean) {
              let calls = 0;
              runtime.env.BROWSER_USE_FULL_CDP_ACCESS_ENABLED = enabled
                ? "1"
                : "0";
              const options = {
                isFullCdpEnabled:
                  permission === undefined
                    ? undefined
                    : async () => {
                        calls++;
                        if (permission === "error") throw Error("permission");
                        return permission === true;
                      },
              };
              try {
                const result = await (original
                  ? Vle(runtime, info, options)
                  : addFullCdpCapability(runtime, info, options));
                return { calls, result, same: result === info };
              } catch (error: any) {
                return { calls, error: error.message };
              }
            }
            assert.deepEqual(await run(false), await run(true));
          }
        }
});
test("profile enrichment and handshake preserve source failure boundaries and metadata", async () => {
  for (const mode of [
    "normal",
    "missing-instance",
    "missing-extension",
    "non-extension",
    "not-found",
    "profile-error",
    "info-error",
    "permission-error",
  ]) {
    async function run(original: boolean) {
      const trace: any[] = [];
      const runtime = { platform: "darwin", env: {} },
        info: any = {
          type: mode === "non-extension" ? "iab" : "extension",
          metadata: {
            extensionInstanceId:
              mode === "missing-instance" ? undefined : "instance",
            extensionId: mode === "missing-extension" ? undefined : "extension",
          },
        };
      const readProfiles = async (...args: any[]) => {
        trace.push(["profiles", args]);
        if (mode === "profile-error") throw Error("profile");
        return [
          {
            instanceId: mode === "not-found" ? "other" : "instance",
            name: "Synthetic",
            isLastUsed: true,
            orderingIndex: 2,
          },
        ];
      };
      const enrichment = original
        ? originalServiceBindings(["P6"], { vle: readProfiles }).P6
        : createProfileEnrichment(readProfiles);
      const report = (error: any) => trace.push(["report", error.message]);
      const api = {
        async getInfo() {
          trace.push(["info"]);
          if (mode === "info-error") throw Error("info");
          return info;
        },
      };
      const preferences = {
        async isFullCdpEnabled() {
          trace.push(["permission"]);
          if (mode === "permission-error") throw Error("permission");
          return true;
        },
      };
      const feature = () => false;
      const { browserBackendDeadline } =
        await import("../packages/browser/src/service/runtime/browser_selection");
      const fn = original
        ? originalServiceBindings(["Vle", "Kle", "Gx"], {
            zx: browserBackendDeadline,
            P6: enrichment,
            dt: report,
            Ia: base.Ia,
            js: capability,
            Jt: base.Jt,
            jR: "BROWSER_USE_TINYSKY_ENABLED",
            R_: feature,
            mo: () => "production",
          }).Gx
        : createBrowserHandshake({
            enrichProfile: enrichment,
            reportError: report,
            featureEnabled: feature,
            deploymentEnvironment: () => "production",
          }).readInfo;
      try {
        trace.push(["result", await fn(runtime, api, preferences)]);
      } catch (error: any) {
        trace.push(["error", error.message]);
      }
      return trace;
    }
    assert.deepEqual(await run(false), await run(true), mode);
  }
});
test("discovery executes the restored handshake and profile enrichment together", async () => {
  const trace: any[] = [];
  const handshake = createBrowserHandshake({
    enrichProfile: createProfileEnrichment(async () => [
      {
        instanceId: "synthetic",
        name: "Fixture profile",
        isLastUsed: false,
        orderingIndex: 0,
      },
    ]),
    reportError(error) {
      throw error;
    },
    featureEnabled: () => true,
    deploymentEnvironment: () => "production",
  });
  const discovery = createBrowserDiscovery({
    connect: async (pipe) => pipe,
    readInfo: handshake.readInfo,
    span: async (_n, _a, perform) => perform(),
    surfaceEnabled: () => true,
    surfaceForType: (type) => type,
    reportError(error) {
      throw error;
    },
    reportDiscoveryFailure(_runtime, details, reason) {
      trace.push([reason, details.browserCount]);
    },
    ignoredHandshakeError: null,
    listPipes: async () => ["fixture"],
  });
  const result = await discovery.discover(
    {
      platform: "darwin",
      env: {},
      requestMeta: {
        "x-codex-turn-metadata": { session_id: "s", turn_id: "t" },
      },
    },
    () => ({
      async getInfo() {
        return {
          type: "extension",
          metadata: { extensionId: "e", extensionInstanceId: "synthetic" },
        };
      },
      async close() {},
    }),
    [],
    { isFullCdpEnabled: async () => true },
  );
  assert.equal(result[0].info.metadata.profileName, "Fixture profile");
  assert.equal(result[0].info.capabilities.tab[0].id, "cdp");
  assert.equal(result[0].info.apiSupportOverrides["Tab.ax"], true);
  assert.equal(result[0].info.apiSupportOverrides["Tab.cua"], false);
  assert.deepEqual(trace, [["no-iab-backends", 1]]);
});
