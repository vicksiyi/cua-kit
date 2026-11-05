import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { startCdpHost } from "../packages/cdp-host/src/host";
import { connectNativeHost } from "@core/native-host";
import { BrowserRpcPeer } from "@core/core/browserRpcPeer";
test(
  "authenticated CDP provider discovers tabs and enforces network/session boundaries",
  { timeout: 30000 },
  async () => {
    let requests = 0;
    const server = createServer((_req, res) => {
      requests++;
      res.end("CDP host test");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    let host: Awaited<ReturnType<typeof startCdpHost>> | undefined;
    let transport: Awaited<ReturnType<typeof connectNativeHost>> | undefined;
    try {
      host = await startCdpHost({ headless: true });
      transport = await connectNativeHost(host.endpoint);
      const peer = new BrowserRpcPeer(transport);
      const request = (method: string, params: Record<string, unknown> = {}) =>
        peer.sendRequest(method, {
          session_id: "test-session",
          turn_id: "turn",
          ...params,
        });
      assert.equal((await request("getInfo")).type, "cdp");
      const tab = await request("createTab");
      assert.ok(tab.id > 0);
      await request("attach", {
        tabId: tab.id,
        networkPolicy: {
          constraints: [{ mode: "allowlist", kind: "origins", patterns: [] }],
        },
      });
      const port = (server.address() as { port: number }).port,
        url = `http://127.0.0.1:${port}`;
      const command = (
        method: string,
        commandParams: Record<string, unknown> = {},
      ) =>
        request("executeCdp", {
          target: { tabId: tab.id },
          method,
          commandParams,
        });
      const blocked = await command("Page.navigate", { url });
      assert.match(blocked.errorText, /BLOCKED/);
      assert.equal(requests, 0);
      await assert.rejects(
        request("executeCdp", {
          session_id: "other-session",
          target: { tabId: tab.id },
          method: "Page.enable",
        }),
        /another session/,
      );
      // A rejected navigation leaves an error page; use a fresh tab to test allowed navigation.
      const allowed = await request("createTab");
      await request("attach", {
        tabId: allowed.id,
        networkPolicy: {
          constraints: [
            { mode: "allowlist", kind: "origins", patterns: [url] },
          ],
        },
      });
      const result = await request("executeCdp", {
        target: { tabId: allowed.id },
        method: "Page.navigate",
        commandParams: { url },
      });
      assert.equal(result.errorText, undefined);
      assert.ok(requests > 0);
      await assert.rejects(
        request("executeCdp", {
          target: { tabId: allowed.id },
          method: "Fetch.disable",
        }),
        /lifecycle/,
      );
      await assert.rejects(request("close"), /No handler/);
      await assert.rejects(
        request("finalizeTabs", {
          keep: [{ tabId: 999999, status: "deliverable" }],
        }),
        /unknown tab/,
      );
      await request("finalizeTabs", {
        keep: [{ tabId: allowed.id, status: "deliverable" }],
      });
      const remaining = await request("getTabs");
      assert.equal(
        remaining.some((entry: any) => entry.id === tab.id),
        false,
        "unmarked agent tab should close",
      );
      assert.equal(
        remaining.some((entry: any) => entry.id === allowed.id),
        true,
        "deliverable tab should remain",
      );
      await request("claimUserTab", {
        session_id: "next-session",
        tabId: allowed.id,
      });
      await request("turnEnded", { session_id: "next-session" });
      assert.equal(
        (await request("getTabs")).some(
          (entry: any) => entry.id === allowed.id,
        ),
        true,
        "reclaimed user tab must not be closed",
      );
    } finally {
      await transport?.close();
      await host?.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);

test(
  "provider blocks redirect and descendant-frame requests outside the allowed origin",
  { timeout: 30000 },
  async () => {
    let deniedRequests = 0;
    const denied = createServer((_req, res) => {
      deniedRequests++;
      res.end("unexpected access");
    });
    await new Promise<void>((resolve) =>
      denied.listen(0, "127.0.0.1", resolve),
    );
    const deniedUrl = `http://127.0.0.1:${(denied.address() as { port: number }).port}/`;
    const server = createServer((req, res) => {
      if (req.url === "/redirect") {
        res.writeHead(302, { Location: deniedUrl });
        res.end();
        return;
      }
      res.setHeader("content-type", "text/html");
      res.end(
        `<iframe src="${deniedUrl}"></iframe><script>window.probe=fetch('/redirect').then(()=> 'unexpected',()=> 'blocked')</script>`,
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    let host: Awaited<ReturnType<typeof startCdpHost>> | undefined;
    let transport: Awaited<ReturnType<typeof connectNativeHost>> | undefined;
    try {
      host = await startCdpHost({ headless: true });
      transport = await connectNativeHost(host.endpoint);
      const peer = new BrowserRpcPeer(transport);
      const request = (method: string, params: Record<string, unknown> = {}) =>
        peer.sendRequest(method, {
          session_id: "policy-session",
          turn_id: "turn",
          ...params,
        });
      const tab = await request("createTab");
      const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
      await request("attach", {
        tabId: tab.id,
        networkPolicy: {
          constraints: [
            {
              mode: "allowlist",
              kind: "origins",
              patterns: [new URL(url).origin],
            },
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
      await command("Page.navigate", { url });
      let result: any;
      for (let count = 0; count < 100; count++) {
        result = await command("Runtime.evaluate", {
          expression: "window.probe",
          awaitPromise: true,
          returnByValue: true,
        });
        if (result.result.value !== undefined) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(result.result.value, "blocked");
      await command("Runtime.evaluate", {
        expression:
          "document.readyState === 'complete' ? true : new Promise(resolve=>window.addEventListener('load',()=>resolve(true),{once:true}))",
        awaitPromise: true,
      });
      assert.equal(deniedRequests, 0);
    } finally {
      await transport?.close();
      await host?.close();
      await Promise.all(
        [server, denied].map(
          (server) =>
            new Promise<void>((resolve) => server.close(() => resolve())),
        ),
      );
    }
  },
);
