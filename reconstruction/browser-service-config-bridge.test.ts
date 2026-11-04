import test from "node:test";
import assert from "node:assert/strict";
import {
  createConfigBridgeFactory,
  createBrowserConfig,
} from "../packages/browser/src/service/runtime/config_bridge";
import { Preferences } from "../packages/browser/src/service/preferences/preferences";
import { serviceExpression } from "./service-source";
function factory(original: boolean, now: () => number) {
  if (!original) return createConfigBridgeFactory(now);
  const names = ["dn", "cle", "dle", "v6", "yu", "lle", "w6", "_6"];
  return new Function(
    "Date",
    'let y6=new WeakMap();const ule=300000,oC="browser/config.toml";' +
      names
        .map((name) => `const ${name}=${serviceExpression(name)};`)
        .join("\n") +
      "return _6;",
  )({ now });
}
const errorView = (error: any) => ({
  name: error.name,
  message: error.message,
  source: error.source,
  cause: error.cause?.message,
});
test("config bridge matches original reads, TTL, write serialization and error wrapping", async () => {
  for (const mode of [
    "normal",
    "read-error",
    "requirements-error",
    "toml-error",
    "write-error",
    "non-record",
  ]) {
    async function run(original: boolean) {
      let clock = 0,
        stored: any = { initial: 1 },
        reads = 0,
        writes = 0;
      const trace: any[] = [];
      const config = {
        async read(options: any) {
          trace.push(["read", options]);
          if (mode === "read-error") throw Error("read");
          return { settings: true };
        },
        async readRequirements() {
          trace.push(["requirements"]);
          if (mode === "requirements-error") throw Error("requirements");
          return {};
        },
        async readToml(path: string) {
          trace.push(["toml", path]);
          reads++;
          if (mode === "toml-error" && reads === 1) throw Error("toml");
          return mode === "non-record" ? [] : { ...stored };
        },
        async writeToml(path: string, value: any) {
          trace.push(["write", path, value]);
          writes++;
          if (mode === "write-error" && writes === 1) throw Error("write");
          stored = value;
        },
      };
      const make = factory(original, () => clock),
        host = { config, cwd: "/synthetic" },
        first = make(host),
        second = make(host);
      async function record(name: string, operation: () => any) {
        try {
          trace.push([name, await operation()]);
        } catch (error: any) {
          trace.push([name + " error", errorView(error)]);
        }
      }
      await record("readAll", () => first.readAll());
      await record("readRequirements", () => first.readRequirements());
      const a = first.global.readSnapshot(),
        b = first.global.readSnapshot();
      trace.push(["shared", a === b]);
      await record("initial", () => Promise.all([a, b]));
      await record("cached", () => first.global.get("initial"));
      clock = 299999;
      await record("before expiry", () => first.global.readSnapshot());
      clock = 300000;
      await record("expiry", () => first.global.readSnapshot());
      await record("writes", () =>
        Promise.all([first.global.set("a", 1), second.global.set("b", 2)]),
      );
      await record("update", () =>
        first.global.update((value: any) => ({
          sum: (value.a ?? 0) + (value.b ?? 0),
        })),
      );
      await record("refresh", () =>
        second.global.readSnapshot({ refresh: true }),
      );
      for (const id of ["valid_123", "../bad", "", "x".repeat(129)])
        await record("session " + id, () => first.session(id).get("initial"));
      return trace;
    }
    assert.deepEqual(await run(false), await run(true), mode);
  }
});
test("config refresh races preserve newest snapshots and retry after cache eviction", async () => {
  for (const mode of [
    "old-success",
    "old-failure",
    "new-failure",
    "both-fail",
  ]) {
    async function run(original: boolean) {
      const pending: any[] = [];
      let signalThird!: () => void;
      const thirdRead = new Promise<void>((resolve) => {
        signalThird = resolve;
      });
      const trace: any[] = [];
      const bridge = factory(
        original,
        () => 0,
      )({
        cwd: "/synthetic",
        config: {
          readToml() {
            return new Promise((resolve, reject) => {
              pending.push({ resolve, reject });
              if (pending.length === 3) signalThird();
            });
          },
        },
      });
      const first = bridge.global.readSnapshot({ refresh: true }),
        second = bridge.global.readSnapshot({ refresh: true });
      const firstResult = first.then(
          (value) => ["first", value],
          (error) => ["first error", errorView(error)],
        ),
        secondResult = second.then(
          (value) => ["second", value],
          (error) => ["second error", errorView(error)],
        );
      await Promise.resolve();
      if (mode === "old-success") {
        pending[1].resolve({ version: 2 });
        await secondResult;
        pending[0].resolve({ version: 1 });
      } else if (mode === "old-failure") {
        pending[0].reject(Error("old"));
        await Promise.resolve();
        pending[1].resolve({ version: 2 });
      } else {
        pending[1].reject(Error("new"));
        await secondResult;
        mode === "new-failure"
          ? pending[0].resolve({ version: 1 })
          : pending[0].reject(Error("old"));
        await thirdRead;
        pending[2].resolve({ version: 3 });
      }
      trace.push(await firstResult, await secondResult);
      return trace;
    }
    assert.deepEqual(await run(false), await run(true), mode);
  }
});
test("restored Preferences uses the config bridge for extension headers and full CDP settings", async () => {
  const trace: any[] = [];
  const bridge = createBrowserConfig({
    cwd: "/synthetic",
    config: {
      async read() {
        return {};
      },
      async readRequirements() {
        return {
          requirements: {
            browserUse: {
              extension: {
                requestHeaders: [{ name: "X-Fixture", value: "synthetic" }],
              },
            },
          },
        };
      },
      async readToml(path) {
        trace.push(["read", path]);
        return { full_cdp_access_enabled: true };
      },
      async writeToml(path, value) {
        trace.push(["write", path, value]);
      },
    },
  });
  const preferences = new Preferences(bridge, {
    env: {},
    requestMeta: { "x-codex-turn-metadata": { session_id: "s", turn_id: "t" } },
  } as any);
  assert.deepEqual(await preferences.getExtensionRequestHeaders(), [
    { name: "X-Fixture", value: "synthetic" },
  ]);
  assert.equal(await preferences.isFullCdpEnabled(), true);
  assert.ok(trace.some((row) => row[1] === "browser/config.toml"));
});

test("host factory defaults to the restored config bridge", async () => {
  const { createBrowserHostFactory } =
    await import("../packages/browser/src/service/runtime/host");
  const repl: any = {
    cwd: "/synthetic",
    env: {},
    config: {
      read: async () => ({}),
      readRequirements: async () => ({}),
      readToml: async () => ({ full_cdp_access_enabled: true }),
      writeToml: async () => {},
    },
    createElicitation: async () => ({ action: "decline" }),
  };
  const factory = createBrowserHostFactory({
    getPrivilegedRepl: () => repl,
    createAccessAssertion: () => async () => {},
    registerAutomatedReviewHost() {},
    BrowserDirectory: class {
      constructor(
        public runtime: any,
        public selection: any,
        public preferences: any,
      ) {}
    },
    extensionSelection: () => null,
    Preferences,
    commandTiming: {},
    createErrorReporter: () => ({}),
    performanceSpan: {},
    trackElicitation: async (_request, perform) => perform(),
    initializeCredentialObservation: async () => {},
    getNativeCredentialObservationStatus() {},
    createBrowserAuthBrokerChallenge() {},
  });
  const host = await factory.createHost();
  assert.notEqual(host.config, repl.config);
  assert.equal(await host.browserContext.preferences.isFullCdpEnabled(), true);
  assert.equal(
    (await host.config.global.readSnapshot()).full_cdp_access_enabled,
    true,
  );
});
