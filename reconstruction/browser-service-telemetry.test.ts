import test from "node:test";
import assert from "node:assert/strict";
import { StatsigClient } from "@statsig/js-client";
import { createBrowserTelemetry } from "../packages/browser/src/service/runtime/browser_telemetry";
import { serviceExpression, originalServiceBindings } from "./service-source";
import { siteStatusBackend } from "../packages/browser/src/service/security/site_status";

function original(Client: any) {
  const helpers = originalServiceBindings(
    ["dl", "Zt", "zr", "Qt", "Ar", "_p", "RA", "IA"],
    {
      mC: "BROWSER_USE_DISABLE_AMBIENT_NETWORK",
      ii: "BROWSER_USE_SECURITY_MODE",
      pC: "BROWSER_USE_CODEX_APP_VERSION",
      cC: "BROWSER_USE_BROWSER_CLIENT_BUILD",
      y5: ["gaas-browser-environment"],
      SC: "normal",
    },
  );
  const bindings = [
    "jM",
    "Dt",
    "fv",
    "gh",
    "KM",
    "WM",
    "hv",
    "$M",
    "bh",
    "GM",
    "VM",
    "zM",
    "XM",
    "vh",
    "Gee",
    "JM",
    "gv",
    "Sh",
    "xh",
    "dt",
  ];
  return new Function(
    "HM",
    "Rs",
    ...Object.keys(helpers),
    `
    let qn, qM, wh=null, _h;
    const hh=10000,Vr="1.0.0",hA="client-sYWqzCYMRkUg4DqqiZcR5DGTNl2iD7zNJY0HoeDLzxR",Ny="https://ab.chatgpt.com/v1",$ee="codex_";
    const Po=()=>"production";
    ${bindings.map((name) => `const ${name}=${serviceExpression(name)};`).join("\n")}
    return {setExceptionReporter:jM,reportError:Dt,initializeClient:WM,readFeatureGate:gh,featureEnabled:hv,dynamicConfig:$M,setClientBackend:GM,updateClientIdentity:VM,logEvent:bh,fetchIdentity:XM,configureBackendTelemetry:Sh,configureTurnTelemetry:xh,configureRuntimeTelemetry:gv,readBrowserFeatureGate:Gee,emitEvent:dt};
  `,
  )({ StatsigClient: Client }, siteStatusBackend, ...Object.values(helpers));
}
async function scenario(factory: typeof createBrowserTelemetry, gaas: boolean) {
  const trace: any[] = [];
  let client: any;
  class FakeClient {
    loadingStatus = "Ready";
    gateReason = "Network:Recognized";
    success = true;
    constructor(key: string, user: any, options: any) {
      client = this;
      const { networkOverrideFunc, ...networkConfig } = options.networkConfig;
      trace.push(["construct", key, user, { ...options, networkConfig }]);
      // Exercise the host routing without an external request.
      networkOverrideFunc("https://statsig.invalid/fixture", {
        method: "POST",
      });
    }
    initializeAsync(options: any) {
      trace.push(["initialize", options]);
      return Promise.resolve({ success: this.success });
    }
    updateUserAsync(user: any, options: any) {
      trace.push(["update", user, options]);
      return Promise.resolve({ success: this.success });
    }
    checkGate(name: string) {
      trace.push(["check", name]);
      return name === "enabled";
    }
    getFeatureGate(name: string) {
      trace.push(["gate", name]);
      return {
        value: name === "enabled",
        details: { reason: this.gateReason },
      };
    }
    getDynamicConfig(name: string) {
      return { name, value: { limit: 4 } };
    }
    logEvent(...args: any[]) {
      trace.push(["log", ...args]);
    }
  }
  const api = factory(FakeClient as any);
  api.setExceptionReporter((error, context) =>
    trace.push(["error", String(error), context]),
  );
  const runtime: any = {
    env: {
      BROWSER_USE_DISABLE_AMBIENT_NETWORK: "1",
      NODE_REPL_SENTRY_USER_ID: " initial ",
      BROWSER_USE_BROWSER_CLIENT_BUILD: " build ",
      BROWSER_USE_CODEX_APP_VERSION: " app ",
      ...(gaas
        ? { BROWSER_USE_SECURITY_MODE: "gaas-browser-environment" }
        : {}),
    },
    gaas: { browserConfig: { user_id: "gaas-user" } },
    platform: "darwin",
    async fetch(url: string, options: any) {
      assert.equal(this, runtime);
      trace.push([
        "fetch",
        url,
        options.signal
          ? { signal: options.signal instanceof AbortSignal }
          : options,
      ]);
      return {
        ok: true,
        json: async () => ({
          object: "user",
          id: "fixture-user",
          email: "fixture@example.invalid",
        }),
      };
    },
  };
  const reporter: any = {
    setUser: (user: any) => trace.push(["user", user]),
    setTag: (...args: any[]) => trace.push(["tag", ...args]),
  };
  assert.equal(api.configureRuntimeTelemetry(runtime, reporter), undefined);
  assert.equal(
    api.featureEnabled(runtime, "enabled", { enabledByDefault: true }),
    false,
  );
  assert.equal(api.dynamicConfig("x"), undefined);
  assert.equal(api.emitEvent(runtime, "disabled", 1), undefined);
  assert.equal(trace.length, 0);
  await assert.rejects(
    api.readFeatureGate("enabled"),
    /require Statsig initialization/,
  );
  await assert.rejects(
    api.readBrowserFeatureGate("enabled"),
    /require caller identity/,
  );
  runtime.env.BROWSER_USE_DISABLE_AMBIENT_NETWORK = "0";
  await api.configureRuntimeTelemetry(runtime, reporter);
  assert.equal(await api.readBrowserFeatureGate("enabled"), true);
  assert.equal(await api.readFeatureGate("disabled"), false);
  assert.equal(api.featureEnabled(runtime, "enabled"), true);
  assert.equal(
    api.featureEnabled(runtime, "other", { enabledByDefault: true }),
    true,
  );
  assert.deepEqual(api.dynamicConfig("limits"), {
    name: "limits",
    value: { limit: 4 },
  });
  api.configureBackendTelemetry(runtime, reporter, "extension");
  api.configureBackendTelemetry(runtime, reporter, "extension");
  await api.configureTurnTelemetry(runtime, reporter);
  await api.configureTurnTelemetry(runtime, reporter);
  api.emitEvent(
    runtime,
    "click",
    "button",
    { browser_family: "override", browserClientBuild: "cannot-override" },
    { type: "extension", family: "chrome" },
  );
  client.gateReason = "Unrecognized";
  await assert.rejects(api.readFeatureGate("missing"), /gate is unavailable/);
  client.loadingStatus = "Loading";
  await assert.rejects(api.readFeatureGate("enabled"), /Unable to load/);
  client.loadingStatus = "Ready";
  await assert.rejects(
    api.readFeatureGate("enabled", Date.now() - 1),
    /Timed out waiting for Statsig values/,
  );
  client.success = false;
  await api.updateClientIdentity(runtime, { id: "new-user" });
  await assert.rejects(api.readFeatureGate("enabled"), /Unable to load/);
  client.success = true;
  await api.updateClientIdentity(runtime, { id: "new-user" });
  runtime.env.BROWSER_USE_DISABLE_AMBIENT_NETWORK = "1";
  const before = trace.length;
  api.configureBackendTelemetry(runtime, reporter, "cdp");
  api.configureTurnTelemetry(runtime, reporter);
  api.emitEvent(runtime, "disabled", 1);
  assert.equal(trace.length, before);
  api.reportError("failure");
  return trace;
}
test("Statsig adapter matches original initialization, identity, feature gate and event lifecycle", async () => {
  for (const gaas of [false, true])
    assert.deepEqual(
      await scenario(createBrowserTelemetry, gaas),
      await scenario(original, gaas),
    );
});
test("identity failures remain retryable and caller gate timeout preserves original error", async () => {
  async function run(factory: typeof createBrowserTelemetry) {
    const errors: any[] = [];
    const api = factory(class {} as any);
    api.setExceptionReporter((error) => errors.push(String(error)));
    let body: any = { object: "user", id: " " };
    const runtime: any = {
      env: {},
      fetch: async () => ({ ok: true, json: async () => body }),
    };
    await assert.rejects(api.fetchIdentity(runtime), /User unavailable/);
    body = { object: "user", id: "valid" };
    assert.deepEqual(await api.fetchIdentity(runtime), body);
    const blocked = factory(class {} as any);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const host: any = {
      env: {},
      async fetch() {
        await pending;
        throw Error("identity fixture failure");
      },
    };
    blocked.setExceptionReporter((error) => errors.push(String(error)));
    const update = blocked.configureTurnTelemetry(host, {
      setUser() {},
      setTag() {},
    });
    await assert.rejects(
      blocked.readBrowserFeatureGate("x", Date.now() - 1),
      /Timed out waiting for browser feature gate/,
    );
    release();
    await update;
    await assert.rejects(
      blocked.readBrowserFeatureGate("x"),
      /identity fixture failure/,
    );
    return errors;
  }
  assert.deepEqual(await run(createBrowserTelemetry), await run(original));
});
test("real upstream Statsig evaluates synthetic network values through the host fetch", async () => {
  let client: StatsigClient | undefined;
  class Captured extends StatsigClient {
    constructor(...args: ConstructorParameters<typeof StatsigClient>) {
      super(...args);
      client = this;
    }
  }
  const api = createBrowserTelemetry(Captured);
  const requests: string[] = [];
  const errors: any[] = [];
  api.setExceptionReporter((error) => errors.push(error));
  const runtime: any = {
    env: {},
    platform: "darwin",
    async fetch(url: string) {
      requests.push(url);
      if (url.endsWith("/aura/identity"))
        return new Response(
          JSON.stringify({ object: "user", id: "synthetic-statsig-user" }),
        );
      return new Response(
        JSON.stringify({
          feature_gates: {
            fixture: {
              name: "fixture",
              value: true,
              rule_id: "fixture-rule",
              secondary_exposures: [],
            },
          },
          dynamic_configs: {},
          layer_configs: {},
          has_updates: true,
          time: Date.now(),
          hash_used: "none",
        }),
        { status: 200 },
      );
    },
  };
  try {
    await api.configureRuntimeTelemetry(runtime, { setUser() {}, setTag() {} });
    assert.equal(await api.readBrowserFeatureGate("fixture"), true);
    assert.equal(api.featureEnabled(runtime, "fixture"), true);
    assert.equal(errors.length, 0);
    assert.ok(requests.some((url) => url.includes("initialize")));
    assert.equal(
      requests.filter((url) => url.endsWith("/aura/identity")).length,
      1,
    );
    api.emitEvent(runtime, "fixture", 1);
  } finally {
    await client?.shutdown();
  }
});

test("feature gate waits for the latest user update when an older response completes", async () => {
  async function run(factory: typeof createBrowserTelemetry) {
    const pending: Array<(value: any) => void> = [];
    class Client {
      loadingStatus = "Ready";
      initializeAsync() {
        return Promise.resolve({ success: true });
      }
      updateUserAsync() {
        return new Promise((resolve) => pending.push(resolve));
      }
      getFeatureGate() {
        return { value: true, details: { reason: "Network:Recognized" } };
      }
    }
    const api = factory(Client as any);
    const runtime: any = {
      env: {},
      fetch() {
        throw Error("unexpected fetch");
      },
    };
    await api.initializeClient(runtime);
    const first = api.updateClientIdentity(runtime, { id: "first" });
    let settled = false;
    const gate = api.readFeatureGate("fixture").then((value) => {
      settled = true;
      return value;
    });
    for (let i = 0; i < 4; i++) await Promise.resolve();
    const second = api.updateClientIdentity(runtime, { id: "second" });
    pending[0]({ success: false });
    await first;
    for (let i = 0; i < 4; i++) await Promise.resolve();
    assert.equal(settled, false);
    pending[1]({ success: true });
    await second;
    return await gate;
  }
  assert.equal(await run(createBrowserTelemetry), await run(original));
});
