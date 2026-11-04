import { createServer } from "node:http";
import {
  createNativeHostInstallation,
  registerNativeHostForProfile,
} from "../packages/native-host/src/installation";
import { connectNativeHost } from "../packages/native-host/src/client";
import { BrowserRpcPeer } from "../packages/core/src/browser_rpc_peer";
import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  readdir,
  readFile,
  cp,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

test(
  "Chrome launches independent native host and serves restored handler over authenticated socket",
  { timeout: 30000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "core-native-controller-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const extension = join(root, "extension");
    await mkdir(extension);
    await cp(
      "packages/browser-extension/dist/content-scripts",
      join(extension, "content-scripts"),
      { recursive: true },
    );
    await writeFile(
      join(extension, "manifest.json"),
      JSON.stringify({
        manifest_version: 3,
        name: "Core controller integration",
        version: "1.0.0",
        permissions: [
          "tabs",
          "tabGroups",
          "storage",
          "debugger",
          "scripting",
          "webNavigation",
          "webRequest",
          "declarativeNetRequest",
          "alarms",
          "nativeMessaging",
          "history",
          "downloads",
        ],
        host_permissions: ["<all_urls>"],
        background: { service_worker: "background.js" },
      }),
    );
    await build({
      stdin: {
        contents: `
import {createNativeBrowserController} from './packages/browser-extension/src/native_browser_controller';
const diagnostics=[];
const controller=createNativeBrowserController({
  host:{chrome,crypto,now:Date.now,setTimeout:setTimeout.bind(globalThis),clearTimeout:clearTimeout.bind(globalThis),error:(...args)=>diagnostics.push(args)},
  navigator:{userAgent:navigator.userAgent},hostName:'com.core.cua',
  sessionDiagnostics:{metric:(...args)=>diagnostics.push(args),warn:(...args)=>diagnostics.push(args)},
  handlerOptions:{buildChannel:'dev'},
});
globalThis.reconnectController=()=>controller.transport.reconnectNow();
globalThis.inspectController=async()=>({info:await controller.handler.getInfo({}),tabs:await controller.handler.getUserTabs({}),status:controller.transport.getStatus(),diagnostics});
`,
        resolveDir: resolve("."),
        loader: "ts",
      },
      bundle: true,
      platform: "browser",
      format: "iife",
      outfile: join(extension, "background.js"),
    });
    const pageServer = createServer((_request, response) => {
      response.setHeader("Content-Type", "text/html");
      response.end(
        "<title>Core native page</title><h1>Actual browser capture</h1><p>native-roundtrip-marker</p>",
      );
    });
    await new Promise<void>((resolve) =>
      pageServer.listen(0, "127.0.0.1", resolve),
    );
    t.after(
      () => new Promise<void>((resolve) => pageServer.close(() => resolve())),
    );
    const address = pageServer.address() as { port: number };
    const pageUrl = `http://127.0.0.1:${address.port}/`;
    const context = await chromium.launchPersistentContext(
      join(root, "profile"),
      {
        env: { ...process.env, TMPDIR: root },
        channel: "chromium",
        headless: true,
        args: [
          `--disable-extensions-except=${extension}`,
          `--load-extension=${extension}`,
        ],
      },
    );
    try {
      const page = await context.newPage();
      await page.goto(pageUrl);
      const worker =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent("serviceworker"));
      const result = await worker.evaluate(
        async () => await (globalThis as any).inspectController(),
      );
      assert.equal(result.info.type, "extension");
      assert.equal(result.info.family, "chrome");
      assert.ok(Array.isArray(result.tabs));
      assert.equal(result.status.hostName, "com.core.cua");
      assert.ok(result.info.metadata.extensionId.length === 32);
      const installation = await createNativeHostInstallation({
        parentDirectory: join(root, "host-installation"),
        nodePath: process.execPath,
        entryPath: resolve("packages/native-host/dist/main.mjs"),
        extensionIds: [result.info.metadata.extensionId],
      });
      await registerNativeHostForProfile(installation, join(root, "profile"));
      await worker.evaluate(() => (globalThis as any).reconnectController());
      let endpointFile: string | undefined;
      for (let attempt = 0; attempt < 50; attempt++) {
        const entries = await readdir(root);
        for (const entry of entries.filter((name) =>
          name.startsWith("core-cua-"),
        )) {
          const candidate = join(root, entry, "endpoint.json");
          try {
            await readFile(candidate);
            endpointFile = candidate;
            break;
          } catch {}
        }
        if (endpointFile) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const status = await worker.evaluate(
        async () => (await (globalThis as any).inspectController()).status,
      );
      assert.ok(endpointFile, JSON.stringify(status));
      const transport = await connectNativeHost(
        JSON.parse(await readFile(endpointFile!, "utf8")),
      );
      try {
        const peer = new BrowserRpcPeer(transport);
        peer.registerRequestHandler("ping", () => "pong");
        const info = await peer.sendRequest("getInfo", {});
        assert.equal(
          info.metadata.extensionId,
          result.info.metadata.extensionId,
        );
        assert.equal(info.type, "extension");
        const tabs = await peer.sendRequest("getUserTabs", {});
        assert.ok(Array.isArray(tabs));
        const tab = tabs.find((item: any) => item.url === pageUrl);
        assert.ok(tab);
        const captured = await peer.sendRequest("getTabContext", {
          session_id: "native-live",
          turn_id: "read-1",
          tabId: tab.id,
        });
        assert.equal(captured.url, pageUrl);
        assert.equal(captured.title, "Core native page");
        assert.match(captured.text, /native-roundtrip-marker/);
        assert.equal(captured.truncated, false);
        const created = await peer.sendRequest("createTab", {
          session_id: "native-live",
          turn_id: "read-1",
        });
        assert.ok(Number.isInteger(created.id));
        assert.notEqual(created.id, tab.id);
        await peer.sendRequest("turnEnded", {
          session_id: "native-live",
          turn_id: "read-1",
        });
      } finally {
        await transport.close();
      }
    } finally {
      await context.close();
    }
  },
);
