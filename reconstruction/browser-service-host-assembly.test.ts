import test from "node:test";
import assert from "node:assert/strict";
import {
  availableBrowserSurfaces,
  browserSurfaceEnabled,
  assertBrowserSurfaceEnabled,
  surfaceForBackend,
  preferredBrowserExtension,
} from "../packages/browser/src/service/runtime/surface_policy";
import { assembleBrowserHost } from "../packages/browser/src/service/runtime/host_assembly";
import { originalServiceBindings } from "./service-source";
import { codexTurnMetadata } from "../packages/browser/src/service/preferences/request_context";
test("surface policy and extension preference preserve original allowlists, Dot restrictions and legacy keys", () => {
  const original = originalServiceBindings(
    [
      "dl",
      "Zt",
      "jy",
      "z8",
      "rC",
      "PA",
      "S5",
      "x5",
      "pl",
      "Is",
      "C5",
      "ro",
      "kA",
    ],
    {
      Me: codexTurnMetadata,
      lC: "BROWSER_USE_AVAILABLE_BACKENDS",
      bC: "BROWSER_USE_PREFERRED_EXTENSION_INSTANCE_ID",
      w5: "BROWSER_USE_PREFERRED_CHROME_EXTENSION_INSTANCE_ID",
      yC: "BROWSER_USE_PREFERRED_WINDOW_ID",
      _5: "BROWSER_USE_PREFERRED_CHROME_WINDOW_ID",
    },
  );
  for (const available of [
    undefined,
    null,
    1,
    "",
    "iab, dot, unknown,chrome",
    "dot",
    "cdp,mcpapps",
  ])
    for (const source of [undefined, "aeon_child", "subagent"])
      for (const surface of [
        "iab",
        "dot",
        "chrome",
        "cdp",
        "mcpapps",
        "unknown",
      ]) {
        const runtime = {
          env: { BROWSER_USE_AVAILABLE_BACKENDS: available },
          requestMeta: { "x-codex-turn-metadata": { thread_source: source } },
        };
        assert.deepEqual(
          availableBrowserSurfaces(runtime),
          original.PA(runtime),
        );
        assert.equal(
          browserSurfaceEnabled(runtime, surface),
          original.pl(runtime, surface),
        );
        const run = (fn: any) => {
          try {
            return fn(runtime, surface);
          } catch (error: any) {
            return error.message;
          }
        };
        assert.equal(run(assertBrowserSurfaceEnabled), run(original.Is));
      }
  for (const type of ["iab", "extension", "cdp", "mcpapps", "unknown"])
    assert.equal(surfaceForBackend(type), original.ro(type));
  for (const id of [undefined, "", " new "])
    for (const legacy of [undefined, " legacy "])
      for (const window of [
        undefined,
        "",
        " 0 ",
        "-1",
        "3",
        "2.5",
        "9007199254740992",
      ]) {
        const runtime = {
          env: {
            BROWSER_USE_PREFERRED_EXTENSION_INSTANCE_ID: id,
            BROWSER_USE_PREFERRED_CHROME_EXTENSION_INSTANCE_ID: legacy,
            BROWSER_USE_PREFERRED_WINDOW_ID: window,
            BROWSER_USE_PREFERRED_CHROME_WINDOW_ID: "4",
          },
        };
        assert.deepEqual(
          preferredBrowserExtension(runtime),
          original.kA(runtime),
        );
      }
});
test("assembled host discovers a real socket backend, verifies signed access and runs API/turn lifecycle", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createServer, createConnection } = await import("node:net");
  const { generateKeyPairSync, sign } = await import("node:crypto");
  const { NativePipeTransport } =
    await import("../packages/browser/src/service/runtime/native_pipe");
  const { nativePipeMessage } =
    await import("../packages/browser/src/service/runtime/native_pipe_bridge");
  const { BrowserRpcPeer } =
    await import("../packages/browser/src/service/runtime/rpc_peer");
  const { browserAccessDomain } =
    await import("../packages/browser/src/service/runtime/browser_access");
  const keys = generateKeyPairSync("ed25519"),
    root = await mkdtemp(join(tmpdir(), "cua-host-assembly-")),
    socketPath = join(root, "backend.sock");
  const transports: any[] = [];
  const events: any[] = [];
  let turnHook: any;
  let host: any;
  const server = createServer((socket) => {
    const transport = new NativePipeTransport(socket, {
      decodeMessage: nativePipeMessage,
    });
    transports.push(transport);
    const peer = new BrowserRpcPeer(transport);
    peer.registerRequestHandler("browser/access", (request: any) => {
      events.push(["access", request.sessionId, request.turnId]);
      const payload = JSON.stringify({
        domain: browserAccessDomain,
        request,
        allowed: true,
      });
      return {
        payload,
        signature: sign(null, Buffer.from(payload), keys.privateKey).toString(
          "base64",
        ),
      };
    });
    peer.registerRequestHandler("getInfo", () => ({
      type: "extension",
      family: "chrome",
      name: "Synthetic browser",
      requestHeadersVersion: 1,
    }));
    peer.registerRequestHandler("getTabs", (params: any) => {
      events.push(["tabs", params]);
      return [{ id: 8, url: "https://fixture.invalid" }];
    });
    peer.registerRequestHandler("turnEnded", (params: any) => {
      events.push(["turnEnded", params]);
      return {};
    });
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  try {
    const repl: any = {
      cwd: "/synthetic",
      env: {
        BROWSER_USE_BACKEND_PATHS: socketPath,
        BROWSER_USE_AVAILABLE_BACKENDS: "chrome",
        BROWSER_USE_TINYSKY_ENABLED: "0",
        BROWSER_USE_ACCESS_EXECUTOR_ID: "synthetic",
        BROWSER_USE_ACCESS_PIPE_PATH: socketPath,
        BROWSER_USE_ACCESS_VERIFYING_IDENTITY: keys.publicKey
          .export({ type: "spki", format: "der" })
          .toString("base64"),
      },
      requestMeta: {
        "x-codex-turn-metadata": { session_id: "session", turn_id: "turn" },
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
      createElicitation: async () => ({
        action: "decline",
        meta: { synthetic: true },
      }),
    };
    const factory = assembleBrowserHost({
      getPrivilegedRepl: () => repl,
      getNativePipeBridge: () => ({
        createConnection: async (path: string) =>
          await new Promise<any>((resolve, reject) => {
            const socket = createConnection(path);
            socket.once("connect", () => resolve(socket));
            socket.once("error", reject);
          }),
      }),
      reportError(error) {
        throw error;
      },
      reportDiscoveryFailure(_runtime, _details, reason) {
        events.push(["discovery reason", reason]);
      },
      featureEnabled: () => false,
      span: async (_name, _attrs, perform) => await perform(),
      commandTiming: {},
      performanceSpan: {},
      createErrorReporter: () => ({ captureException() {} }),
      loadClassicLevel: async () => null,
      getNativeCredentialObservationStatus() {
        throw Error("unexpected broker");
      },
      createBrowserAuthBrokerChallenge() {
        throw Error("unexpected challenge");
      },
    });
    host = await factory.createHost();
    await Promise.all([host.assertBrowserAccess(), host.assertBrowserAccess()]);
    assert.equal(events.filter((row) => row[0] === "access").length, 1);
    const browsers = await host.browserContext.list();
    assert.equal(browsers[0].name, "Synthetic browser");
    const browser = await host.browserContext.getDefault();
    assert.deepEqual(await browser.api.getTabs(), [
      { id: 8, url: "https://fixture.invalid" },
    ]);
    const request = events.find((row) => row[0] === "tabs")[1];
    assert.equal(request.session_id, "session");
    assert.deepEqual(request.request_headers, [
      { name: "X-Fixture", value: "synthetic" },
    ]);
    assert.deepEqual(await host.createElicitation({ message: "fixture" }), {
      action: "decline",
      _meta: { synthetic: true },
    });
    await turnHook.run({ session_id: "session", turn_id: "turn" });
    assert.equal(events.filter((row) => row[0] === "turnEnded").length, 1);
    await host.browserContext.dispose();
    assert.ok(events.some((row) => row[0] === "unregister"));
  } finally {
    await host?.browserContext.dispose();
    await Promise.all(transports.map((transport) => transport.close()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
