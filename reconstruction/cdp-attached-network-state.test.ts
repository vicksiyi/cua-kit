import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { startCdpHost } from "../packages/cdp-host/src/host";
import { connectNativeHost } from "@core/native-host";
import { BrowserRpcPeer } from "@core/core/browserRpcPeer";

test(
  "attached page lease restores service-worker fetch and WebSocket access while preserving unrelated pages",
  { timeout: 45000 },
  async () => {
    const sockets = new Set<import("node:net").Socket>();
    const server = createServer((req, res) => {
      if (req.url === "/sw.js") {
        res.setHeader("content-type", "application/javascript");
        res.end(
          `self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(new URL(e.request.url).pathname==='/sw-probe')e.respondWith(new Response('worker'));});`,
        );
      } else
        res.end(
          req.url === "/sw-probe" ? "network" : "<title>Lease fixture</title>",
        );
    });
    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
    });
    server.on("upgrade", (req, socket) => {
      const accept = createHash("sha1")
        .update(
          String(req.headers["sec-websocket-key"]) +
            "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
        )
        .digest("base64");
      socket.write(
        `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
      );
      socket.on("data", () => socket.end());
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const profile = await mkdtemp(join(tmpdir(), "core-attached-sw-"));
    const context = await chromium.launchPersistentContext(profile, {
      headless: true,
      serviceWorkers: "allow",
      env: {
        HOME: process.env.HOME!,
        PATH: process.env.PATH!,
        TMPDIR: process.env.TMPDIR ?? tmpdir(),
      },
      args: [
        "--remote-debugging-port=0",
        "--remote-debugging-address=127.0.0.1",
      ],
    });
    let host: Awaited<ReturnType<typeof startCdpHost>> | undefined;
    let transport: Awaited<ReturnType<typeof connectNativeHost>> | undefined;
    try {
      const page = context.pages()[0],
        other = await context.newPage();
      await page.goto(origin + "/controlled");
      await other.goto(origin + "/unrelated");
      await page.evaluate(async () => {
        await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller)
          await new Promise<void>((resolve) =>
            navigator.serviceWorker.addEventListener(
              "controllerchange",
              () => resolve(),
              { once: true },
            ),
          );
      });
      const fetchProbe = (target: Page) =>
        target.evaluate(async () => (await fetch("/sw-probe")).text());
      const wsProbe = (target: Page) =>
        target.evaluate(
          (url) =>
            new Promise<string>((resolve) => {
              const s = new WebSocket(url);
              const timer = setTimeout(() => {
                s.close();
                resolve("timeout");
              }, 2000);
              s.onopen = () => {
                clearTimeout(timer);
                s.close();
                resolve("open");
              };
              s.onerror = () => {
                clearTimeout(timer);
                resolve("blocked");
              };
              s.onclose = () => {
                clearTimeout(timer);
                resolve("blocked");
              };
            }),
          origin.replace("http:", "ws:") + "/socket",
        );
      assert.equal(await fetchProbe(page), "worker");
      assert.equal(await wsProbe(page), "open");
      const [port, path] = (
        await readFile(join(profile, "DevToolsActivePort"), "utf8")
      )
        .trim()
        .split("\n");
      host = await startCdpHost({ endpoint: `ws://127.0.0.1:${port}${path}` });
      transport = await connectNativeHost(host.endpoint);
      const peer = new BrowserRpcPeer(transport);
      const request = (method: string, params: Record<string, unknown> = {}) =>
        peer.sendRequest(method, {
          session_id: "worker-lease",
          turn_id: "one",
          ...params,
        });
      const tab = (await request("getTabs")).find(
        (t: any) => t.url === origin + "/controlled",
      );
      await request("attach", {
        tabId: tab.id,
        networkPolicy: {
          constraints: [
            { mode: "allowlist", kind: "origins", patterns: [origin] },
          ],
        },
      });
      assert.equal(await fetchProbe(page), "network");
      assert.equal(await fetchProbe(other), "worker");
      assert.equal(await wsProbe(page), "blocked");
      assert.equal(await wsProbe(other), "open");
      await request("detach", { tabId: tab.id });
      assert.equal(
        await fetchProbe(page),
        "worker",
        "Detaching must restore the original service-worker path",
      );
      assert.equal(
        await wsProbe(page),
        "open",
        "Released socket routing must become transparent",
      );
      await host.close();
      host = undefined;
      assert.equal(await fetchProbe(page), "worker");
      assert.equal(await wsProbe(other), "open");
    } finally {
      await transport?.close();
      await host?.close();
      await context.close();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(profile, { recursive: true, force: true });
    }
  },
);
