import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

test(
  "bundled page entries boot in Chromium with real DOM and fixture-only media",
  { timeout: 60000 },
  async (t) => {
    execFileSync(process.execPath, ["scripts/build-reconstructed-pages.mjs"], {
      cwd: resolve("."),
      stdio: "pipe",
    });
    const directory = await mkdtemp(join(tmpdir(), "core-pages-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const extension = join(directory, "extension");
    await cp(
      "packages/browser-extension/dist/pages",
      join(extension, "pages"),
      { recursive: true },
    );
    for (const file of [
      "codex-work-sidepanel.html",
      "microphone-permission.html",
    ]) {
      await cp(join(extension, "pages", file), join(extension, file));
    }
    await writeFile(
      join(extension, "manifest.json"),
      JSON.stringify({
        manifest_version: 3,
        name: "Core reconstructed pages fixture",
        version: "1.0.0",
        permissions: ["tabs", "storage", "scripting"],
        background: { service_worker: "background.js" },
      }),
    );
    await writeFile(
      join(extension, "background.js"),
      "chrome.runtime.onInstalled.addListener(() => {});",
    );
    // A same-extension script runs in the page's own world before its module.
    // Playwright init scripts may run in a different extension execution world.
    await writeFile(
      join(extension, "media-fixture.js"),
      `
      const state = window.__mediaFixture = { requests: [], stopped: 0 };
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async (constraints) => {
        state.requests.push(constraints);
        if (state.requests.length === 1) throw new Error("fixture denial");
        return { getTracks: () => [{ stop: () => { state.stopped++; } }] };
      } });
    `,
    );
    const mediaHtml = join(extension, "microphone-permission.html");
    await writeFile(
      mediaHtml,
      (await readFile(mediaHtml, "utf8")).replace(
        "<head>",
        '<head><script src="/media-fixture.js"></script>',
      ),
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
    await context.route(/^https?:/, (route) => route.abort());
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const origin = `chrome-extension://${new URL(worker.url()).hostname}`;
    const panel = await context.newPage();
    await panel.goto(`${origin}/codex-work-sidepanel.html`);
    const frame = panel.locator("#work-sidepanel-frame-container iframe");
    await frame.waitFor();
    assert.equal(
      await frame.getAttribute("src"),
      "https://chatgpt.com/?surface=browser_side_chat",
    );
    assert.match((await frame.getAttribute("sandbox"))!, /allow-scripts/);
    assert.match(
      (await frame.getAttribute("allow"))!,
      /microphone https:\/\/chatgpt.com/,
    );
    assert.ok(
      await panel.evaluate(() =>
        [...document.styleSheets].some((sheet) =>
          sheet.href?.includes("codex-work-sidepanel"),
        ),
      ),
    );

    const media = await context.newPage();
    await media.goto(
      `${origin}/microphone-permission.html?camera=1&microphone=0`,
    );
    await media.waitForFunction(
      () =>
        document.querySelector("#status")?.textContent ===
        "camera access was not allowed. Try again.",
    );
    assert.equal(await media.title(), "ChatGPT camera access");
    assert.equal(await media.locator("#permission-help").isVisible(), true);
    await media.locator("#allow-microphone").click();
    await media.waitForFunction(
      () => (window as any).__mediaFixture.stopped === 1,
    );
    assert.deepEqual(
      await media.evaluate(() => (window as any).__mediaFixture.requests),
      [
        { audio: false, video: true },
        { audio: false, video: true },
      ],
    );
    assert.equal(await media.locator("#permission-help").isVisible(), false);
  },
);
