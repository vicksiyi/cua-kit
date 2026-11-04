import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { brotliDecompressSync } from "node:zlib";
import { build } from "esbuild";
import { chromium } from "playwright";
import { originalServiceBindings } from "./service-source";

const root = process.env.CUA_EXTENSION_SOURCE_ROOT ?? `${homedir()}/Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0`;
const source = readFileSync(`${root}/chunks/browser-accessibility-YOnlOOb5.js`, "utf8");
assert.equal(createHash("sha256").update(source).digest("hex"), "3fdefb91c0f12bf86a26de735e6eda4651df4cbf28a515d2174f7f336aa09265");
// Replace only Vite's preload helper, not the loader or WASI implementation.
const original = source.replace(/^import\{t as E\}from"\.\/js-kernel-host-COXQa-ka.js";/, "const E = (load) => load();");
assert.notEqual(original, source);

test("AX loader browser bundle matches installed extension for real WASM bytes and Node-only URL rejection", { timeout: 20000 }, async () => {
  const bundle = await build({ entryPoints: ["packages/browser/src/service/accessibility/wasm.ts"], bundle: true, platform: "browser", format: "esm", write: false });
  const vendor = process.env.CUA_VENDOR_ROOT ?? "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
  const bytes = brotliDecompressSync(readFileSync(`${vendor}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-accessibility.wasm.br`));
  const dialogNodes = originalServiceBindings(["q2"], { Lt: (value: string) => new URL(value) }).q2;
  const snapshots = ["First", "Changed", "你好😀"].map(message => ({
    capturedAt: "2026-11-04T00:00:00Z",
    tab: { id: 7, title: "Fixture", url: "https://ax.test", active: true },
    nodes: dialogNodes({ title: "Fixture" }, { id: "dialog", type: "prompt", url: "https://ax.test", message, promptText: "你好" }),
    warnings: [],
  }));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("https://ax.test/**", route => route.fulfill(route.request().url().endsWith("/bytes") ? { contentType: "application/wasm", body: bytes } : { contentType: "text/html", body: "<html></html>" }));
    await page.goto("https://ax.test/kernel.html");
    const results = await page.evaluate(async ({ sources, snapshots }) => {
      const bytes = new Uint8Array(await (await fetch("https://ax.test/bytes")).arrayBuffer());
      const output = [];
      for (const source of sources) {
        const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
        try {
          const { loadBrowserAccessibilityWasm: load } = await import(url);
          const api = await load(new Uint8Array(bytes), { env: { OMITTED: undefined, LANG: "en_US.UTF-8" } });
          const revisions = [];
          let previous = null;
          for (const snapshot of snapshots) {
            previous = api.buildRevision(previous, snapshot);
            revisions.push({ text: previous.text, identity: previous.identityForElement(0), settable: previous.isValueSettableForElement(0) });
          }
          let rejected = false;
          try { await load(new URL("https://ax.test/browser-accessibility.wasm.br")); }
          catch (error) { rejected = error instanceof TypeError && String(error).includes("node:"); }
          output.push({ revisions, rejected });
        } finally { URL.revokeObjectURL(url); }
      }
      return output;
    }, { sources: [original, bundle.outputFiles[0].text], snapshots });
    assert.deepEqual(results[1], results[0]);
    assert.equal(results[1].rejected, true);
    assert.equal(results[1].revisions.length, 3);
  } finally { await browser.close(); }
});
