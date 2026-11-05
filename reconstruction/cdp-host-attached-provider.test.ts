import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { startOwnedCdpBrowser } from "../packages/cdp-host/src/owned-browser";
import { startCdpHost } from "../packages/cdp-host/src/host";
import { connectNativeHost } from "@core/native-host";
import { BrowserRpcPeer } from "@core/core/browserRpcPeer";
import { verifyIndependentMcpBrowser } from "./independent-mcp-browser";

test(
  "attached provider controls an existing tab without routing or closing unrelated user tabs; restored MCP also acts through attachment",
  { timeout: 120000 },
  async () => {
    let deniedHits = 0;
    const server = createServer((req, res) => {
      res.setHeader("content-type", "text/html");
      if (req.url?.startsWith("/denied")) deniedHits++;
      res.end(
        req.url === "/next"
          ? `<h1>Navigation target</h1><button onclick="document.querySelector('p').textContent='action-completed-marker'">Run action</button><p>Ready</p>`
          : "<h1>Actual browser capture</h1>",
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const root = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const browser = await startOwnedCdpBrowser({ headless: true });
    let host: Awaited<ReturnType<typeof startCdpHost>> | undefined;
    let transport: Awaited<ReturnType<typeof connectNativeHost>> | undefined;
    try {
      const controlled = browser.context.pages()[0],
        unrelated = await browser.context.newPage();
      await controlled.goto(root + "/controlled");
      await unrelated.goto(root + "/unrelated");
      host = await startCdpHost({ endpoint: browser.endpoint });
      transport = await connectNativeHost(host.endpoint);
      const peer = new BrowserRpcPeer(transport);
      const request = (method: string, params: Record<string, unknown> = {}) =>
        peer.sendRequest(method, {
          session_id: "attached-test",
          turn_id: "one",
          ...params,
        });
      const inventory = await request("getTabs");
      const tab = inventory.find(
        (item: any) => item.url === root + "/controlled",
      );
      assert.ok(tab);
      await request("claimUserTab", { tabId: tab.id });
      await request("attach", {
        tabId: tab.id,
        networkPolicy: {
          constraints: [
            { mode: "allowlist", kind: "origins", patterns: [root] },
          ],
        },
      });
      const command = (
        method: string,
        commandParams: Record<string, unknown> = {},
      ) =>
        request("executeCdp", {
          target: { tabId: tab.id },
          method,
          commandParams,
        });
      await assert.rejects(command("Network.disable"), /cannot be disabled/);
      await assert.rejects(
        command("Network.setBypassServiceWorker", { bypass: false }),
        /cannot be disabled/,
      );
      await command("Runtime.evaluate", {
        expression: "document.body.dataset.coreFixture='observed-existing-tab'",
      });
      assert.equal(
        await controlled.evaluate(() => document.body.dataset.coreFixture),
        "observed-existing-tab",
      );
      // A separate local origin is denied only for the controlled page.
      const forbidden = root.replace("127.0.0.1", "localhost");
      const blocked = await command("Page.navigate", {
        url: forbidden + "/denied-controlled",
      });
      assert.match(blocked.errorText, /BLOCKED/);
      assert.equal(deniedHits, 0);
      await unrelated.goto(root + "/denied-unrelated");
      assert.equal(deniedHits, 1);
      await request("detach", { tabId: tab.id });
      await controlled.goto(root + "/released");
      await request("turnEnded");
      assert.equal(controlled.isClosed(), false);
      await transport.close();
      transport = undefined;
      await verifyIndependentMcpBrowser(
        host.endpointFile,
        root + "/",
        undefined,
        "cdp",
      );
      await host.close();
      host = undefined;
      assert.equal(controlled.isClosed(), false);
      assert.equal(unrelated.isClosed(), false);
      await unrelated.goto(root + "/after-disconnect");
      assert.equal(
        await unrelated.locator("h1").textContent(),
        "Actual browser capture",
      );
      assert.ok(
        (await browser.connection.send("Target.getTargets")).targetInfos
          .length >= 2,
      );
    } finally {
      await transport?.close();
      await host?.close();
      await browser.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);
