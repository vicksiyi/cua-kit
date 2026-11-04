import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

test(
  "full restored background starts in real Chromium without auth or forced feature gates",
  { timeout: 60000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "core-full-background-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const extension = join(directory, "extension");
    await build({
      stdin: {
        contents: `
      import {createFullBrowserBackground} from './packages/browser-extension/src/full_background';
      globalThis.result = {requests: []};
      const app = createFullBrowserBackground({
        channel:'dev', nativeHosts:['com.core.nonexistent_test_fixture'], sidePanelEnabled:true,
        features:{sdkKey:'fixture',api:'https://features.invalid'}, telemetryDsn:'',
        siteStatusUrl:'https://chatgpt.com/backend-api/aura/site_status', defaultAllowedPages:[],
      }, {
        chrome, crypto, navigator, scope:globalThis,
        fetch:async (...args)=>{result.requests.push(String(args[0])); throw Error('fixture offline');},
        now:()=>Date.now(), monotonicNow:()=>performance.now(), random:()=>Math.random(),
        setTimeout:globalThis.setTimeout.bind(globalThis), clearTimeout:globalThis.clearTimeout.bind(globalThis),
        setInterval:globalThis.setInterval.bind(globalThis), clearInterval:globalThis.clearInterval.bind(globalThis),
        console,
      });
      app.start().then(()=>{result.started=true;},error=>{result.error=String(error);});
    `,
        resolveDir: resolve("."),
        loader: "ts",
      },
      outfile: join(extension, "background.js"),
      bundle: true,
      platform: "browser",
      format: "iife",
    });
    await writeFile(
      join(extension, "manifest.json"),
      JSON.stringify({
        manifest_version: 3,
        name: "Core full background fixture",
        version: "1.0.0",
        permissions: [
          "tabs",
          "tabGroups",
          "storage",
          "scripting",
          "debugger",
          "webNavigation",
          "webRequest",
          "declarativeNetRequest",
          "alarms",
          "nativeMessaging",
          "history",
          "downloads",
          "bookmarks",
          "sidePanel",
          "contextMenus",
          "cookies",
          "offscreen",
        ],
        host_permissions: ["<all_urls>"],
        action: {},
        commands: {
          "open-codex-side-panel": { description: "Open ChatGPT side panel" },
        },
        side_panel: { default_path: "probe.html" },
        background: { service_worker: "background.js" },
      }),
    );
    await writeFile(
      join(extension, "probe.html"),
      "<!doctype html><title>Probe</title>",
    );
    await writeFile(
      join(extension, "codex-work-sidepanel.html"),
      "<!doctype html><title>Authorized sidebar fixture</title>",
    );
    const context = await chromium.launchPersistentContext(
      join(directory, "profile"),
      {
        channel: "chromium",
        headless: true,
        args: [
          `--disable-extensions-except=${extension}`,
          `--load-extension=${extension}`,
        ],
      },
    );
    t.after(() => context.close());
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const outcome = await worker.evaluate(async () => {
      for (let n = 0; n < 100; n++) {
        const state = (globalThis as any).result;
        if (state?.started || state?.error) return state;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return (globalThis as any).result;
    });
    assert.equal(outcome.error, undefined);
    assert.equal(outcome.started, true);
    const page = await context.newPage();
    await page.goto(
      `chrome-extension://${new URL(worker.url()).hostname}/probe.html`,
    );
    const denied = await page.evaluate(() =>
      chrome.runtime.sendMessage({ type: "GET_EXTENSION_INSTANCE_ID" }),
    );
    assert.deepEqual(
      denied,
      { instanceId: null },
      "unrecognized extension page must be denied",
    );
    await page.goto(
      `chrome-extension://${new URL(worker.url()).hostname}/codex-work-sidepanel.html`,
    );
    const instance = await page.evaluate(() =>
      chrome.runtime.sendMessage({ type: "GET_EXTENSION_INSTANCE_ID" }),
    );
    assert.match(
      JSON.stringify(instance),
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    const state = await worker.evaluate(async () => ({
      alarm: await chrome.alarms.get("client-heartbeat-alarm"),
      contexts: await chrome.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
      }),
    }));
    assert.equal(state.alarm?.periodInMinutes, 0.5);
    assert.equal(
      state.contexts.length,
      0,
      "unauthenticated/offline setup must not create a kernel or bypass its gate",
    );
  },
);
