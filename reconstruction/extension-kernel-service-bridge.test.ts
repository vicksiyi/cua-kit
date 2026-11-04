import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

test("default kernel bridge executes real service inventory through multiplexed MessageChannel RPC", async () => {
  const bundle = await build({ stdin: {
    contents: 'export { createKernelBrowserBridge } from "./packages/browser-extension/src/kernel_browser_bridge"; export { kernelBrowserService } from "./packages/browser-extension/src/kernel_browser_service";',
    resolveDir: process.cwd(), loader: "ts",
  }, bundle: true, platform: "browser", format: "esm", write: false });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: "globalThis.__name = (value) => value;" });
    const result = await page.evaluate(async source => {
      const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      const channel = new MessageChannel();
      try {
        const { createKernelBrowserBridge, kernelBrowserService } = await import(url);
        const requests: { type?: string; method: string }[] = [];
        let closed = 0;
        channel.port2.onmessage = ({ data }) => {
          if (!data.method) return;
          requests.push({ type: data.type, method: data.method });
          let result: unknown = null;
          if (data.method === "isBrowserElicitationEnabled") result = true;
          if (data.method === "getInfo") result = { type: "extension", family: "chrome", name: "Controlled backend", requestHeadersVersion: 1 };
          if (data.method === "readRequirements") result = {};
          channel.port2.postMessage({ id: data.id, ...(data.type ? { type: data.type } : {}), result });
        };
        const transport = {
          setMessageCallback(callback: (data: unknown) => void) { channel.port1.onmessage = event => callback(event.data); },
          sendMessage(message: unknown) { channel.port1.postMessage(message); },
          addCloseListener() { return () => {}; },
          async close() { closed++; },
        };
        const bridge = createKernelBrowserBridge(transport,
          { "x-codex-turn-metadata": { session_id: "fixture-session", turn_id: "fixture-turn" } },
          { platform: "darwin", locks: { request: async (_name: string, run: () => unknown) => run() } });
        const service = await bridge.browser;
        const inventory = await service.executeAgentCommand({ type: "list_browsers" });
        await bridge.displayBridge.displayValue("display fixture");
        await bridge.finishExecution();
        bridge.beginExecution({ "x-codex-turn-metadata": { session_id: "fixture-session", turn_id: "next" } });
        await service.executeAgentCommand({ type: "list_browsers" });
        await bridge.finishExecution();
        await kernelBrowserService.dispose();
        return { inventory, requests, closed };
      } finally { channel.port1.close(); channel.port2.close(); URL.revokeObjectURL(url); }
    }, bundle.outputFiles[0].text);
    assert.equal(result.inventory.length, 1);
    assert.equal(result.inventory[0].id, "0");
    assert.equal(result.inventory[0].name, "Controlled backend");
    assert.equal(result.requests.filter(r => r.method === "getInfo").length, 1);
    assert.ok(result.requests.some(r => r.method === "isBrowserElicitationEnabled"));
    assert.ok(result.requests.some(r => r.method === "displayValue"));
    assert.ok(result.requests.find(r => r.method === "isBrowserElicitationEnabled")!.type);
    assert.equal(result.closed, 1);
  } finally { await browser.close(); }
});
