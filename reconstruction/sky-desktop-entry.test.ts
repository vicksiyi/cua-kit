import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";
import os from "node:os";
import { create_client } from "../packages/sky/src/client";
import { create_client as createWindowClient } from "../packages/sky/src/create_client";
import { WindowsComputerUseClient } from "../packages/sky/src/targets/windows/internal/computer_use_client";
const root = process.env.CUA_VENDOR_ROOT ?? "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const base = `${root}/sky/dist/project/cua/sky_js/src`;
const original = await import(pathToFileURL(`${base}/client.js`).href);
const OriginalFactory = (await import(pathToFileURL(`${base}/targets/windows/internal/computer_use_client.js`).href)).WindowsComputerUseClient;

async function withHost(run: () => Promise<void>) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "nodeRepl");
  try { await run(); }
  finally {
    if (previous) Object.defineProperty(globalThis, "nodeRepl", previous);
    else delete (globalThis as any).nodeRepl;
  }
}

test("desktop public entry preserves host ownership, method arguments, media, drag and close promise", async () => {
  await withHost(async () => {
    const traces = [];
    for (const create of [original.create_client, create_client]) {
      const calls: any[] = [];
      const host = { async rpc(service: string, request: any) {
        assert.equal(this, host); assert.equal(service, "sky");
        calls.push(request);
        if (request.type === "create") return { client_id: "owned-client", target: "windows_desktop" };
        if (request.method === "get_screenshot") return [{ filepath: "fixture", data_url: "data:image/jpeg;base64,YWJj" }];
        return { received: request.method };
      }};
      (globalThis as any).nodeRepl = host;
      const options = { api: "desktop" as const, target: "windows" as const };
      const client = await create(options);
      assert.equal(calls[0].options, options);
      assert.equal(client.target, "windows_desktop");
      assert.deepEqual((await client.get_screenshot())[0].bytes, new Uint8Array([97,98,99]));
      for (const method of ["click", "scroll", "move", "type_text", "press_key", "paste", "drag"]) {
        const input = { fixture: method };
        await client[method](input);
        assert.equal(calls.at(-1).args[0], input);
      }
      const handle = client.drag_handle();
      await handle.start({ x: 1, y: 2 }); await handle.move_to({ x: 3, y: 4 }); await handle.end();
      const drag = calls.filter(q => q.handle_id);
      assert.equal(new Set(drag.map(q => q.handle_id)).size, 1);
      const closing = client.close();
      assert.equal(client.close(), closing);
      await closing;
      await assert.rejects(client.click({}), /Windows desktop client is closed/);
      await assert.rejects(handle.end(), /Windows desktop client is closed/);
      assert.equal(calls.filter(q => q.method === "close").length, 1);
      traces.push(calls.map(q => q.handle_id ? { ...q, handle_id: "uuid" } : q));
    }
    assert.deepEqual(traces[1], traces[0]);
  });
});

test("desktop entry rejects unsupported hosts and configurations as original", async () => {
  await withHost(async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cua-entry-"));
    const previous = process.env.OAI_SKY_CONFIG_PATH;
    const previousBinary = process.env.OAI_SKY_WINDOWS_BIN;
    process.env.OAI_SKY_WINDOWS_BIN = path.join(dir, "never-executed-helper");
    const config = path.join(dir, "config.json"); process.env.OAI_SKY_CONFIG_PATH = config;
    try {
      for (const create of [original.create_client, create_client]) {
        for (const response of [{}, { client_id: 1, target: "mac" }]) {
          (globalThis as any).nodeRepl = { rpc: async () => response };
          await assert.rejects(create({ api: "desktop" }), /Sky host does not support/);
        }
        await assert.rejects(create({ api: "other" }), /Only the desktop API/);
        delete (globalThis as any).nodeRepl;
        await writeFile(config, JSON.stringify({ target: "windows" }));
        await assert.rejects(create({ api: "desktop" }), /configuration must enable/);
        await writeFile(config, JSON.stringify({ api: "desktop", target: "windows" }));
        await assert.rejects(create({ api: "desktop", target: "mac" }), /requires Windows/);
        // Construction is lazy. Do not close: client.close itself sends desktop_close.
        const client = await create({ api: "desktop" });
        assert.equal(client.target, "windows_desktop");
      }
    } finally {
      if (previous === undefined) delete process.env.OAI_SKY_CONFIG_PATH; else process.env.OAI_SKY_CONFIG_PATH = previous;
      if (previousBinary === undefined) delete process.env.OAI_SKY_WINDOWS_BIN; else process.env.OAI_SKY_WINDOWS_BIN = previousBinary;
      await rm(dir, { recursive: true, force: true });
    }
  });
});

test("desktop factory honors injected transport and refuses native pipe even with injection", async () => {
  await withHost(async () => {
    for (const Factory of [OriginalFactory, WindowsComputerUseClient]) {
      delete (globalThis as any).nodeRepl;
      const calls: any[] = [];
      const client = Factory.createDesktopClient({ transport: {
        request: async (method: string, params: unknown) => { calls.push({method, params}); return {}; },
        close: async () => { calls.push("closed"); },
      }});
      await client.click({x: 1, y: 2}); await client.close();
      assert.deepEqual(calls.map(q => typeof q === "string" ? q : q.method), ["desktop_click", "desktop_close", "closed"]);
      (globalThis as any).nodeRepl = { env: { SKY_CUA_NATIVE_PIPE: "1" } };
      assert.throws(() => Factory.createDesktopClient({ transport: {} }), /require the direct Swift helper transport/);
    }
  });
});

test("desktop entry and factory original sources are pinned", async () => {
  const hashes = JSON.parse(await readFile(new URL("./sky-desktop-entry-hashes.json", import.meta.url), "utf8"));
  for (const [file, expected] of Object.entries(hashes)) {
    assert.equal(createHash("sha256").update(await readFile(`${base}/${file}`)).digest("hex"), expected);
  }
});


test("legacy window factory rejects desktop API before dispatching any platform", async () => {
  const originalWindow = await import(pathToFileURL(`${base}/create_client.js`).href);
  for (const target of ["mac", "windows", "linux", "unknown"]) {
    for (const create of [originalWindow.create_client, createWindowClient]) {
      assert.throws(() => create({ api: "desktop", target }),
        { message: "The configured desktop API requires create_client({ api: 'desktop' })" });
    }
  }
});

test("desktop declaration assets preserve installed source contents", async () => {
  const inventory = JSON.parse(await readFile(new URL("./sky-desktop-declarations.json", import.meta.url), "utf8"));
  for (const entry of inventory.files) {
    const relative = entry.source.split("/sky/dist/project/cua/sky_js/src/")[1];
    const source = await readFile(`${base}/${relative}`);
    assert.equal(createHash("sha256").update(source).digest("hex"), entry.sha256);
    assert.deepEqual(await readFile(entry.target), source);
  }
});
