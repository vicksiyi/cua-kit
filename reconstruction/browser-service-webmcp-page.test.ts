import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { serviceExpression } from "./service-source";
import { webMcpPageScript } from "../packages/browser/src/service/webmcp/page";
const originalScript = new Function(
  "return (" + serviceExpression("xv") + ")",
)();
async function run(source: boolean, mode: string) {
  const trace: any[] = [];
  const window = {};
  let sequence = 0,
    listener: () => void = () => {},
    calls = 0;
  const location = { href: "https://fixture.test/frame" };
  const tool: any = {
    name: "fixture",
    title: "Title",
    description: "Description",
    inputSchema: '{"type":"object"}',
    annotations: { readOnlyHint: true },
    origin: "https://fixture.test",
    window,
  };
  const model: any = {
    async getTools() {
      calls++;
      trace.push(["getTools", calls]);
      if (mode === "read-denied") throw { name: "NotAllowedError" };
      if (mode === "read-error") throw Error("read failed");
      if (mode === "change-during-read") listener();
      if (mode === "navigate-during-read")
        location.href = "https://changed.test/";
      return mode === "removed" && calls > 1
        ? []
        : [
            tool,
            { ...tool, name: "foreign", window: {} },
            { ...tool, name: "opaque", origin: "null" },
          ];
    },
    addEventListener(type: string, fn: () => void) {
      trace.push(["listen", type]);
      listener = fn;
    },
  };
  const execute = function (this: any, _tool: any) {
    const args = arguments;
    trace.push([
      "execute",
      args[0].name,
      args[1],
      args[2] == null ? null : { signal: true },
    ]);
    return Promise.resolve({ content: "done" });
  };
  const executeTwo = function (this: any, _tool: any, _input: any) {
    return execute.apply(this, arguments as any);
  };
  model.executeTool =
    mode === "arity-two"
      ? executeTwo
      : mode === "arity-zero"
        ? () => {}
        : execute;
  if (mode === "invalid-schema") tool.inputSchema = "{";
  const host: any = {
    style: {
      setProperty(...args: any[]) {
        trace.push(["style", ...args]);
      },
    },
    attachShadow(options: any) {
      trace.push(["shadow", options]);
      return {
        append() {
          trace.push("append-frame");
        },
      };
    },
    remove() {
      trace.push("remove-host");
    },
  };
  const probe = {
    async getTools() {
      trace.push("probe-tools");
      if (mode === "probe-denied") throw { name: "SecurityError" };
      if (mode === "probe-error") throw Error("probe failed");
      return [tool];
    },
  };
  const frame: any = {
    contentDocument:
      mode === "no-probe-document" ? null : { modelContext: probe },
  };
  const document: any = {
    modelContext: mode === "no-context" ? undefined : model,
    documentElement: {
      append() {
        trace.push("append-host");
      },
    },
    createElementNS(_ns: string, tag: string) {
      trace.push(["create", tag]);
      return tag === "div" ? host : frame;
    },
  };
  const globals: any = {
    window,
    document,
    location,
    origin: mode === "opaque" ? "null" : "https://fixture.test",
    crypto: { randomUUID: () => `id-${++sequence}` },
    AbortSignal: {
      timeout: (ms: number) => {
        trace.push(["timeout", ms]);
        return {};
      },
    },
  };
  const realm = vm.createContext(globals);
  vm.runInContext(source ? originalScript : webMcpPageScript(), realm);
  const api = realm.webMcp;
  const options = {
    frameUrl: mode === "wrong-url" ? "https://wrong.test/" : location.href,
    generation: 1,
    pageUrl: "https://top.test/",
    staleRegistrationError: "stale",
    useChromiumCrashWorkaround:
      mode.startsWith("probe") || mode === "no-probe-document",
  };
  try {
    const tools = await api.readTools(options);
    trace.push(["tools", tools]);
    if (tools.length === 0) return { trace };
    if (mode === "repeat") trace.push(["repeat", await api.readTools(options)]);
    if (mode === "descriptor-change") {
      tool.description = "Changed";
      trace.push(["changed", await api.readTools(options)]);
    }
    if (mode === "old-generation")
      await api.readTools({ ...options, generation: 0 });
    if (mode === "new-generation")
      await api.readTools({ ...options, generation: 2 });
    if (mode === "toolchange") listener();
    if (mode === "opaque-invoke") realm.origin = "null";
    const result = await api.invokeTool({
      registrationId: tools[0].registration_id,
      generation: 1,
      inputJson: mode === "invalid-input" ? "{" : '{"value":1}',
      timeoutMs: mode === "timeout" ? 250 : undefined,
      staleRegistrationError: "stale",
    });
    return { trace, result };
  } catch (e) {
    return { trace, error: (e as Error).message ?? (e as any).name };
  }
}
test("WebMCP page registry and invocation match original generations, descriptor identity and native signatures", async () => {
  for (const mode of [
    "normal",
    "repeat",
    "descriptor-change",
    "old-generation",
    "new-generation",
    "toolchange",
    "removed",
    "opaque",
    "opaque-invoke",
    "no-context",
    "wrong-url",
    "read-denied",
    "read-error",
    "change-during-read",
    "navigate-during-read",
    "invalid-schema",
    "invalid-input",
    "arity-two",
    "arity-zero",
    "timeout",
    "probe-normal",
    "probe-denied",
    "probe-error",
    "no-probe-document",
  ]) {
    const normalize = (value: any) => JSON.parse(JSON.stringify(value));
    assert.deepEqual(
      normalize(await run(false, mode)),
      normalize(await run(true, mode)),
      mode,
    );
  }
  assert.equal((await run(false, "toolchange")).error, "stale");
  assert.equal(
    (await run(false, "arity-zero")).error,
    "Unsupported native WebMCP executeTool signature.",
  );
  assert.equal(
    (await run(false, "arity-two")).trace.find((x) => x[0] === "execute")[2],
    '{"value":1}',
  );
  assert.equal(
    (await run(false, "normal")).trace.find((x) => x[0] === "tools")[1].length,
    1,
  );
  assert.ok((await run(false, "probe-error")).trace.includes("remove-host"));
});
test("serialized WebMCP runtime registers and invokes a fixture native tool inside Chromium", async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("https://fixture.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<button id="result">Before</button>',
      }),
    );
    await page.goto("https://fixture.test/");
    await page.evaluate(() => {
      const tool = {
        name: "setLabel",
        origin: location.origin,
        window,
        inputSchema: { type: "object" },
      };
      const context = {
        async getTools() {
          return [tool];
        },
        addEventListener(_type: string, fn: () => void) {
          (globalThis as any).changeTools = fn;
        },
        async executeTool(_tool: unknown) {
          const input = arguments[1];
          document.querySelector("#result")!.textContent = input.label;
          return { content: "updated" };
        },
      };
      Object.defineProperty(document, "modelContext", {
        value: context,
        configurable: true,
      });
    });
    await page.addScriptTag({ content: webMcpPageScript() });
    const tools: any = await page.evaluate(() =>
      (globalThis as any).webMcp.readTools({
        frameUrl: location.href,
        pageUrl: location.href,
        generation: 1,
        staleRegistrationError: "stale",
        useChromiumCrashWorkaround: false,
      }),
    );
    assert.equal(tools.length, 1);
    const result = await page.evaluate(
      async (id: string) =>
        (globalThis as any).webMcp.invokeTool({
          registrationId: id,
          generation: 1,
          inputJson: '{"label":"After"}',
          timeoutMs: 1000,
          staleRegistrationError: "stale",
        }),
      tools[0].registration_id,
    );
    assert.deepEqual(result, { content: "updated" });
    assert.equal(await page.locator("#result").textContent(), "After");
    await page.evaluate(() => (globalThis as any).changeTools());
    await assert.rejects(
      page.evaluate(
        async (id: string) =>
          (globalThis as any).webMcp.invokeTool({
            registrationId: id,
            generation: 1,
            inputJson: "{}",
            staleRegistrationError: "stale",
          }),
        tools[0].registration_id,
      ),
      /stale/,
    );
  } finally {
    await browser.close();
  }
});

test("WebMCP script preserves bundled export descriptors", () => {
  const shapes = [originalScript, webMcpPageScript()].map((script) => {
    const realm = vm.createContext({});
    vm.runInContext(script, realm);
    return Object.fromEntries(
      Object.entries(Object.getOwnPropertyDescriptors(realm.webMcp)).map(
        ([key, value]) => [
          key,
          {
            enumerable: value.enumerable,
            configurable: value.configurable,
            writable: value.writable,
            getter: typeof value.get,
            value: value.value,
          },
        ],
      ),
    );
  });
  assert.deepEqual(shapes[1], shapes[0]);
});
