import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { parse } from "acorn";
import { build } from "esbuild";
import { chromium } from "playwright";
import { loadExtensionQrWasm } from "../packages/browser/src/service/browser_auth/qr_browser";
import { syntheticQrPayload, syntheticQrPngBase64 } from "./synthetic-qr-fixture";
const root = process.env.CUA_EXTENSION_SOURCE_ROOT ?? `${homedir()}/Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0`;
const source = readFileSync(`${root}/chunks/js-kernel-host-COXQa-ka.js`, "utf8");
assert.equal(createHash("sha256").update(source).digest("hex"), "5ea78ade270d71bb6ffcec719207ad02bf63db30d0c16058f24a74a7f9f3682a");
const node = (parse(source, { ecmaVersion: "latest", sourceType: "module" }) as any).body.find((n: any) => n.type === "FunctionDeclaration" && n.id.name === "gR");

test("browser QR WASM lookup matches original extension relative/root fallback and errors", async () => {
  for (const mode of ["first", "fallback", "failure"]) {
    const outputs = [];
    const bytes = new Uint8Array([1]);
    const failure = Error("read");
    for (const restored of [false, true]) {
      const reads: string[] = [];
      const context = { filesystem: { async readBytes(url: URL) { reads.push(url.href); if (mode === "failure" || (mode === "fallback" && reads.length === 1)) throw failure; return bytes; } } };
      const href = "chrome-extension://extension/chunks/js-kernel-host.html?scopeId=scope";
      const original = new Function("self", `${source.slice(node.start, node.end)};return gR;`)({ location: { href } });
      let result: unknown;
      try { assert.equal(await (restored ? loadExtensionQrWasm(context, href) : original(context)), bytes); result = "bytes"; }
      catch (error) { assert.equal(error, failure); result = "error"; }
      outputs.push({ reads, result });
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});

test("browser-packaged QR flow decodes with upstream WASM in Chromium through host reads", async () => {
  const bundle = await build({ entryPoints: ["packages/browser/src/service/browser_auth/qr_browser.ts"], bundle: true, platform: "browser", format: "iife", globalName: "QrModule", write: false });
  const require = createRequire(new URL("../packages/browser/package.json", import.meta.url));
  const bytes = readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm"));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "0e8d688d71932ebb6b8b33f700d43d3cb997f59ed9cab3c05102d7f10288a392");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("https://qr.test/**", route => {
      const path = new URL(route.request().url()).pathname;
      return route.fulfill(path === "/assets/zxing_reader-vui-RP1A.wasm" ? { status: 200, contentType: "application/wasm", body: bytes } : path.endsWith(".wasm") ? { status: 404, body: "missing" } : { contentType: "text/html", body: "<html></html>" });
    });
    await page.goto("https://qr.test/chunks/kernel.html");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const result = await page.evaluate(async (input: string) => {
      const reads: string[] = [];
      const flow = (globalThis as any).QrModule.createPackagedAuthQrFlow();
      const context = { filesystem: { async readBytes(url: URL) { reads.push(url.href); const r = await fetch(url); if (!r.ok) throw Error("read"); return new Uint8Array(await r.arrayBuffer()); } }, playwright: { evaluateOnPlaywrightPage() { throw Error("Unexpected fallback"); } } };
      const first = await flow.decode(input, { tab_id: "7" }, context);
      const second = await flow.decode(input, { tab_id: "7" }, context);
      return { first, second, reads };
    }, `data:image/png;base64,${syntheticQrPngBase64}`);
    assert.equal(result.first.payload, syntheticQrPayload);
    assert.deepEqual(result.second, result.first);
    assert.deepEqual(result.reads, ["https://qr.test/chunks/zxing_reader.wasm", "https://qr.test/assets/zxing_reader-vui-RP1A.wasm"]);
  } finally { await browser.close(); }
});
