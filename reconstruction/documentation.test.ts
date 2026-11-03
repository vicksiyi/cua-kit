import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const original = async (name: string) =>
  import(
    pathToFileURL(
      `${root}/cua/dist/lib/js/oai_js_cua/src/tinysky_alt/${name}.js`,
    ).href
  );
const emitter = (
  await import("../packages/cua/dist/tinysky_alt/create_bootstrap_emitter.js")
).create_bootstrap_emitter;
const docs = (
  await import("../packages/cua/dist/tinysky_alt/create_documentation.js")
).create_documentation;
const originalEmitter = (await original("create_bootstrap_emitter"))
  .create_bootstrap_emitter;
const originalDocs = (await original("create_documentation"))
  .create_documentation;
const globalHost = globalThis as any;

test("bootstrap reconstruction matches serialization, cached docs, retry and metadata identity", async () => {
  async function run(factory: any, failWrite: boolean, noHost: boolean) {
    const before = globalHost.nodeRepl;
    const log: any[] = [];
    const meta = { request: "one" };
    let failure = failWrite;
    globalHost.nodeRepl = noHost
      ? undefined
      : {
          requestMeta: meta,
          emitAudio: () => {},
          write: async (value: unknown, id: string) => {
            log.push(["write", value, id]);
            if (failure) {
              failure = false;
              throw new Error("write failed");
            }
          },
        };
    const instance = factory({
      target: "mac",
      documentation: {
        read_core: async (target: string) => {
          log.push(["core", target]);
          return "CORE";
        },
        read: async (name: string) => {
          log.push(["read", name]);
          return name.toUpperCase();
        },
      },
    });
    let attempt = 0;
    const browser = {
      browserId: "chrome",
      documentation: async () => {
        log.push(["browser-document", ++attempt]);
        if (attempt === 1) throw new Error("document failed");
        return "BROWSER";
      },
    };
    try {
      for (let i = 0; i < 2; i++)
        try {
          await instance.load_browser_documentation(browser);
        } catch (e) {
          log.push(["error", (e as Error).message]);
        }
      await Promise.all([
        instance.load_browser_documentation(browser),
        instance.load_browser_documentation(browser),
      ]);
      await Promise.all([
        instance
          .emit({ step: 1 }, { browser })
          .catch((e: Error) => log.push(["error", e.message])),
        instance.emit("hidden", { browser, emit: false }),
      ]);
      await instance.rewrite_documentation();
      if (!noHost) globalHost.nodeRepl.requestMeta = { request: "two" };
      await instance.rewrite_documentation();
      await instance.rewrite_documentation();
      if (!noHost) delete globalHost.nodeRepl.requestMeta;
      await instance.rewrite_documentation();
      await instance.rewrite_documentation();
      return log;
    } finally {
      globalHost.nodeRepl = before;
    }
  }
  for (const [failure, noHost] of [
    [false, false],
    [true, false],
    [false, true],
  ])
    assert.deepEqual(
      await run(emitter, failure, noHost),
      await run(originalEmitter, failure, noHost),
    );
});

test("documentation reconstruction preserves prefix and confirmation selection including UTF-8 budget", async () => {
  const configs = [
    {},
    { env: { CUA_REPL_BROWSER_ENV: "orbit" } },
    { env: { CUA_REPL_BROWSER_ENV: "training" } },
    { env: { TINYSKY_ALT_INITIALIZE_DOCS: "custom" } },
    {
      requestMeta: {
        "openai/confirmation_policies": { computer_use: "explicit policy" },
      },
    },
    {
      requestMeta: { "openai/confirmation_policies": { computer_use: "   " } },
    },
    {
      requestMeta: {
        "openai/confirmation_policies": { computer_use: "中".repeat(6667) },
      },
    },
    {
      requestMeta: {
        "openai/confirmation_policies": { computer_use: "x".repeat(20000) },
      },
    },
    { requestMeta: { "openai/confirmation_policies": [] } },
    {
      env: { CUA_REPL_BROWSER_ENV: "training" },
      requestMeta: {
        "openai/confirmation_policies": { computer_use: "override" },
      },
    },
  ];
  async function run(factory: any, config: any) {
    const before = globalHost.nodeRepl;
    const log: string[] = [];
    globalHost.nodeRepl = structuredClone(config);
    try {
      const d = factory(async (name: string) => {
        log.push(name);
        return `DOC:${name}`;
      });
      const a = await d.read_core("mac");
      globalHost.nodeRepl.env = {
        TINYSKY_ALT_INITIALIZE_DOCS: "changed",
        CUA_REPL_BROWSER_ENV: "orbit",
      };
      const b = await d.read_core("no-cua");
      return { a, b, log, exclude: d.exclude_browser_confirmations };
    } finally {
      globalHost.nodeRepl = before;
    }
  }
  for (const config of configs)
    assert.deepEqual(await run(docs, config), await run(originalDocs, config));
});

test("documentation loader resolves the workspace package root and matches original bytes", async () => {
  const restored = (
    await import("../packages/cua/dist/tinysky_alt/read_documentation.js")
  ).read_documentation;
  const vendor = (await original("read_documentation")).read_documentation;
  const manifest = JSON.parse(
    await readFile("reconstruction/source-map.json", "utf8"),
  );
  const documents = Object.keys(manifest.modules).filter((p) =>
    p.startsWith("packages/cua/docs/"),
  );
  assert.ok(documents.length > 0);
  for (const file of documents) {
    const name = file
      .split("/")
      .at(-1)!
      .replace(/^tinysky-alt-/, "")
      .replace(/\.md$/, "");
    assert.equal(await restored(name), await vendor(name));
  }
  await assert.rejects(restored("missing-test-document"), { code: "ENOENT" });
});

test("browser setup preserves allowed environment, decorator and exclusions", async () => {
  const restored = (
    await import("../packages/cua/dist/tinysky_alt/setup_browser.js")
  ).setup_browser;
  const vendor = (await original("setup_browser")).setup_browser;
  function run(
    factory: any,
    environment: string | undefined,
    exclude: boolean,
  ) {
    const before = globalHost.nodeRepl;
    globalHost.nodeRepl = { env: { CUA_REPL_BROWSER_ENV: environment } };
    try {
      let args: any;
      const result = factory({
        exclude_browser_confirmations: exclude,
        setupBrowserRuntime: (options: any) => {
          args = { ...options, decorateTab: typeof options.decorateTab };
          return "sentinel";
        },
      });
      return { result, args };
    } catch (e) {
      return { error: (e as Error).message };
    } finally {
      globalHost.nodeRepl = before;
    }
  }
  for (const environment of [
    undefined,
    "codex-app",
    "training",
    "cloud",
    "orbit",
    "",
    "invalid",
  ])
    for (const exclude of [true, false])
      assert.deepEqual(
        run(restored, environment, exclude),
        run(vendor, environment, exclude),
      );
});

test("browser inventory preserves partial failures and provider order", async () => {
  const restored = (await import("../packages/cua/dist/get_browsers.js"))
    .get_browsers;
  const vendor = (
    await import(
      pathToFileURL(`${root}/cua/dist/lib/js/oai_js_cua/src/get_browsers.js`)
        .href
    )
  ).get_browsers;
  async function run(factory: any) {
    const log: any[] = [];
    const result = await factory({
      list: async () => [
        { id: "ok", type: "iab" },
        { id: "bad", type: "extension" },
      ],
      get: async (id: string) => {
        log.push(id);
        if (id === "bad") throw new Error("disconnected");
        return {
          tabs: { list: async () => [{ id: "m" }] },
          user: { openTabs: async () => [{ id: "u" }] },
        };
      },
    });
    return { log, result };
  }
  assert.deepEqual(await run(restored), await run(vendor));
});
