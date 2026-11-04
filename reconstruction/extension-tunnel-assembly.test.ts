import { createTunnelKernelBindings } from "../packages/browser-extension/src/tunnel_kernel_bindings";
import { registerBackgroundKernel } from "../packages/browser-extension/src/kernel_background";
import assert from "node:assert/strict";
import test from "node:test";
import { startAssembledBrowserTunnel } from "../packages/browser-extension/src/tunnel_assembly";
import { createTunnelSetup } from "../packages/browser-extension/src/tunnel_setup";
import { createTunnelActivity } from "../packages/browser-extension/src/tunnel_activity";
import { createKernelTunnelRuntime } from "../packages/browser-extension/src/kernel_tunnel_runtime";
import { createChatApiClass } from "../packages/browser-extension/src/chat_api";

function event() {
  const listeners = new Set<Function>();
  return {
    listeners,
    addListener(fn: Function) {
      listeners.add(fn);
    },
    removeListener(fn: Function) {
      listeners.delete(fn);
    },
    emit(...args: unknown[]) {
      for (const fn of listeners) fn(...args);
    },
  };
}
// Chrome, authentication and HTTP are explicit fixtures. All services between
// registration and the delivered MCP response are the restored implementations.
for (const throughBindings of [false, true])
  for (const authenticated of [true, false])
    test(`assembled tunnel: authenticated=${authenticated}, bindings=${throughBindings}`, async () => {
      const changed = event();
      function area(name: string) {
        const values: Record<string, any> = {};
        return {
          values,
          async get(key: string) {
            return { [key]: values[key] };
          },
          async set(next: Record<string, unknown>) {
            Object.assign(values, next);
            changed.emit(
              Object.fromEntries(
                Object.entries(next).map(([key, newValue]) => [
                  key,
                  { newValue },
                ]),
              ),
              name,
            );
          },
          async remove(key: string) {
            delete values[key];
            changed.emit({ [key]: {} }, name);
          },
        };
      }
      const storage = {
        local: area("local"),
        session: area("session"),
        sync: area("sync"),
        onChanged: changed,
      };
      const events = [
        changed,
        event(),
        event(),
        event(),
        event(),
        event(),
        event(),
      ];
      const alarms = new Map<string, unknown>();
      const browser: any = {
        storage,
        tabs: {
          query: async () => [{ url: "https://chatgpt.com/" }],
          onCreated: events[1],
          onUpdated: events[2],
          onRemoved: events[3],
        },
        runtime: { getContexts: async () => [] },
        sidePanel: { onOpened: events[4] },
        webNavigation: { onCompleted: events[5] },
        alarms: {
          onAlarm: events[6],
          create: async (name: string, value: unknown) => {
            alarms.set(name, value);
          },
          clear: async (name: string) => alarms.delete(name),
        },
      };
      const requests: string[] = [],
        posted: any[] = [],
        reports: any[] = [];
      let activeBindings:
        ReturnType<typeof createTunnelKernelBindings> | undefined;
      let kernelExecutions = 0;
      storage.sync.values.browserUseControlAllowed = true; // explicit fixture consent
      let polls = 0,
        aborted = 0;
      const network: typeof fetch = async (input, init) => {
        const url = String(input);
        requests.push(url);
        if (url.endsWith("/browser-use/sessions"))
          return Response.json({
            base_url: "https://tunnel.fixture.invalid",
            tunnel_id: "registered",
          });
        if (url.includes("/poll?")) {
          assert.equal(
            new Headers(init?.headers).get("Authorization"),
            "Bearer fixture-token",
          );
          if (++polls === 1)
            return Response.json({
              commands: [
                {
                  command_type: "jsonrpc",
                  request_id: "ping",
                  jsonrpc: throughBindings
                    ? {
                        jsonrpc: "2.0",
                        id: 7,
                        method: "tools/call",
                        params: {
                          name: "js",
                          arguments: {
                            code: "fixture operation",
                            instance_id: "fixture",
                          },
                          _meta: {
                            "x-codex-turn-metadata": {
                              session_id: "session",
                              turn_id: "turn",
                            },
                          },
                        },
                      }
                    : { jsonrpc: "2.0", id: 7, method: "ping" },
                },
              ],
            });
          return new Promise((_, reject) => {
            const abort = () => {
              aborted++;
              reject(init?.signal?.reason);
            };
            if (init?.signal?.aborted) abort();
            else init?.signal?.addEventListener("abort", abort, { once: true });
          });
        }
        if (url.endsWith("/response")) {
          posted.push(JSON.parse(String(init?.body)));
          return new Response(null, { status: 204 });
        }
        throw Error(`Unexpected fixture URL ${url}`);
      };
      const runtimeOptions = {
        ChatApi: createChatApiClass({
          fetch: network,
          setTimeout,
          clearTimeout,
        }),
        storage: storage.sync,
        randomUUID: () => "fixture-uuid",
        browserShortDisplayName: () => "Chrome",
        warn() {},
        kernelHost: {
          randomUUID: () => "fixture-request",
          offscreen: {
            async createDocument() {
              if (!throughBindings)
                throw Error("ping must not create a kernel");
            },
          },
          runtime: {
            getURL: (path) => path,
            getContexts: async () => [],
            async sendMessage(message: any) {
              if (!throughBindings) throw Error("ping must not execute JS");
              if (message.type === "js-kernel:reset")
                return { id: message.id, ok: true };
              assert.equal(message.type, "js-kernel:execute");
              const scope = activeBindings!.getScope(message.scopeId);
              assert.equal((scope.chatApi as any).account.id, "account");
              scope.content.push({ type: "text", text: "shared scope output" });
              kernelExecutions++;
              return {
                id: message.id,
                ok: true,
                output: { contentItems: ["fixture kernel result"] },
              };
            },
          },
        },
      };
      const runtime = createKernelTunnelRuntime(runtimeOptions);
      const assemblyOptions = {
        foundation: {
          setupBrowserTunnel: createTunnelSetup({
            storage,
            fetch: network,
            instanceId: async () => "fixture-instance",
            readAuthSession: async () =>
              authenticated
                ? {
                    status: 200,
                    session: {
                      accessToken: "fixture-token",
                      account: {
                        userId: "user",
                        id: "account",
                        structure: "personal",
                      },
                    },
                  }
                : { status: 401, error: "http" },
          }),
          createTunnelActivity: (callback, reportIdle) =>
            createTunnelActivity(
              { chrome: browser, now: Date.now, reportIdle },
              callback,
            ),
        },
        runtime,
        chrome: browser,
        environment: {
          fetch: network,
          now: () => performance.now(),
          wallNow: Date.now,
          random: () => 0,
          randomUUID: () => "request",
          setTimeout,
          clearTimeout,
          version: () => "fixture",
          online: () => true,
          warn() {},
          reportPollingState() {},
          reportResponseFailure() {},
        },
        reportSetup: (report) => reports.push(report),
        reportIdle() {},
      };
      let stop: () => void;
      if (throughBindings) {
        const bindings = createTunnelKernelBindings({
          ...assemblyOptions,
          foundation: {
            ...assemblyOptions.foundation,
            ChatApi: runtimeOptions.ChatApi,
          } as any,
          kernelHost: runtimeOptions.kernelHost,
          browserShortDisplayName: () => "Chrome",
          siteStatusUrl: new URL("https://fixture.invalid/status"),
          defaultAllowedPages: [],
          setInterval,
          clearInterval,
        });
        activeBindings = bindings;
        let gate!: (value: boolean) => void;
        let registration: Promise<unknown> | undefined;
        let registrations = 0;
        registerBackgroundKernel({
          peers: new Map(),
          createControl: () => {
            throw Error("no connection in fixture");
          },
          createBrowserPeer: () => ({}),
          createControlPeer: () => ({ sendTurnEnded: async () => {} }),
          registerConnections() {},
          registerTurnEnded: (callback) => {
            registrations++;
            return (registration = bindings.registerTurnEnded(callback));
          },
          turnEnded: async () => {},
          observeGate: async (callback) => {
            gate = callback;
          },
          reportGateError: (error) => {
            throw error;
          },
          warn() {},
          reportTurnEndedError: (error) => {
            throw error;
          },
        });
        gate(false);
        assert.equal(requests.length, 0);
        assert.equal(registrations, 0);
        gate(true);
        gate(true);
        assert.equal(registrations, 1, "original gate activates only once");
        stop = (await registration) as () => void;
      } else
        stop = await startAssembledBrowserTunnel(
          assemblyOptions,
          async () => {},
        );
      try {
        // Bound the asynchronous poll/response chain without sleeps or real network.
        for (let i = 0; i < 100; i++) await Promise.resolve();
        assert.equal(
          reports.at(-1).outcome,
          authenticated ? "created" : "invalid_session",
        );
        if (authenticated) {
          assert.equal(
            storage.session.values.nodeReplTunnel.tunnelId,
            "registered",
          );
          assert.equal(posted.length, 1);
          assert.equal(posted[0].resp_json.id, 7);
          if (throughBindings) {
            assert.equal(kernelExecutions, 1);
            assert.deepEqual(posted[0].resp_json.result.content, [
              { type: "text", text: "shared scope output" },
              { type: "text", text: "fixture kernel result" },
            ]);
          } else assert.deepEqual(posted[0].resp_json.result, {});
          assert.ok(polls >= 2);
        } else {
          assert.equal(requests.length, 0);
          assert.equal(storage.session.values.nodeReplTunnel, undefined);
        }
      } finally {
        stop();
      }
      for (let i = 0; i < 20; i++) await Promise.resolve();
      assert.equal(aborted, authenticated ? 1 : 0);
      assert.equal(alarms.size, 0);
      for (const e of events) assert.equal(e.listeners.size, 0);
    });
