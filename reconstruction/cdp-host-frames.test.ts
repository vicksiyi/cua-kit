import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { startCdpHost } from "../packages/cdp-host/src/host";
import { connectNativeHost } from "@core/native-host";
import { BrowserRpcPeer } from "@core/core/browserRpcPeer";
test(
  "cross-site iframe receives owned nested CDP session before evaluation",
  { timeout: 30000 },
  async () => {
    const server = createServer((req, res) => {
      res.setHeader("content-type", "text/html");
      const port = (server.address() as { port: number }).port;
      res.end(
        req.url === "/frame"
          ? "<p>owned-cross-site-frame</p>"
          : `<iframe src="http://localhost:${port}/frame"></iframe>`,
      );
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    let host: Awaited<ReturnType<typeof startCdpHost>> | undefined;
    let transport: Awaited<ReturnType<typeof connectNativeHost>> | undefined;
    try {
      host = await startCdpHost({ headless: true });
      transport = await connectNativeHost(host.endpoint);
      const peer = new BrowserRpcPeer(transport);
      const request = (method: string, params: Record<string, unknown> = {}) =>
        peer
          .sendRequest(method, {
            session_id: "frames",
            turn_id: "turn",
            ...params,
          })
          .catch((error) => {
            throw Error(`${method}: ${error}`);
          });
      const tab = await request("createTab");
      const port = (server.address() as { port: number }).port;
      await request("attach", {
        tabId: tab.id,
        networkPolicy: {
          constraints: [
            {
              mode: "allowlist",
              kind: "origins",
              patterns: [
                `http://127.0.0.1:${port}`,
                `http://localhost:${port}`,
              ],
            },
          ],
        },
      });
      let child: any;
      peer.addEventListener("onCDPEvent", (event) => {
        if (
          event.method === "Target.attachedToTarget" &&
          event.params.targetInfo.type === "iframe"
        )
          child = event.params;
      });
      const command = (
        method: string,
        commandParams: Record<string, unknown> = {},
        sessionId?: string,
      ) =>
        request("executeCdp", {
          target: { tabId: tab.id, ...(sessionId ? { sessionId } : {}) },
          method,
          commandParams,
        });
      await command("Target.setAutoAttach", {
        autoAttach: true,
        flatten: true,
        waitForDebuggerOnStart: false,
        filter: [{ type: "iframe", exclude: false }],
      });
      await command("Page.navigate", { url: `http://127.0.0.1:${port}/` });
      for (let count = 0; count < 200 && !child; count++)
        await new Promise((resolve) => setTimeout(resolve, 25));
      assert.ok(child, "Expected actual out-of-process iframe attachment");
      await request("attachTarget", {
        tabId: tab.id,
        targetId: child.targetInfo.targetId,
      });
      let result: any;
      for (let count = 0; count < 100; count++) {
        result = await command(
          "Runtime.evaluate",
          { expression: "document.body?.textContent", returnByValue: true },
          child.sessionId,
        );
        if (result.result.value?.includes("owned-cross-site-frame")) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.match(result.result.value, /owned-cross-site-frame/);
      await request("detachTarget", {
        tabId: tab.id,
        targetId: child.targetInfo.targetId,
      });
      await assert.rejects(
        command("Runtime.evaluate", { expression: "1" }, child.sessionId),
        /unowned/,
      );
    } finally {
      await transport?.close();
      await host?.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);
