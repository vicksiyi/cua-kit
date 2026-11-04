import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

test(
  "native controller initializes original handler against actual extension Chrome APIs",
  { timeout: 30000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "core-native-controller-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const extension = join(root, "extension");
    await mkdir(extension);
    await writeFile(
      join(extension, "manifest.json"),
      JSON.stringify({
        manifest_version: 3,
        name: "Core controller integration",
        version: "1.0.0",
        permissions: [
          "tabs",
          "tabGroups",
          "storage",
          "debugger",
          "scripting",
          "webNavigation",
          "webRequest",
          "declarativeNetRequest",
          "alarms",
          "nativeMessaging",
          "history",
          "downloads",
        ],
        host_permissions: ["<all_urls>"],
        background: { service_worker: "background.js" },
      }),
    );
    await build({
      stdin: {
        contents: `
import {createNativeBrowserController} from './packages/browser-extension/src/native_browser_controller';
const diagnostics=[];
const controller=createNativeBrowserController({
  host:{chrome,crypto,now:Date.now,setTimeout,clearTimeout,error:(...args)=>diagnostics.push(args)},
  navigator:{userAgent:navigator.userAgent},hostName:'com.core.cua',
  sessionDiagnostics:{metric:(...args)=>diagnostics.push(args),warn:(...args)=>diagnostics.push(args)},
  handlerOptions:{buildChannel:'dev'},
});
globalThis.inspectController=async()=>({info:await controller.handler.getInfo({}),tabs:await controller.handler.getUserTabs({}),status:controller.transport.getStatus(),diagnostics});
`,
        resolveDir: resolve("."),
        loader: "ts",
      },
      bundle: true,
      platform: "browser",
      format: "iife",
      outfile: join(extension, "background.js"),
    });
    const context = await chromium.launchPersistentContext(
      join(root, "profile"),
      {
        channel: "chromium",
        headless: true,
        args: [
          `--disable-extensions-except=${extension}`,
          `--load-extension=${extension}`,
        ],
      },
    );
    try {
      const worker =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent("serviceworker"));
      const result = await worker.evaluate(
        async () => await (globalThis as any).inspectController(),
      );
      assert.equal(result.info.type, "extension");
      assert.equal(result.info.family, "chrome");
      assert.ok(Array.isArray(result.tabs));
      assert.equal(result.status.hostName, "com.core.cua");
      assert.ok(result.info.metadata.extensionId.length === 32);
    } finally {
      await context.close();
    }
  },
);
