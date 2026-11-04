import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

test(
  "full deployment bundle loads its actual background and sidebar in isolated Chromium",
  { timeout: 60000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "core-full-package-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const config = join(directory, "deployment.json"),
      extension = join(directory, "extension");
    await writeFile(
      config,
      JSON.stringify({
        channel: "dev",
        nativeHosts: ["com.core.nonexistent_test_fixture"],
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
    const manifest = JSON.parse(
      await readFile(join(extension, "manifest.json"), "utf8"),
    );
    assert.equal(manifest.name, "Core CUA Full");
    assert.equal(manifest.update_url, undefined);
    assert.equal(manifest.side_panel.default_path, "codex-work-sidepanel.html");
    assert.match(
      manifest.content_security_policy.extension_pages,
      /https:\/\/feature.invalid/,
    );
    assert.match(
      manifest.content_security_policy.sandbox,
      /connect-src 'none'/,
    );
    const paths = [
      manifest.background.service_worker,
      manifest.side_panel.default_path,
      ...manifest.sandbox.pages,
      ...manifest.content_scripts.flatMap((item: any) => item.js),
      ...Object.values(manifest.icons),
      ...manifest.web_accessible_resources.flatMap(
        (item: any) => item.resources,
      ),
    ];
    for (const path of paths) await access(join(extension, path as string));
    for (const html of [
      "codex-work-sidepanel.html",
      "microphone-permission.html",
    ]) {
      const text = await readFile(join(extension, html), "utf8");
      for (const match of text.matchAll(/(?:src|href)="\/(.*?)"/g))
        await access(join(extension, match[1]));
    }
    const context = await chromium.launchPersistentContext(
      join(directory, "profile"),
      {
        channel: "chromium",
        headless: true,
        offline: true,
        args: [
          `--disable-extensions-except=${extension}`,
          `--load-extension=${extension}`,
          "--host-resolver-rules=MAP * ~NOTFOUND",
        ],
      },
    );
    t.after(() => context.close());
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const alarm = await worker.evaluate(async () => {
      for (let n = 0; n < 100; n++) {
        const alarm = await chrome.alarms.get("client-heartbeat-alarm");
        if (alarm) return alarm;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    });
    assert.equal(alarm?.periodInMinutes, 0.5);
    const page = await context.newPage();
    await page.goto(
      `chrome-extension://${new URL(worker.url()).hostname}/codex-work-sidepanel.html`,
    );
    const frame = page.locator("#work-sidepanel-frame-container iframe");
    await frame.waitFor();
    assert.equal(
      await frame.getAttribute("src"),
      "https://chatgpt.com/?surface=browser_side_chat",
    );
    const instance = await page.evaluate(() =>
      chrome.runtime.sendMessage({ type: "GET_EXTENSION_INSTANCE_ID" }),
    );
    assert.equal(typeof instance.instanceId, "string");
    assert.ok(instance.instanceId.length > 0);
    const offscreen = await worker.evaluate(() =>
      chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] }),
    );
    assert.equal(offscreen.length, 0);
  },
);
