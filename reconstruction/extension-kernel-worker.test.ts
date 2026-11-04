import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { parse } from "acorn";
import { build } from "esbuild";
import { chromium } from "playwright";
import { kernelDocumentation } from "../packages/browser-extension/src/kernel_documentation";
const root = process.env.CUA_EXTENSION_SOURCE_ROOT ?? `${homedir()}/Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0`;
const source = readFileSync(`${root}/chunks/js-kernel-BMrODGlb.js`, "utf8");
assert.equal(createHash("sha256").update(source).digest("hex"), "eb67d89be4d7ec9535ad3f0e4f690bf36f2bec156f3d4e314e4bb7ff7d44a2f6");
const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" }) as any;
const original = ast.body.flatMap((node: any) => node.declarations ?? []).find((d: any) => d.id.name === "c").init;
assert.equal(original.expressions.length, 0);

test("actual worker matches installed worker lexical persistence, RPC, browser API and execution recovery", { timeout: 20000 }, async () => {
  const bundle = await build({ entryPoints: ["packages/browser-extension/src/kernel_worker_entry.ts"], bundle: true, platform: "browser", format: "iife", write: false });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: "globalThis.__name = value => value;" });
    const outputs = await page.evaluate(async ({ sources, manifest }) => {
      const outcomes = [];
      for (const source of sources) {
        const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
        const worker = new Worker(url), channel = new MessageChannel();
        const trace: unknown[] = [], results: unknown[] = [];
        const waiting = new Map<string, (value: unknown) => void>();
        worker.onmessage = ({data}) => waiting.get(data.id)?.(data);
        channel.port1.onmessage = ({data}) => {
          trace.push({ method: data.method, params: data.params instanceof Uint8Array ? Array.from(data.params) : data.params });
          let result: unknown;
          if (data.method === "setup") result = { apiManifest: manifest, disabledMemberIds: [] };
          if (data.method === "execute") result = [];
          channel.port1.postMessage({ jsonrpc: "2.0", id: data.id, result });
        };
        try {
          worker.postMessage({ type: "js-kernel:agent-port" }, [channel.port2]);
          const scripts = [
            'var marker = 40; await nodeRepl.write(marker);',
            'await nodeRepl.write(++marker);',
            'var rolledBack = 7; marker++; throw new TypeError("fixture failure");',
            'await nodeRepl.write([typeof rolledBack, marker]);',
            'await display(new Uint8Array([1,2,3])); var agent = await setupBrowserRuntime(); await nodeRepl.write(await agent.browsers.list());',
            'await nodeRepl.write(await agent.browsers.list());',
          ];
          await Promise.all(scripts.map((script, index) => new Promise<void>(resolve => {
            const id = String(index);
            waiting.set(id, (data: any) => { results.push({ id: data.id, ok: data.ok, ...(data.error ? { error: {name:data.error.name,message:data.error.message} } : {}) }); resolve(); });
            worker.postMessage({ id, script, type: "js-kernel:execute" });
          })));
          outcomes.push({ trace, results });
        } finally { worker.terminate(); channel.port1.close(); channel.port2.close(); URL.revokeObjectURL(url); }
      }
      return outcomes;
    }, { sources: [original.quasis[0].value.cooked, bundle.outputFiles[0].text], manifest: kernelDocumentation.default!.apiManifest });
    assert.deepEqual(outputs[1], outputs[0]);
    assert.equal((outputs[1].results[2] as any).ok, false);
    assert.equal((outputs[1].results[5] as any).ok, true);
    assert.ok(outputs[1].trace.some((entry: any) => entry.method === "execute"));
  } finally { await browser.close(); }
});
