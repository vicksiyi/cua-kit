import { chromium } from "playwright";
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
  let allowFixtureOrigin = false;
  const priorRepl = Object.getOwnPropertyDescriptor(globalThis, "nodeRepl");
  const priorCua = Object.getOwnPropertyDescriptor(globalThis, "cua");
  const priorAgent = Object.getOwnPropertyDescriptor(globalThis, "agent");
  let tabUrl = "https://fixture.invalid/";
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let cdp: any;
  const peers: BrowserRpcPeer[] = [];
  const server = createServer((socket) => {
    const transport = new NativePipeTransport(socket, {
      decodeMessage: nativePipeMessage,
    });
    transports.push(transport);
    const rpc = new BrowserRpcPeer(transport);
    peers.push(rpc);
    rpc.registerRequestHandler("attach", () => ({}));
    rpc.registerRequestHandler("detach", () => ({}));
    rpc.registerRequestHandler("executeCdp", async (params: any) => {
      assert.equal(params.target.tabId, 8);
      assert.equal(params.target.sessionId, undefined);
      events.push(["cdp", params.method]);
      if (
        params.method === "Runtime.evaluate" &&
        params.commandParams?.expression?.includes(
          "window.__codexPlaywrightInjected = new",
        )
      )
        events.push(["playwright.inject"]);
      return cdp.send(params.method, params.commandParams);
    });
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
      async createElicitation(request: any) {
        assert.equal(request.meta.tool_name, "access_browser_origin");
        assert.equal(request.meta.origin, "https://fixture.invalid");
        events.push(["originApproval", allowFixtureOrigin]);
        return { action: allowFixtureOrigin ? "accept" : "decline" };
      },
      env: {
        CUA_REPL_ENABLED_SURFACES: "browser",
        BROWSER_USE_DISABLE_AMBIENT_NETWORK: "1",
        BROWSER_USE_ACCESSIBILITY_CORE_WASM_PATH: `${process.env.CUA_VENDOR_ROOT ?? "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai"}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-accessibility.wasm.br`,
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
        read: async () => ({ config: {} }),
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
    service = assembleBrowserService({
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
        reportDiscoveryFailure(_r, _d, reason) {
          events.push(["discoveryFailure", reason]);
        },
        loadClassicLevel: async () => null,
        getNativeCredentialObservationStatus: unused,
        createBrowserAuthBrokerChallenge: unused,
      },
      runtime: {
        context: {
          reportError: unused,
          reportEvent() {},
          createLocalizer: () => () => "fixture",
        },
        commands: {
          emitBotDetection: unused,
          webMcp: {
            isLocalRuntime: () => true,
            featureFlag: async () => false,
            config: () => ({}),
            emit: unused,
          },
          browserAuth: {
            reviewSafety: unused,
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
          emitEvent(_r: any, event: any, command: any, attrs: any) {
            events.push(["event", event, command, attrs]);
          },
        },
      },
    });
    Object.defineProperty(globalThis, "nodeRepl", {
      configurable: true,
      value: {
        ...repl,
        telemetry: {
          startSpan(name: string, attrs: any) {
            events.push(["span.start", name, attrs]);
            return {
              end(result: any) {
                events.push(["span.end", name, result]);
              },
            };
          },
        },
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
    await import("@core/cua/tinyskyAlt");
    const cua = (globalThis as any).cua;
    assert.equal(cua.initialize, cua.getState);
    assert.equal(cua.computer, undefined);
    assert.ok((globalThis as any).agent);
    assert.equal(events.filter((e) => e[0] === "getTabs").length, 0);
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
    assert(
      events.some(
        (e) =>
          e[0] === "event" &&
          e[1] === "browser_use_agent_command" &&
          e[3]?.outcome === "failure",
      ),
    );
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
    await import("@core/cua/tinyskyAlt");
    assert.equal((globalThis as any).cua, cua);
    const freshInventory = await cua.initialize({ emit: false });
    assert.equal(freshInventory.apps.length, 0);
    assert.ok(freshInventory.browsers.length > 0);
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
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.route("https://fixture.invalid/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<title>Public CUA fixture</title><button onclick="this.textContent='Clicked through CUA';this.dataset.clicks=String(Number(this.dataset.clicks||0)+1)">Public CUA action</button><label>Date<input id="fixture-date" type="date"></label><label>Message<input id="fixture-message"></label><div id="rich-editor" contenteditable="true"></div>`,
      }),
    );
    await page.goto("https://fixture.invalid/cua-integration");
    cdp = await page.context().newCDPSession(page);
    for (const method of [
      "Fetch.requestPaused",
      "Network.requestWillBeSent",
      "Network.responseReceived",
      "Network.loadingFinished",
      "Network.loadingFailed",
      "Page.frameNavigated",
      "Page.frameStartedLoading",
      "Page.frameStoppedLoading",
      "Page.lifecycleEvent",
      "Page.loadEventFired",
      "Page.domContentEventFired",
      "Page.screencastFrame",
      "Page.javascriptDialogOpening",
      "Page.javascriptDialogClosed",
      "Runtime.bindingCalled",
      "Runtime.executionContextCreated",
      "Runtime.executionContextDestroyed",
      "Runtime.executionContextsCleared",
      "DOM.documentUpdated",
    ]) {
      cdp.on(method, (params: any) => {
        for (const peer of peers)
          if (!peer.closed)
            peer.sendNotification("onCDPEvent", {
              source: { tabId: 8 },
              method,
              params,
            });
      });
    }
    tabUrl = page.url();
    await assert.rejects(cua.getTab("8", { browser: id }), {
      reason: "user_declined",
    });
    assert(events.some((e) => e[0] === "originApproval" && e[1] === false));
    assert(
      !events.some(
        (e) => e[0] === "cdp" && e[1] === "Accessibility.getFullAXTree",
      ),
    );
    allowFixtureOrigin = true;
    const pageTab = await cua.getTab("8", { browser: id });
    assert(events.some((e) => e[0] === "originApproval" && e[1] === true));
    const state = await pageTab.getAXState({
      emit: false,
      disableDiffing: true,
    });
    assert.match(state, /Public CUA action/);
    const button = state.match(/^\s*(\d+) button Public CUA action$/m);
    assert(button, "AX output must expose an actionable button index");
    await pageTab.click(Number(button[1]));
    assert.equal(
      await page.locator("button").textContent(),
      "Clicked through CUA",
    );
    const domBefore = await pageTab.playwright.domSnapshot();
    assert.match(domBefore, /Clicked through CUA/);
    await pageTab.playwright
      .getByRole("button", { name: "Clicked through CUA", exact: true })
      .click();
    assert.equal(await page.locator("button").getAttribute("data-clicks"), "2");
    await pageTab.playwright
      .getByLabel("Date", { exact: true })
      .fill("2026-11-04");
    assert.equal(
      await page.locator("#fixture-date").inputValue(),
      "2026-11-04",
    );
    await pageTab.playwright
      .getByLabel("Message", { exact: true })
      .fill("中文 😀 plain");
    assert.equal(
      await page.locator("#fixture-message").inputValue(),
      "中文 😀 plain",
    );
    await pageTab.playwright
      .locator("#rich-editor")
      .fill("**Bold** and *italic*");
    assert.equal(
      await page.locator("#rich-editor").textContent(),
      "**Bold** and *italic*",
    );
    await pageTab.playwright.locator("#rich-editor").fill("");
    await pageTab.cua.type({ text: "**Bold** and *italic*" });
    assert.equal(
      await page.locator("#rich-editor strong").textContent(),
      "Bold",
    );
    assert.equal(await page.locator("#rich-editor em").textContent(), "italic");
    const domAfter = await pageTab.playwright.domSnapshot();
    assert.match(domAfter, /2026-11-04/);
    const changed = await pageTab.getAXState({ emit: false });
    assert.match(changed, /Clicked through CUA/);
    const screenshot = await pageTab.getScreenshot({ emit: false });
    assert(screenshot instanceof Uint8Array);
    assert(screenshot.length > 100);
    assert.equal(
      Buffer.from(screenshot).subarray(0, 3).toString("hex"),
      "ffd8ff",
    );
    const dimensions = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/jpeg;base64,${base64}`;
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    }, Buffer.from(screenshot).toString("base64"));
    assert.deepEqual(dimensions, [1280, 720]);
    const combined = await pageTab.getAXStateAndScreenshot({
      emit: false,
      disableDiffing: true,
    });
    assert.match(combined.state, /Clicked through CUA/);
    assert(combined.screenshot instanceof Uint8Array);
    assert(
      events.some((e) => e[0] === "cdp" && e[1] === "Input.dispatchMouseEvent"),
    );
    assert(
      events.some((e) => e[0] === "cdp" && e[1] === "Page.startScreencast"),
    );
    assert.equal(
      events.filter((e) => e[0] === "cdp" && e[1] === "Page.startScreencast")
        .length,
      events.filter((e) => e[0] === "cdp" && e[1] === "Page.stopScreencast")
        .length,
    );
    assert(
      events.some(
        (e) => e[0] === "cdp" && e[1] === "Accessibility.getFullAXTree",
      ),
    );
    const injectionsBeforeNavigation = events.filter(
      (e) => e[0] === "playwright.inject",
    ).length;
    assert.ok(injectionsBeforeNavigation > 0);
    await page.goto("https://fixture.invalid/cua-next-document");
    tabUrl = page.url();
    assert.equal(
      await page.evaluate(
        () => typeof (window as any).__codexPlaywrightInjected,
      ),
      "undefined",
    );
    assert(
      events.some((e) => e[0] === "cdp" && e[1] === "Fetch.continueResponse"),
    );
    const afterNavigation = await pageTab.playwright.domSnapshot();
    assert.match(afterNavigation, /Public CUA action/);
    assert.ok(
      events.filter((e) => e[0] === "playwright.inject").length >
        injectionsBeforeNavigation,
    );
    await pageTab.playwright
      .getByRole("button", { name: "Public CUA action", exact: true })
      .click();
    assert.equal(await page.locator("button").getAttribute("data-clicks"), "1");
    assert(
      events.some(
        (e) =>
          e[0] === "event" &&
          e[1] === "browser_use_agent_command" &&
          e[3]?.outcome === "success",
      ),
    );
    assert(
      events.some(
        (e) => e[0] === "span.start" && e[1] === "browser_use.runtime.setup",
      ),
    );
    assert(
      events.some(
        (e) =>
          e[0] === "span.start" &&
          e[1] === "browser_use.tab.click" &&
          e[2]["browser_use.command.type"] === "playwright_locator_click",
      ),
    );
    assert(
      events.some(
        (e) =>
          e[0] === "span.end" &&
          e[1] === "browser_use.playwright.dom_snapshot" &&
          e[2].attrs["browser_use.playwright.snapshot.length"] > 0,
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
    for (const [name, descriptor] of [
      ["cua", priorCua],
      ["agent", priorAgent],
    ] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    if (priorRepl) Object.defineProperty(globalThis, "nodeRepl", priorRepl);
    else delete (globalThis as any).nodeRepl;
    await service?.dispose();
    await Promise.all(transports.map((t) => t.close()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await browser?.close();
    await rm(root, { recursive: true, force: true });
  }
});
