import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { discoverEndpointFiles, IndependentBrowserUnavailableError } from "../packages/native-host/src/endpoint_configuration";
import { verifyIndependentMcpBrowser } from "./independent-mcp-browser";
import { createServer } from "node:http";
import { chromeExtensionId } from "../packages/native-host/src/installation";
import { connectNativeHost } from "../packages/native-host/src/client";
import { BrowserRpcPeer } from "../packages/core/src/browser_rpc_peer";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, readFile, writeFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { chromium } from "playwright";

for (const deployment of ["native", "full"] as const)
  test(
    `packaged ${deployment} extension serves real CUA operations through the full MCP chain (${process.env.CUA_RUNTIME_SUPERVISOR ?? "installed"} supervisor)`,
    { timeout: (process.env.CUA_LIVE_BAIDU_TEST === "1" || process.env.CUA_LIVE_SEARCH_TEST === "1") ? 240000 : 120000 },
    async (t) => {
      const root = await mkdtemp(join(tmpdir(), "core-native-controller-"));
      t.after(() => rm(root, { recursive: true, force: true }));
      const extension = join(root, "extension");
      if (deployment === "native") {
        await cp(
          "packages/browser-extension/dist/native-extension",
          extension,
          { recursive: true },
        );
      } else {
        const config = join(root, "deployment.json");
        await writeFile(
          config,
          JSON.stringify({
            channel: "dev",
            nativeHosts: ["com.core.cua"],
            sidePanelEnabled: true,
            features: { sdkKey: "fixture", api: "https://feature.invalid" },
            telemetryDsn: "",
            siteStatusUrl: "https://chatgpt.com/backend-api/aura/site_status",
            defaultAllowedPages: [],
          }),
        );
        execFileSync(
          process.execPath,
          ["scripts/build-full-extension.mjs", config, extension],
          { cwd: resolve("."), stdio: "pipe" },
        );
      }
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
      const hostRegistration=JSON.parse(await readFile(join(root,"profile","NativeMessagingHosts","com.core.cua.json"),"utf8"));
      const nativeConfig=JSON.parse(await readFile(join(dirname(hostRegistration.path),"config.json"),"utf8"));
      assert.equal(nativeConfig.runtime?.kind,"rust","The installed browser host must be native Rust");
      const clickedMarkers = new Set<string>();
      const actionMarker = `action-completed-marker-${randomUUID()}`;
      const pageServer = createServer((request, response) => {
        const incoming=new URL(request.url!, 'http://fixture.invalid');
        if (incoming.pathname==='/clicked' && request.method==='POST') {
          clickedMarkers.add(incoming.searchParams.get('marker') ?? '');
          response.writeHead(204);response.end();return;
        }
        response.setHeader("Content-Type", "text/html");
        response.end(
          request.url === "/next"
            ? `<title>Navigation target</title><h1>Navigation target</h1><button onclick="document.querySelector('p').textContent='${actionMarker}';fetch('/clicked?marker=${actionMarker}',{method:'POST'})">Run action</button><p>waiting</p>`
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
            ...(deployment === "full" &&
            process.env.CUA_LIVE_BAIDU_TEST !== "1" &&
            process.env.CUA_LIVE_SEARCH_TEST !== "1" &&
            process.env.CUA_BROWSER_BAIDU_PROBE !== "1"
              ? [
                  "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
                ]
              : []),
          ],
        },
      );
      let launchedEndpointFile: string | undefined;
      try {
        const page = await context.newPage();
        await page.goto(pageUrl);
        const worker =
          context.serviceWorkers()[0] ??
          (await context.waitForEvent("serviceworker"));
        assert.equal(
          await worker.evaluate(() => chrome.runtime.id),
          extensionId,
        );
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
        launchedEndpointFile = endpointFile;
        // Exercise Chrome's actual Native Messaging framing/control path, not
        // the Unix browser RPC client. One owned port keeps status and hello in
        // the same host process; disconnect closes only that test-owned port.
        // A string keeps the tsx/esbuild __name helper out of the worker realm.
        const controls = await worker.evaluate(`(async () => {
          const port = chrome.runtime.connectNative("com.core.cua");
          try {
            const responses = [];
            for (const [id, method] of [["hello", "codexRuntime/hello"], ["status", "codexRuntime/status"]]) {
              const response = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => { cleanup(); reject(Error("native control timeout")); }, 10000);
                const onMessage = (value) => {
                  if (value.id !== id) return;
                  cleanup(); resolve(value);
                };
                const onDisconnect = () => {
                  const error = chrome.runtime.lastError?.message;
                  cleanup(); reject(Error(error ?? "native control disconnected"));
                };
                function cleanup() {
                  clearTimeout(timer);
                  port.onMessage.removeListener(onMessage);
                  port.onDisconnect.removeListener(onDisconnect);
                }
                port.onMessage.addListener(onMessage);
                port.onDisconnect.addListener(onDisconnect);
                port.postMessage({ jsonrpc: "2.0", id, method });
              });
              responses.push(response);
            }
            return responses;
          } finally { port.disconnect(); }
        })()`);
        assert.deepEqual(controls, [
          { jsonrpc: "2.0", id: "hello", result: {
            manifestSchemaVersion: 2, nativeHostProtocolVersion: 2,
            nativeHostVersion: "0.1.0",
            supportedMethods: ["codexRuntime/openLocalFile"], supportedProtocolVersions: [2],
          } },
          { jsonrpc: "2.0", id: "status", result: { phase: "idle" } },
        ]);
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
          // First mention query installs the original lazy invalidation observers.
          await peer.sendRequest("getUserTabs", {
            query: "",
            limit: 10,
            includeFavicons: false,
          });
          let received!: () => void;
          const invalidated = new Promise<void>((resolve) => {
            received = resolve;
          });
          peer.addEventListener("onBrowserTabMentionsInvalidated", received);
          await page.evaluate(() => {
            document.title = "Updated native tab";
          });
          let deadline: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              invalidated,
              new Promise((_, reject) => {
                deadline = setTimeout(
                  () =>
                    reject(
                      Error("Real tab change did not notify native client"),
                    ),
                  5000,
                );
              }),
            ]);
          } finally {
            clearTimeout(deadline);
            peer.removeEventListener(
              "onBrowserTabMentionsInvalidated",
              received,
            );
          }
          const updated = await peer.sendRequest("getUserTabs", {
            query: "Updated native tab",
            limit: 10,
            includeFavicons: false,
          });
          assert.ok(
            updated.some(
              (item: any) =>
                item.id === tab.id && item.title === "Updated native tab",
            ),
          );
          await page.evaluate(() => {
            document.title = "Core native page";
          });
          // Real isolated-world runtime messages retain Chrome-generated sender identity.
          const candidate = await context.newPage();
          try {
            await candidate.goto(pageUrl + "mentions");
            const [channels] = await worker.evaluate(`(async (senderTabId) => {
            return chrome.scripting.executeScript({
              target: { tabId: senderTabId },
              func: async () => {
                const request = {
                  type: "search_browser_tab_mentions",
                  query: "Core native page",
                  limit: 10,
                };
                const single = await chrome.runtime.sendMessage(request);
                const portReply = await new Promise((resolve, reject) => {
                  const port = chrome.runtime.connect({
                    name: "search_browser_tab_mentions",
                  });
                  const timer = setTimeout(() => {
                    port.disconnect();
                    reject(Error("Mention port timed out"));
                  }, 5000);
                  port.onMessage.addListener((value) => {
                    clearTimeout(timer);
                    port.disconnect();
                    resolve(value);
                  });
                  port.postMessage(request);
                });
                return { single, portReply };
              },
            });
          })(${tab.id})`);
            for (const reply of [
              channels.result.single,
              channels.result.portReply,
            ]) {
              assert.equal(reply.ok, true);
              assert.ok(
                reply.candidates.some(
                  (item: any) => item.url === pageUrl + "mentions",
                ),
              );
              assert.ok(
                reply.candidates.every((item: any) => item.id !== tab.id),
                "Mention results must exclude their sender tab",
              );
            }
          } finally {
            await candidate.close();
          }
          const captured = await peer.sendRequest("getTabContext", {
            session_id: "native-live",
            turn_id: "read-1",
            tabId: tab.id,
          });
          assert.equal(captured.url, pageUrl);
          assert.equal(captured.title, "Core native page");
          assert.match(captured.text, /native-roundtrip-marker/);
          assert.equal(captured.truncated, false);
          // A claimed user tab retains its original group; only agent-created
          // tabs are grouped by the original BrowserSession contract.
          const priorGroup = await worker.evaluate((id) => chrome.tabs.get(id).then(t => t.groupId), Number(tab.id));
          await peer.sendRequest("claimUserTab", {
            session_id: "native-live", turn_id: "read-1", tabId: Number(tab.id),
          });
          assert.equal(await worker.evaluate((id) => chrome.tabs.get(id).then(t => t.groupId), Number(tab.id)), priorGroup);
          await page.bringToFront();
          await peer.sendRequest("moveMouse", {
            session_id: "native-live", turn_id: "read-1", tabId: Number(tab.id),
            x: 140, y: 100, waitForArrival: false,
          });
          // Read the extension's isolated world and closed overlay shadow root.
          // No debug endpoint or test hook is added to the shipped extension.
          const observeCursor = async () => {
            const [observation] = await worker.evaluate(`chrome.scripting.executeScript({
              target: { tabId: ${Number(tab.id)} }, func: async () => {
                const response = await chrome.runtime.sendMessage({type: "GET_AGENT_CURSOR_STATE"});
                const root = document.getElementById("codex-agent-overlay-root");
                const shadow = root && chrome.dom.openOrClosedShadowRoot(root);
                const image = shadow && shadow.querySelector("[data-browser-agent-cursor-asset]");
                const box = image && image.getBoundingClientRect();
                let opacity = 1;
                for (let node = image; node; node = node.parentElement) {
                  const style = getComputedStyle(node);
                  opacity *= Number(style.opacity);
                  if (style.display === "none" || style.visibility === "hidden") opacity = 0;
                }
                return {state: response.state, loaded: !!image && image.complete && image.naturalWidth > 0,
                  painted: !!box && box.width > 0 && box.height > 0 && opacity > 0.9,
                  hidden: !image || opacity < 0.01};
              }
            })`);
            return observation.result;
          };
          const waitCursor = async (visible: boolean, ended = false) => {
            for (let attempt = 0; attempt < 50; attempt++) {
              const view = await observeCursor();
              if (visible
                ? view.state?.isVisible === true && view.state.cursor?.visible === true && view.loaded && view.painted
                : view.state?.isVisible === false && view.hidden && (!ended || view.state.sessionId === null)) return;
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            assert.fail(`Cursor did not become ${visible ? "visible" : "hidden"}${ended ? " after turn cleanup" : ""}`);
          };
          await waitCursor(true);
          const otherTab = await context.newPage();
          try {
            await otherTab.goto(pageUrl + "inactive-cursor-check");
            await otherTab.bringToFront();
            await waitCursor(false);
            await page.bringToFront();
            await waitCursor(true);
          } finally { await otherTab.close(); }
          await peer.sendRequest("nameSession", {
            session_id: "native-live", turn_id: "read-1", name: "Core visual acceptance",
          });
          const created = await peer.sendRequest("createTab", {
            session_id: "native-live",
            turn_id: "read-1",
          });
          assert.ok(Number.isInteger(created.id));
          assert.notEqual(created.id, tab.id);
          const group = await worker.evaluate(async (id) => {
            const current = await chrome.tabs.get(id);
            return current.groupId >= 0 ? chrome.tabGroups.get(current.groupId) : null;
          }, created.id);
          assert.equal(group?.title, "Core visual acceptance", "Agent-created tab must have its named Chrome group");
          await peer.sendRequest("markTab", {
            session_id: "native-live", turn_id: "read-1", tabId: created.id, status: "deliverable",
          });
          const disposable = await peer.sendRequest("createTab", {
            session_id: "native-live", turn_id: "read-1",
          });


          await peer.sendRequest("turnEnded", {
            session_id: "native-live",
            turn_id: "read-1",
          });
          await page.bringToFront();
          await waitCursor(false, true);
          const remaining = await worker.evaluate(() => chrome.tabs.query({}));
          assert(!remaining.some(t => t.id === disposable.id), "Unmarked agent tab closes at turn end");
          assert.equal(remaining.find(t => t.id === created.id)?.groupId, -1, "Deliverable survives but leaves managed group");
          assert.equal(remaining.find(t => t.id === Number(tab.id))?.groupId, priorGroup, "User tab and its grouping survive cleanup");
        } finally {
          await transport.close();
        }
        await verifyIndependentMcpBrowser(
          endpointFile!,
          pageUrl,
          hostDirectory,
          "chrome",
          process.env.CUA_LIVE_DEEPSEEK_TEST === "1" && process.env.CUA_LIVE_BAIDU_TEST !== "1" && process.env.CUA_LIVE_SEARCH_TEST !== "1"
            ? {question:`使用 Chrome 访问 ${pageUrl}next，点击 Run action 按钮，告诉我点击后页面中段落的完整文字。请实际操作并读取结果。`,expectedAnswer:new RegExp(actionMarker)} : undefined,
          process.env.CUA_LIVE_BAIDU_TEST !== "1" && process.env.CUA_LIVE_SEARCH_TEST !== "1" && process.env.CUA_BROWSER_BAIDU_PROBE !== "1" ? async () => {
            // Independent HTTP evidence survives tabs created outside Playwright's page inventory.
            for(let attempt=0;attempt<100 && !clickedMarkers.has(actionMarker);attempt++) await new Promise(resolve=>setTimeout(resolve,10));
            assert.ok(clickedMarkers.has(actionMarker),'Fixture server must observe the actual random button action');
            // The fixed MCP scenario has not ended its turn yet. Prove that the
            // public locator click itself reaches BrowserUi/extension overlay;
            // do not call moveMouse or inject cursor state in this assertion.
            if (process.env.CUA_LIVE_DEEPSEEK_TEST !== "1") {
              const actionTabs = await worker.evaluate((url) => chrome.tabs.query({}).then(tabs => tabs.filter(t => t.url === url)), pageUrl + "next");
              assert.equal(actionTabs.length, 1);
              const actionTabId = actionTabs[0].id!;
              await worker.evaluate((id) => chrome.tabs.update(id, {active: true}), actionTabId);
              let clickCursorVerified = false;
              for (let attempt = 0; attempt < 50; attempt++) {
                const [view] = await worker.evaluate(`chrome.scripting.executeScript({
                  target: {tabId: ${actionTabId}}, func: async () => {
                    const {state} = await chrome.runtime.sendMessage({type: "GET_AGENT_CURSOR_STATE"});
                    const root = document.getElementById("codex-agent-overlay-root");
                    const shadow = root && chrome.dom.openOrClosedShadowRoot(root);
                    const img = shadow && shadow.querySelector("[data-browser-agent-cursor-asset]");
                    let opacity = 1;
                    for (let node = img; node; node = node.parentElement) {
                      const style = getComputedStyle(node);
                      opacity *= Number(style.opacity);
                      if (style.display === "none" || style.visibility === "hidden") opacity = 0;
                    }
                    const rect = document.querySelector("button").getBoundingClientRect();
                    const cursor = state?.cursor;
                    return {session: state?.sessionId, visible: state?.isVisible && cursor?.visible,
                      loaded: !!img && img.complete && img.naturalWidth > 0, opacity,
                      atButton: cursor && cursor.x >= rect.left && cursor.x <= rect.right && cursor.y >= rect.top && cursor.y <= rect.bottom};
                  }
                })`);
                clickCursorVerified = view.result?.session === "mcp-browser-live" && view.result.visible &&
                  view.result.loaded && view.result.opacity > 0.9 && view.result.atButton;
                if (clickCursorVerified) break;
                await new Promise(resolve => setTimeout(resolve, 100));
              }
              assert(clickCursorVerified, "MCP locator click must publish a rendered Agent cursor at the clicked button");
            }

          } : undefined,
        );
      } catch (error) {
        if (process.env.CUA_LIVE_BAIDU_TEST === "1") {
          // Preserve observed public-page evidence before deleting the temporary
          // profile. Never collect endpoint descriptors or model credentials.
          const artifacts = await mkdtemp(
            join(tmpdir(), "core-baidu-failure-"),
          );
          const observations: unknown[] = [];
          for (const [index, candidate] of context.pages().entries()) {
            const url = candidate.url();
            if (!/^https:\/\/(?:[a-z0-9-]+\.)?baidu\.com(?:\/|$)/i.test(url))
              continue;
            const screenshot = join(artifacts, `page-${index}.png`);
            const observed = await Promise.allSettled([
              candidate.title(),
              candidate.locator("body").innerText({ timeout: 5000 }),
              candidate.screenshot({ path: screenshot, timeout: 5000 }),
            ]);
            observations.push({
              url,
              title:
                observed[0].status === "fulfilled" ? observed[0].value : null,
              text:
                observed[1].status === "fulfilled"
                  ? observed[1].value.slice(0, 10000)
                  : null,
              screenshot:
                observed[2].status === "fulfilled" ? screenshot : null,
            });
          }
          await writeFile(
            join(artifacts, "observations.json"),
            JSON.stringify(observations, null, 2),
          );
          console.error("BAIDU FAILURE EVIDENCE", JSON.stringify(observations));
        }
        throw error;
      } finally {
        await context.close();
      }
      // Closing the owned browser must terminate the registered native host,
      // not leave a discoverable descriptor pointing at a dead socket.
      assert.ok(launchedEndpointFile);
      const lifecyclePath = join(dirname(hostRegistration.path), "lifecycle.jsonl");
      let terminalEvent: string | undefined;
      let remainingEndpoints: string[] = [];
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          remainingEndpoints = await discoverEndpointFiles(hostDirectory);
        } catch (error) {
          if (!(error instanceof IndependentBrowserUnavailableError) ||
              error.reason !== "no_endpoints") throw error;
          remainingEndpoints = [];
        }
        const events = (await readFile(lifecyclePath, "utf8"))
          .trim().split("\n").map((line) => JSON.parse(line));
        terminalEvent = events.at(-1)?.event;
        if (!remainingEndpoints.includes(launchedEndpointFile) &&
            terminalEvent === "input-ended") break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.ok(!remainingEndpoints.includes(launchedEndpointFile),
        "Closing the owned browser must remove its native endpoint");
      assert.equal(terminalEvent, "input-ended",
        "Chrome Native Messaging EOF must reach native lifecycle cleanup");
    },
  );
