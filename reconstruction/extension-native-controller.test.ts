import { execFileSync } from "node:child_process";
import { discoverEndpointFiles } from "../packages/native-host/src/endpoint_configuration";
import { verifyIndependentMcpBrowser } from "./independent-mcp-browser";
import { createServer } from "node:http";
import { chromeExtensionId } from "../packages/native-host/src/installation";
import { connectNativeHost } from "../packages/native-host/src/client";
import { BrowserRpcPeer } from "../packages/core/src/browser_rpc_peer";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, readFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

test(
  "packaged native extension serves real CUA operations through the full MCP chain",
  { timeout: 120000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "core-native-controller-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const extension = join(root, "extension");
    await cp("packages/browser-extension/dist/native-extension", extension, {
      recursive: true,
    });
    const manifest = JSON.parse(
      await readFile(join(extension, "manifest.json"), "utf8"),
    );
    const extensionId = chromeExtensionId(manifest.key);
    // Short explicit root avoids macOS Unix socket path length limits.
    const installationRoot = await mkdtemp("/tmp/core-deployment-");
    t.after(() => rm(installationRoot, { recursive: true, force: true }));
    const hostDirectory = join(installationRoot, "endpoints");
    for (let attempt = 0; attempt < 2; attempt++) {
      const installed = execFileSync(
        process.execPath,
        [
          resolve("packages/native-host/dist/install.mjs"),
          "--root",
          installationRoot,
          "--profile",
          join(root, "profile"),
        ],
        { encoding: "utf8" },
      );
      assert.ok(installed.includes(extensionId));
      assert.match(installed, /project .env was not changed/);
    }
    const pageServer = createServer((request, response) => {
      response.setHeader("Content-Type", "text/html");
      response.end(
        request.url === "/next"
          ? `<title>Navigation target</title><h1>Navigation target</h1><button onclick="document.querySelector('p').textContent='action-completed-marker'">Run action</button><p>waiting</p>`
          : "<title>Core native page</title><h1>Actual browser capture</h1><p>native-roundtrip-marker</p>",
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
      assert.equal(await worker.evaluate(() => chrome.runtime.id), extensionId);
      let endpointFile: string | undefined;
      for (let attempt = 0; attempt < 50; attempt++) {
        try {
          endpointFile = (await discoverEndpointFiles(hostDirectory))[0];
        } catch (error) {
          if (!String(error).includes("No independent browser host"))
            throw error;
        }
        if (endpointFile) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.ok(
        endpointFile,
        "Built extension did not launch its registered native host",
      );
      const transport = await connectNativeHost(
        JSON.parse(await readFile(endpointFile!, "utf8")),
      );
      try {
        const peer = new BrowserRpcPeer(transport);
        peer.registerRequestHandler("ping", () => "pong");
        const info = await peer.sendRequest("getInfo", {});
        assert.equal(info.metadata.extensionId, extensionId);
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
      await verifyIndependentMcpBrowser(endpointFile!, pageUrl, hostDirectory);
    } finally {
      await context.close();
    }
  },
);
