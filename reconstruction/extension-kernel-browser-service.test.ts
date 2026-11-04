import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";
import { kernelDocumentation } from "../packages/browser-extension/src/kernel_documentation";

test("extension service factory runs packaged documentation and inventory in Chromium without Node host", async () => {
  const bundle = await build({ entryPoints: ["packages/browser-extension/src/kernel_browser_service.ts"], bundle: true, platform: "browser", format: "esm", write: false });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    // tsx preserves function names with this helper when serializing the test callback.
    await page.addScriptTag({ content: "globalThis.__name = (value) => value;" });
    const result = await page.evaluate(async source => {
      const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      try {
        const { createKernelBrowserServiceFactory } = await import(url);
        const factory = createKernelBrowserServiceFactory();
        let hooks = 0, disposed = 0, refreshed = 0, reads = 0;
        const host = {
          env: { BROWSER_USE_DISABLE_AMBIENT_NETWORK: "1" }, platform: "darwin", config: {}, requestMeta: {},
          errorReporter: { captureException() {}, setUser() {}, setTag() {} },
          commandTiming: {},
          performanceSpan: { withSpan: (_n: unknown, _a: unknown, run: () => unknown) => run(), withCommandTelemetry: (_n: unknown, _a: unknown, run: () => unknown) => run() },
          filesystem: { readFile() { reads++; throw Error("Unexpected filesystem documentation read"); } },
          addAfterSubmittedCodeHook() { hooks++; },
          browserContext: { async refresh() { refreshed++; }, async list() { return []; }, async dispose() { disposed++; } },
        };
        const first = await factory.createBrowserService(host);
        const inventory = await first.executeAgentCommand({ type: "list_browsers" });
        const second = await factory.createBrowserService(host);
        await factory.dispose();
        return { inventory, hooks, disposed, refreshed, reads, apiManifest: second.apiManifest, disabled: [...second.disabledMemberIds] };
      } finally { URL.revokeObjectURL(url); }
    }, bundle.outputFiles[0].text);
    assert.deepEqual(result.inventory, []);
    assert.equal(result.reads, 0);
    assert.equal(result.hooks, 2); // Shared recorder and notification hooks; neither repeats.
    assert.equal(result.disposed, 2);
    assert.equal(result.refreshed, 1);
    assert.deepEqual(result.apiManifest, kernelDocumentation.default!.apiManifest);
  } finally { await browser.close(); }
});
