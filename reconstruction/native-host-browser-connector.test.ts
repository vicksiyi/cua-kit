import assert from "node:assert/strict";
import test from "node:test";
import { PassThrough } from "node:stream";
import { chmod } from "node:fs/promises";
import { startNativeHost } from "../packages/native-host/src/server";
import { createBrowserServiceConnector } from "../packages/native-host/src/browser_connector";
import {
  NativePipeFrameDecoder,
  encodeNativePipeFrame,
} from "../packages/browser/src/service/runtime/native_pipe";
import { ExtensionBrowserPeer } from "../packages/browser-extension/src/browser_peer";
import { assembleBrowserService } from "../packages/browser/src/service/runtime/service_assembly";

test(
  "restored service discovers authenticated independent host through its existing bridge injection",
  { timeout: 10000 },
  async (t) => {
    const input = new PassThrough(),
      output = new PassThrough();
    const frames = new NativePipeFrameDecoder();
    let receive: (value: any) => void = () => {};
    const extension = new ExtensionBrowserPeer(
      {
        setMessageCallback(callback) {
          receive = callback;
        },
        sendMessage(message) {
          input.write(encodeNativePipeFrame(JSON.stringify(message)));
        },
      },
      {
        moveMouse() {},
        getInfo() {
          return {
            type: "extension",
            family: "chrome",
            name: "Controlled core host",
            capabilities: { browser: [], tab: [] },
          };
        },
        getUserTabs() {
          return [];
        },
        turnEnded() {
          return {};
        },
      },
    );
    output.on("data", (bytes) => {
      for (const frame of frames.push(bytes)) receive(JSON.parse(frame));
    });
    const host = await startNativeHost(input, output);
    t.after(() => host.close());
    const connector = await createBrowserServiceConnector([host.endpointFile]);
    assert.equal(
      connector.environment.BROWSER_USE_BACKEND_PATHS,
      host.endpoint.socketPath,
    );
    assert.ok(!JSON.stringify(connector).includes(host.endpoint.token));
    await assert.rejects(
      connector.host
        .getNativePipeBridge()
        .createConnection("/tmp/unregistered.sock"),
      /outside/,
    );
    let hook: any;
    const repl = {
      env: {
        ...connector.environment,
        CUA_REPL_ENABLED_SURFACES: "browser",
        BROWSER_USE_AVAILABLE_BACKENDS: "chrome",
        BROWSER_USE_DISABLE_AMBIENT_NETWORK: "1",
      },
      requestMeta: {
        "x-codex-turn-metadata": {
          session_id: "independent-host-test",
          turn_id: "turn-1",
        },
      },
      config: {
        read: async () => ({ config: {} }),
        readRequirements: async () => ({ requirements: {} }),
        readToml: async () => ({}),
        writeToml: async () => {},
      },
      createElicitation: async () => ({ action: "decline" }),
      addTurnEndedHandler(callback: any) {
        hook = callback;
        return () => {};
      },
      addAfterSubmittedCodeHook() {},
      setResponseMeta() {},
      emitContentItem() {},
    };
    const service = assembleBrowserService({
      host: {
        ...connector.host,
        getPrivilegedRepl: () => repl,
        loadClassicLevel: async () => null,
      },
      runtime: {
        documentation: {
          moduleUrl: "file:///core-host-test/service.mjs",
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
              documentManifest: [],
              documentation: {},
            },
          },
        },
      },
    });
    t.after(() => service.dispose());
    await service.handleRpc({
      method: "setup",
      params: { environment: "codex-app" },
    });
    const browsers = await service.handleRpc({
      method: "execute",
      params: { type: "list_browsers" },
    });
    assert.equal(browsers.length, 1);
    assert.equal(browsers[0].name, "Controlled core host");
    assert.equal(await extension.ping(), "pong");
    await hook.run({ session_id: "independent-host-test", turn_id: "turn-1" });
    await chmod(host.endpointFile, 0o644);
    await assert.rejects(
      createBrowserServiceConnector([host.endpointFile]),
      /private/,
    );
  },
);
