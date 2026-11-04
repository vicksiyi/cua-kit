import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { desktopDocumentation } from "../packages/browser-desktop/src/documentation_bundle";
import * as desktop from "@core/browser-desktop";
import * as service from "@core/browser-desktop/service";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const scope = (text: string) => text.replaceAll("@oai/", "@core/");
test("desktop package includes every original environment manifest and document", async () => {
  assert.deepEqual(Object.keys(desktopDocumentation.environments!).sort(), [
    "cloud",
    "codex-app",
    "orbit",
    "training",
  ]);
  for (const [environment, bundle] of Object.entries(
    desktopDocumentation.environments!,
  )) {
    const directory = `${root}/browser-desktop/environment-docs/${environment}`;
    assert.deepEqual(
      bundle.apiManifest,
      JSON.parse(scope(await readFile(`${directory}/api.json`, "utf8"))),
    );
    assert.deepEqual(
      bundle.documentManifest,
      JSON.parse(scope(await readFile(`${directory}/documents.json`, "utf8"))),
    );
    const docs = (await readdir(directory, { recursive: true })).filter(
      (path) => path.endsWith(".md"),
    );
    assert.deepEqual(
      Object.keys(bundle.documentation).sort(),
      docs.map((path) => path.slice(0, -3)).sort(),
    );
    for (const path of docs)
      assert.equal(
        bundle.documentation[path.slice(0, -3)],
        scope(await readFile(`${directory}/${path}`, "utf8")),
        environment + "/" + path,
      );
  }
});
async function clientScenario(
  setup: any,
  version: number,
  environment?: string,
) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "nodeRepl");
  const calls: any[] = [];
  const host = {
    env: { CUA_REPL_BROWSER_ENV: environment },
    emitImage() {
      throw Error("unexpected display");
    },
    async rpc(this: any, name: string, request: any) {
      calls.push([name, request, this === undefined]);
      if (request.method === "setup")
        return {
          apiManifest: desktopDocumentation.default!.apiManifest,
          disabledMemberIds: ["Tab.close"],
          credentialRecoveryErrorVersion: version,
        };
      const type = request.params.type;
      const value =
        type === "get_browser"
          ? { id: "b", type: "chrome", capabilities: { tab: [] } }
          : type === "get_tab"
            ? { id: "7" }
            : type === "tab_screenshot"
              ? { data: "AAH/" }
              : {};
      return request.method === "executeWithRecovery"
        ? { ok: true, value }
        : value;
    },
  };
  try {
    Object.defineProperty(globalThis, "nodeRepl", {
      configurable: true,
      value: host,
    });
    const agent = await setup({
      environment: "cloud",
      decorateTab(tab: any) {
        tab.fixtureDecoration = true;
      },
    });
    const browser = await agent.browsers.get("b"),
      tab = await browser.tabs.get("7");
    await tab.cua.click({ x: 3, y: 5 });
    await tab.playwright.getByLabel("Fixture").fill("synthetic");
    return {
      calls,
      result: {
        id: tab.id,
        decorated: tab.fixtureDecoration,
        close: typeof tab.close,
        screenshot: [...(await tab.screenshot())],
      },
    };
  } finally {
    if (previous) Object.defineProperty(globalThis, "nodeRepl", previous);
    else Reflect.deleteProperty(globalThis, "nodeRepl");
  }
}
test("desktop root public client agrees with the installed desktop package", async () => {
  const original = await import(
    pathToFileURL(`${root}/browser-desktop/scripts/browser-client.mjs`).href
  );
  assert.deepEqual(Object.keys(desktop), Object.keys(original));
  for (const version of [0, 1])
    for (const env of [undefined, "orbit"])
      assert.deepEqual(
        await clientScenario(desktop.setupBrowserRuntime, version, env),
        await clientScenario(original.setupBrowserRuntime, version, env),
      );
});
test("actual trusted-service package exports initialize all four environments using default assembly", async () => {
  assert.deepEqual(Object.keys(service).sort(), ["classifyError", "handleRpc"]);
  assert.equal(service.classifyError(new Error("ordinary")), "browser_error");
  assert.equal(
    service.classifyError(
      new Error('Timed out running CDP command "Page.fixture"'),
    ),
    "cdp_timeout",
  );
  await assert.rejects(
    service.handleRpc({ method: "execute", params: {} }),
    /not been initialized/,
  );
  await assert.rejects(
    service.handleRpc({ method: "constructor", params: {} }),
    /Unsupported browser service request/,
  );
  await assert.rejects(
    service.handleRpc({ method: "setup", params: { environment: "invalid" } }),
    /Invalid browser service environment/,
  );
  const prior = Object.getOwnPropertyDescriptor(globalThis, "nodeRepl"),
    events: any[] = [];
  const unused = () => {
    throw Error("setup must not use a browser, network or user approval");
  };
  try {
    Reflect.deleteProperty(globalThis, "nodeRepl");
    await assert.rejects(
      service.handleRpc({
        method: "setup",
        params: { environment: "codex-app" },
      }),
      /requires privileged Node REPL/,
    );
    const host: any = {
      cwd: "/synthetic",
      env: {
        BROWSER_USE_DISABLE_AMBIENT_NETWORK: "1",
        BROWSER_USE_DISABLE_API_MEMBERS: "Tab.close,Tab.ax",
      },
      createElicitation: unused,
      fetch: unused,
      nativePipe: { createConnection: unused },
      config: {
        read: async () => ({ config: {} }),
        readRequirements: async () => ({ requirements: {} }),
        readToml: async () => ({}),
        writeToml: unused,
      },
      addTurnEndedHandler() {
        events.push("register");
        return () => events.push("unregister");
      },
      addAfterSubmittedCodeHook(hook: any) {
        events.push(["hook", hook.timeoutMs]);
      },
      setResponseMeta: unused,
      emitContentItem: unused,
    };
    Object.defineProperty(globalThis, "nodeRepl", {
      configurable: true,
      value: host,
    });
    for (const environment of ["codex-app", "training", "cloud", "orbit"]) {
      const value = await service.handleRpc({
        method: "setup",
        params: { environment },
      });
      assert.deepEqual(
        value.apiManifest,
        desktopDocumentation.environments![environment].apiManifest,
      );
      assert.deepEqual(value.disabledMemberIds, ["Tab.close", "Tab.ax"]);
      assert.equal(value.credentialRecoveryErrorVersion, 1);
    }
    assert.equal(events.filter((event) => event === "register").length, 4);
    assert.equal(events.filter((event) => event === "unregister").length, 3);
    assert.deepEqual(
      events.filter((event) => Array.isArray(event) && event[0] === "hook"),
      [["hook", 10_000], ["hook", 12_000]],
    );
  } finally {
    if (prior) Object.defineProperty(globalThis, "nodeRepl", prior);
    else Reflect.deleteProperty(globalThis, "nodeRepl");
  }
});
