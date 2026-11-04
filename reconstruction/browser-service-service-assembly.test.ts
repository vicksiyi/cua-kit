import { setupBrowserRuntime } from "../packages/browser/src/runtime/setup";
import { setup_browser } from "../packages/cua/src/tinysky_alt/setup_browser";
import { create_browser_api } from "../packages/cua/src/tinysky_alt/create_browser_api";
import { create_bootstrap_emitter } from "../packages/cua/src/tinysky_alt/create_bootstrap_emitter";
import assert from "node:assert/strict";
import test from "node:test";
import { assembleBrowserService } from "../packages/browser/src/service/runtime/service_assembly";
import { NativePipeTransport } from "../packages/browser/src/service/runtime/native_pipe";
import { nativePipeMessage } from "../packages/browser/src/service/runtime/native_pipe_bridge";
import { BrowserRpcPeer } from "../packages/browser/src/service/runtime/rpc_peer";
import { browserAccessDomain } from "../packages/browser/src/service/runtime/browser_access";
test("assembled host and command service run real Unix socket RPC with signed access, managed headers and lifecycle", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises"),
    { tmpdir } = await import("node:os"),
    { join } = await import("node:path"),
    { createServer, createConnection } = await import("node:net"),
    { generateKeyPairSync, sign } = await import("node:crypto");
  const root = await mkdtemp(join(tmpdir(), "cua-service-")),
    path = join(root, "backend.sock"),
    keys = generateKeyPairSync("ed25519");
  const transports: NativePipeTransport[] = [],
    events: any[] = [],
    hooks: any[] = [];
  let turnHook: any,
    service: any,
    deny = false;
  const priorRepl = Object.getOwnPropertyDescriptor(globalThis, "nodeRepl");
  let tabUrl = "https://fixture.invalid/";
  const server = createServer((socket) => {
    const transport = new NativePipeTransport(socket, {
      decodeMessage: nativePipeMessage,
    });
    transports.push(transport);
    const rpc = new BrowserRpcPeer(transport);
    rpc.registerRequestHandler("browser/access", (request: any) => {
      events.push(["access", request.turnId]);
      const payload = JSON.stringify({
        domain: browserAccessDomain,
        request,
        allowed: !deny,
      });
      return {
        payload,
        signature: sign(null, Buffer.from(payload), keys.privateKey).toString(
          "base64",
        ),
      };
    });
    rpc.registerRequestHandler("getInfo", () => ({
      type: "extension",
      family: "chrome",
      name: "Synthetic socket browser",
      requestHeadersVersion: 1,
      capabilities: { browser: [], tab: [] },
    }));
    rpc.registerRequestHandler("getTabs", (params: any) => {
      events.push(["getTabs", params]);
      return [{ id: 8, title: "Synthetic", url: tabUrl }];
    });
    rpc.registerRequestHandler("getUserTabs", () => []);
    rpc.registerRequestHandler("getCommittedTabUrl", (params: any) => {
      events.push(["committedUrl", params]);
      return tabUrl;
    });
    rpc.registerRequestHandler("nameSession", (params: any) => {
      events.push(["nameSession", params]);
      if (params.name === "fail") throw Error("synthetic backend failure");
      return {};
    });
    rpc.registerRequestHandler("turnEnded", (params: any) => {
      events.push(["turnEnded", params]);
      return {};
    });
  });
  await new Promise<void>((resolve) => server.listen(path, resolve));
  try {
    const unused = () => {
      throw Error("unexercised host boundary");
    };
    const repl: any = {
      cwd: root,
      createElicitation: unused,
      env: {
        BROWSER_USE_BACKEND_PATHS: path,
        BROWSER_USE_AVAILABLE_BACKENDS: "chrome",
        BROWSER_USE_TINYSKY_ENABLED: "0",
        BROWSER_USE_DISABLE_TAB_CAPABILITIES: "webMcp",
        BROWSER_USE_ACCESS_EXECUTOR_ID: "synthetic",
        BROWSER_USE_ACCESS_PIPE_PATH: path,
        BROWSER_USE_ACCESS_VERIFYING_IDENTITY: keys.publicKey
          .export({ type: "spki", format: "der" })
          .toString("base64"),
      },
      requestMeta: {
        "x-codex-turn-metadata": {
          session_id: "service-session",
          turn_id: "turn-1",
        },
      },
      config: {
        read: async () => ({}),
        readRequirements: async () => ({
          requirements: {
            browserUse: {
              extension: {
                requestHeaders: [{ name: "X-Fixture", value: "synthetic" }],
              },
            },
          },
        }),
        readToml: async () => ({}),
        writeToml: async () => {},
      },
      addTurnEndedHandler(hook: any) {
        turnHook = hook;
        return () => events.push(["unregister"]);
      },
      addAfterSubmittedCodeHook(hook: any) {
        hooks.push(hook);
      },
      setResponseMeta(meta: any) {
        events.push(["meta", meta]);
      },
      emitContentItem(item: any) {
        events.push(["content", item]);
      },
    };
    const span: any = async (_name: any, _attrs: any, run: any) => run();
    service = assembleBrowserService({
      withSpan: span,
      host: {
        getPrivilegedRepl: () => repl,
        getNativePipeBridge: () => ({
          createConnection: (path: string) =>
            new Promise((resolve, reject) => {
              const socket = createConnection(path);
              socket.once("connect", () => resolve(socket));
              socket.once("error", reject);
            }),
        }),
        reportError: unused,
        reportDiscoveryFailure(_r, _d, reason) {
          events.push(["discoveryFailure", reason]);
        },
        featureEnabled: () => false,
        span,
        commandTiming: {
          startCommand() {
            return {
              async run(fn: any) {
                return fn();
              },
              finish(status: any) {
                events.push(["command.finish", status]);
              },
            };
          },
        },
        performanceSpan: {
          withSpan: span,
          withCommandTelemetry: async (_type: any, _params: any, run: any) =>
            run(),
        },
        createErrorReporter: () => ({ captureException: unused }),
        loadClassicLevel: async () => null,
        getNativeCredentialObservationStatus: unused,
        createBrowserAuthBrokerChallenge: unused,
      },
      runtime: {
        context: {
          injectedSource: "/* synthetic unused helper */",
          reportError: unused,
          reportEvent() {},
          createLocalizer: () => () => "fixture",
        },
        commands: {
          typeText: unused,
          emitBotDetection: unused,
          webMcp: {
            isLocalRuntime: () => true,
            featureFlag: async () => false,
            config: () => ({}),
            emit: unused,
          },
          browserAuth: {
            reviewSafety: unused,
            qr: { decode: unused, start: unused },
            telemetry: {} as any,
          },
        },
        documentation: {
          moduleUrl: "file:///synthetic/scripts/service.mjs",
          bundle: {
            default: {
              apiManifest: {
                root: "Browser",
                interfaces: {
                  Browser: {},
                  Agent: {},
                  Browsers: {},
                  Tabs: {},
                  Tab: {},
                },
                types: {},
              },
              documentManifest: [
                { name: "intro", mode: "included", requiredFor: ["list_tabs"] },
              ],
              documentation: { intro: "Socket integration instructions" },
            },
          },
        },
        telemetry: {
          setExceptionReporter() {},
          configureRuntimeTelemetry() {},
          emitEvent(_r: any, event: any) {
            events.push(["event", event]);
          },
          reportNotificationError: unused,
          configureBackendTelemetry() {},
          configureTurnTelemetry() {},
        },
      },
    });
    Object.defineProperty(globalThis, "nodeRepl", {
      configurable: true,
      value: {
        ...repl,
        rpc: async (name: string, request: any) => {
          assert.equal(name, "browser");
          events.push(["client.rpc", request.method, request.params?.type]);
          return service.handleRpc(request);
        },
        write(value: any, tag: any) {
          events.push(["write", tag, value]);
        },
        emitImage: unused,
      },
    });
    const agent: any = await setup_browser({
      setupBrowserRuntime,
      exclude_browser_confirmations: false,
    });
    const bootstrap = create_bootstrap_emitter({
      documentation: {
        read_core: async () => "Synthetic core",
        read: async () => "Synthetic additional APIs",
      } as any,
      target: "browser" as any,
    });
    const cua = create_browser_api(agent.browsers, bootstrap);
    const inventory = await service.handleRpc({
      method: "execute",
      params: { type: "list_browsers" },
    });
    assert.equal(inventory.length, 1);
    const id = inventory[0].id;
    await assert.rejects(
      service.handleRpc({
        method: "execute",
        params: { type: "list_tabs", browser_id: id },
      }),
      /Required documentation/,
    );
    assert.equal(events.filter((e) => e[0] === "getTabs").length, 0);
    const docs = await service.handleRpc({
      method: "execute",
      params: { type: "get_browser_documentation", browser_id: id },
    });
    assert(docs.includes("Socket integration instructions"));
    const tabs = await service.handleRpc({
      method: "execute",
      params: { type: "list_tabs", browser_id: id },
    });
    assert.deepEqual(tabs.tabs, [
      {
        id: "8",
        providerTabId: undefined,
        title: "Synthetic",
        url: "https://fixture.invalid/",
      },
    ]);
    await service.handleRpc({
      method: "execute",
      params: {
        type: "name_session",
        browser_id: id,
        name: "  Synthetic session  ",
      },
    });
    assert.equal(
      events.find((e) => e[0] === "nameSession")[1].name,
      "Synthetic session",
    );
    await assert.rejects(
      service.handleRpc({
        method: "execute",
        params: { type: "name_session", browser_id: id, name: "fail" },
      }),
      /synthetic backend failure/,
    );
    assert(events.some((e) => e[0] === "command.finish" && e[1] === "failure"));
    const request = events.find((e) => e[0] === "getTabs")[1];
    assert.equal(request.session_id, "service-session");
    assert.equal(request.turn_id, "turn-1");
    assert.deepEqual(request.request_headers, [
      { name: "X-Fixture", value: "synthetic" },
    ]);
    assert.equal(events.filter((e) => e[0] === "access").length, 1);
    const selected = await cua.getBrowser({ id });
    assert.equal(selected.browserId, id);
    const publicTabs = await cua.listTabs({ browser: id, emit: false });
    assert.equal(publicTabs[0].browserId, id);
    assert.equal(publicTabs[0].id, "8");
    await selected.nameSession("Public API session");
    assert.equal(
      events.filter((e) => e[0] === "nameSession").at(-1)[1].name,
      "Public API session",
    );
    tabUrl = "chrome://newtab/";
    const committedBefore = events.filter(
      (e) => e[0] === "committedUrl",
    ).length;
    const publicTab = await cua.getTab("8", { browser: id });
    assert.equal(publicTab.id, "8");
    assert.equal(typeof publicTab.getScreenshot, "function");
    assert.equal(typeof publicTab.click, "function");
    assert.equal(
      events.filter((e) => e[0] === "committedUrl").length,
      committedBefore,
    );
    assert(events.some((e) => e[0] === "write" && e[1] === "cua.core"));
    assert(events.some((e) => e[0] === "write" && e[1] === "cua.state"));
    assert(
      events.some(
        (e) =>
          e[0] === "client.rpc" &&
          e[1] === "executeWithRecovery" &&
          e[2] === "get_tab",
      ),
    );
    await hooks[0].run();
    await hooks[1].run();
    assert(
      events.some(
        (e) => e[0] === "meta" && e[1]["codex/toolSurface"]?.browserId === id,
      ),
    );
    await turnHook.run({ session_id: "service-session", turn_id: "turn-1" });
    assert.equal(events.filter((e) => e[0] === "turnEnded").length, 1);
    deny = true;
    repl.requestMeta = {
      "x-codex-turn-metadata": {
        session_id: "service-session",
        turn_id: "turn-2",
      },
    };
    const before = events.filter((e) => e[0] === "getTabs").length;
    await assert.rejects(
      service.handleRpc({
        method: "execute",
        params: { type: "list_tabs", browser_id: id },
      }),
    );
    assert.equal(events.filter((e) => e[0] === "access").length, 2);
    assert.equal(events.filter((e) => e[0] === "getTabs").length, before);
    await service.dispose();
    assert(events.some((e) => e[0] === "unregister"));
  } finally {
    if (priorRepl) Object.defineProperty(globalThis, "nodeRepl", priorRepl);
    else delete (globalThis as any).nodeRepl;
    await service?.dispose();
    await Promise.all(transports.map((t) => t.close()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
