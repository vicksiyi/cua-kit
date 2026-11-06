import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "acorn";
import { __awaiter } from "tslib";
import { platform } from "node:os";
import { createComputerUsePolicy } from "../packages/sky/src/targets/mac/computer-use-policy";
import { createComputerUseTelemetry } from "../packages/sky/src/targets/mac/computer-use-telemetry";
import {
  SkyComputerUseError,
  ServerErrorCode,
} from "../packages/sky/src/targets/mac/errors";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
async function body(file: string) {
  const source = await readFile(
    `${root}/sky/dist/project/cua/sky_js/src/targets/mac/${file}.js`,
    "utf8",
  );
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
  return ast.body
    .filter(
      (n) =>
        n.type !== "ImportDeclaration" && n.type !== "ExportNamedDeclaration",
    )
    .map((n) => source.slice(n.start, n.end))
    .join("\n");
}
async function namedExports(file: string) {
  const source = await readFile(`${root}/sky/dist/project/cua/sky_js/src/targets/mac/${file}.js`,"utf8");
  const ast = parse(source,{ecmaVersion:"latest",sourceType:"module"});
  const entries = ast.body.flatMap(node=>node.type === "ExportNamedDeclaration"
    ? node.specifiers.map(specifier=>`${JSON.stringify(specifier.exported.type === "Identifier" ? specifier.exported.name : specifier.exported.value)}:${specifier.local.name}`)
    : []);
  return `;return {${entries.join(",")}};`;
}
const policyFactory = new Function(
  "e",
  "t",
  "o",
  "r",
  "n",
  "a",
  "i",
  (await body("computer-use-policy")) +
    (await namedExports("computer-use-policy")),
);
const telemetryFactory = new Function(
  "e",
  "t",
  "n",
  "o",
  "i",
  (await body("computer-use-telemetry")) +
    (await namedExports("computer-use-telemetry")),
);
async function host<T>(runtime: any, run: () => Promise<T>) {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "nodeRepl");
  Object.defineProperty(globalThis, "nodeRepl", {
    configurable: true,
    value: runtime,
  });
  try {
    return await run();
  } finally {
    if (prior) Object.defineProperty(globalThis, "nodeRepl", prior);
    else Reflect.deleteProperty(globalThis, "nodeRepl");
  }
}
async function result(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (error: any) {
    return { name: error.name, error: error.message };
  }
}
function makePolicy(original: boolean, deps: any) {
  return original
    ? policyFactory(
        __awaiter,
        deps.logComputerUseToolCalled,
        deps.logComputerUseApprovalRequested,
        deps.logComputerUseApprovalResolved,
        SkyComputerUseError,
        ServerErrorCode,
        deps.getClient,
      )
    : createComputerUsePolicy(deps);
}
test("Mac app approval matches original decisions, metadata, persistence and pinned immutable inputs", async () => {
  for (const decision of ["allowed", "denied", "forbidden"])
    for (const action of ["accept", "decline", "cancel", "other", "throw"])
      for (const persisted of [false, true]) {
        async function run(original: boolean) {
          const trace: any[] = [];
          const input: any = { app: "original", x: 1 };
          Object.defineProperty(input, "hidden", { value: 2 });
          const log = (name: string) => (args: any) => {
            const copy = { ...args };
            if ("eventCreatedAt" in copy) {
              assert.ok(!isNaN(Date.parse(copy.eventCreatedAt)));
              copy.eventCreatedAt = "time";
            }
            if ("durationMs" in copy) {
              assert.ok(copy.durationMs >= 0);
              copy.durationMs = 0;
            }
            trace.push([name, copy]);
          };
          const policy = makePolicy(original, {
            getClient: async () => ({
              getAppPolicy: async (app: string) => {
                trace.push(["policy", app]);
                return {
                  decision,
                  allowPersistentApproval: true,
                  target: {
                    appPath: "/approved/App.app",
                    bundleIdentifier: "com.google.Chrome",
                    displayName: "Fixture",
                    risk: "high",
                    warningSubtitle: "warning",
                  },
                };
              },
            }),
            logComputerUseToolCalled: log("tool"),
            logComputerUseApprovalRequested: log("requested"),
            logComputerUseApprovalResolved: log("resolved"),
          });
          const runtime = {
            setResponseMeta(meta: any) {
              trace.push(["surface", meta, this === runtime]);
            },
            requestMeta: {
              "x-codex-turn-metadata": '{"call_id":" call ","item_id":"item"}',
            },
            async createElicitation(this: any, args: any) {
              trace.push(["approval", args, this === undefined]);
              input.app = "mutated";
              input.x = 3;
              if (action === "throw") throw Error("approval failure");
              return {
                action,
                content: persisted
                  ? { source: "computer-use-persisted-state" }
                  : undefined,
                _meta: { persist: "always" },
              };
            },
          };
          const response = await host(runtime, () =>
            result(() =>
              policy.withComputerUsePolicy(
                "click",
                input,
                async (approved: any) => {
                  trace.push([
                    "operation",
                    Object.getOwnPropertyDescriptors(approved),
                    Object.isFrozen(approved),
                  ]);
                  return "done";
                },
              ),
            ),
          );
          return { trace, response };
        }
        assert.deepEqual(
          await run(false),
          await run(true),
          [decision, action, persisted].join("/"),
        );
      }
});
test("Mac policy rejects accessor inputs before app lookup and preserves tool cancellation classes", async () => {
  for (const kind of [
    "null",
    "inherited",
    "app-getter",
    "other-getter",
    "empty",
  ]) {
    async function run(original: boolean) {
      let reads = 0,
        calls = 0;
      const input =
        kind === "null"
          ? null
          : kind === "inherited"
            ? Object.create({ app: "a" })
            : kind === "app-getter"
              ? {
                  get app() {
                    reads++;
                    return "a";
                  },
                }
              : kind === "other-getter"
                ? {
                    app: "a",
                    get x() {
                      reads++;
                      return 1;
                    },
                  }
                : { app: " " };
      const policy = makePolicy(original, {
        getClient: async () => {
          calls++;
          throw Error("must not lookup");
        },
        logComputerUseToolCalled() {},
        logComputerUseApprovalRequested() {},
        logComputerUseApprovalResolved() {},
      });
      return {
        response: await host({ createElicitation() {} }, () =>
          result(() =>
            policy.withComputerUsePolicy("click", input, async () => {}),
          ),
        ),
        reads,
        calls,
      };
    }
    assert.deepEqual(await run(false), await run(true));
  }
  for (const code of [undefined, -10012, -10016, -10015]) {
    async function run(original: boolean) {
      const trace: any[] = [];
      const policy = makePolicy(original, {
        logComputerUseToolCalled(args: any) {
          trace.push({ ...args, durationMs: 0 });
        },
      });
      return {
        response: await result(() =>
          policy.withComputerUseToolTelemetry("click", "app", async () => {
            if (code === undefined) return "done";
            throw new SkyComputerUseError({
              code,
              message: "native",
              request: null,
              requestType: "test",
            });
          }),
        ),
        trace,
      };
    }
    assert.deepEqual(await run(false), await run(true));
  }
});
test("Mac audio approval matches original acceptance and current call-id fallback", async () => {
  for (const action of ["accept", "decline", "cancel"])
    for (const meta of [
      { call_id: " ", item_id: " item " },
      "invalid",
      { call_id: "call" },
    ]) {
      async function run(original: boolean) {
        const events: any[] = [];
        const policy = makePolicy(original, {});
        const response = await host(
          {
            requestMeta: { "x-codex-turn-metadata": meta },
            async createElicitation(args: any) {
              events.push(args);
              return { action };
            },
          },
          () => result(() => policy.requestComputerAudioApproval()),
        );
        return { events, response };
      }
      assert.deepEqual(await run(false), await run(true));
    }
});
test("Sky Statsig wrapper matches original structured events, gating, identity and one-time launch", async () => {
  for (const mode of ["normal", "disabled", "initialize-error", "log-error"]) {
    async function run(original: boolean) {
      const events: any[] = [];
      const sink: any[] = [];
      class Client {
        constructor(key: any, user: any, options: any) {
          events.push([
            "construct",
            key,
            user,
            {
              ...options,
              networkConfig: {
                ...options.networkConfig,
                networkOverrideFunc: "host-fetch",
              },
            },
          ]);
        }
        async initializeAsync() {
          events.push(["init"]);
          if (mode === "initialize-error") throw Error("init");
        }
        updateUserSync(user: any) {
          events.push(["user", user]);
        }
        logEvent(event: any) {
          if (mode === "log-error") throw Error("log");
          assert.ok(!isNaN(Date.parse(event.metadata.eventCreatedAt)));
          assert.equal(typeof event.metadata.eventId, "string");
          sink.push({
            ...event,
            metadata: {
              ...event.metadata,
              eventCreatedAt: "time",
              eventId: "uuid",
            },
          });
        }
      }
      const metadata = {
        add(value: any) {
          events.push(["metadata", value]);
        },
      };
      const api = original
        ? telemetryFactory(__awaiter, () => "uuid", platform, metadata, Client)
        : createComputerUseTelemetry({
            StatsigClient: Client,
            StatsigMetadataProvider: metadata,
          } as any);
      const runtime: any = {
        config: {},
        env: {
          BROWSER_USE_CODEX_APP_VERSION: " 1.2 ",
          BROWSER_USE_CODEX_APP_BUILD_FLAVOR: "nightly",
          NODE_REPL_SENTRY_USER_ID: " user ",
          NODE_REPL_DISABLE_ANALYTICS: mode === "disabled" ? "1" : undefined,
        },
        requestMeta: {
          "x-codex-turn-metadata": JSON.stringify({
            thread_id: " ",
            threadId: " thread ",
            call_id: " call ",
            turn_id: " turn ",
            model: " model ",
            model_reasoning_effort: " high ",
          }),
        },
        async fetch(url: string) {
          events.push(["fetch", url]);
          return {
            json: async () => ({
              object: "user",
              id: "me",
              email: "fixture@example.test",
            }),
          };
        },
      };
      await host(runtime, async () => {
        api.logComputerUseClientCreated();
        api.logComputerUseClientCreated();
        await new Promise((resolve) => setImmediate(resolve));
        runtime.env.NODE_REPL_DISABLE_ANALYTICS = undefined;
        api.logComputerUseClientCreated();
        api.logComputerUseToolCalled({
          toolName: "click",
          durationMs: 10,
          terminalStatus: "cancelled",
          bundleIdentifier: "app",
        });
        api.logComputerUseApprovalRequested({
          toolName: "click",
          bundleIdentifier: "app",
          eventCreatedAt: "2026-01-01T00:00:00Z",
        });
        api.logComputerUseApprovalResolved({
          toolName: "click",
          bundleIdentifier: "app",
          approvalResult: "accepted",
          approvalPersistence: "always",
        });
        await new Promise((resolve) => setImmediate(resolve));
      });
      return { events, sink };
    }
    assert.deepEqual(await run(false), await run(true), mode);
  }
});

test("Sky uses its installed upstream Statsig version with host-only fetch and real SDK lifecycle", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(
    new URL("../packages/sky/package.json", import.meta.url),
  );
  assert.equal(require("@statsig/js-client/package.json").version, "3.33.3");
  const sdk = require("@statsig/js-client");
  let client: any, resolveIdentity!: () => void;
  const identity = new Promise<void>((resolve) => (resolveIdentity = resolve)),
    requests: string[] = [],
    events: any[] = [];
  class Captured extends sdk.StatsigClient {
    constructor(...args: any[]) {
      super(...args);
      client = this;
    }
    updateUserSync(user: any, options: any) {
      const value = super.updateUserSync(user, options);
      assert.equal(user.userID, "synthetic-sky-user");
      resolveIdentity();
      return value;
    }
    logEvent(event: any) {
      events.push(event);
      return super.logEvent(event);
    }
  }
  const api = createComputerUseTelemetry({
    StatsigClient: Captured,
    StatsigMetadataProvider: sdk.StatsigMetadataProvider,
  } as any);
  await host(
    {
      config: {},
      env: {},
      async fetch(url: string) {
        requests.push(url);
        return new Response(
          JSON.stringify(
            url.endsWith("/backend-api/me")
              ? {
                  object: "user",
                  id: "synthetic-sky-user",
                  email: "fixture@example.test",
                }
              : {
                  feature_gates: {},
                  dynamic_configs: {},
                  layer_configs: {},
                  has_updates: true,
                  time: Date.now(),
                  hash_used: "none",
                },
          ),
          { status: 200 },
        );
      },
    },
    async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        api.logComputerUseClientCreated();
        await Promise.race([
          identity,
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(Error("synthetic identity update did not finish")),
              15000,
            );
          }),
        ]);
        api.logComputerUseToolCalled({
          toolName: "click",
          durationMs: 1,
          terminalStatus: "completed",
        });
        assert.equal(events[1].metadata.eventParams.toolName, "click");
        assert.ok(requests.some((url) => url.includes("initialize")));
        assert.ok(requests.some((url) => url.endsWith("/backend-api/me")));
      } finally {
        if (timer) clearTimeout(timer);
        await client?.shutdown();
      }
    },
  );
});

test("persisted app approval does not cache or override a later policy denial", async () => {
  async function run(original: boolean) {
    const trace: unknown[] = [];
    let request = 0;
    const policy = makePolicy(original, {
      getClient: async () => ({
        getAppPolicy: async (app: string) => {
          const decision = ++request < 3 ? "allowed" : "denied";
          trace.push(["policy", app, decision]);
          return {
            decision, allowPersistentApproval: true,
            target: { appPath: "/fixture/App.app", bundleIdentifier: "test.fixture",
              displayName: "Fixture", risk: "high" },
          };
        },
      }),
      logComputerUseToolCalled: () => { trace.push("tool"); },
      logComputerUseApprovalRequested: () => { trace.push("requested"); },
      logComputerUseApprovalResolved: () => { trace.push("resolved"); },
    });
    const responses = await host({
      async createElicitation(args: any) {
        trace.push(["approval", args.meta.persist]);
        return { action: "accept", content: { source: "computer-use-persisted-state" },
          _meta: { persist: "always" } };
      },
    }, async () => {
      const responses = [];
      for (let index = 0; index < 3; index++) {
        responses.push(await result(() => policy.withComputerUsePolicy("click",
          { app: "Fixture" }, async (approved: any) => {
            trace.push(["operation", approved.app]); return "done";
          })));
      }
      return responses;
    });
    return { trace, responses };
  }
  const original = await run(true);
  assert.deepEqual(await run(false), original);
  assert.deepEqual(original.trace, [
    ["policy", "Fixture", "allowed"], ["approval", ["session", "always"]],
    ["operation", "/fixture/App.app"], "tool",
    ["policy", "Fixture", "allowed"], ["approval", ["session", "always"]],
    ["operation", "/fixture/App.app"], "tool",
    ["policy", "Fixture", "denied"],
  ]);
  assert.deepEqual(original.responses.slice(0, 2), [{ value: "done" }, { value: "done" }]);
  assert.match((original.responses[2] as any).error, /organization's policy/);
});
