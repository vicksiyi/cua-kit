import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { create_tinysky_browser as restored } from "../packages/cua/dist/tinysky_browser/create_tinysky_browser.js";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const original = (
  await import(
    pathToFileURL(
      `${root}/cua/dist/lib/js/oai_js_cua/src/tinysky_browser/create_tinysky_browser.js`,
    ).href
  )
).create_tinysky_browser;

async function scenario(factory: any, mode: string) {
  const trace: unknown[] = [];
  const oldError = console.error;
  console.error = (...args) =>
    trace.push(["console.error", ...args.map(String)]);
  const oldRepl = (globalThis as any).nodeRepl,
    oldAgent = (globalThis as any).agent;
  const runtime = {
    browsers: {
      list: async () => {
        if (mode === "list-error") throw Error("inventory failure");
        return [{ id: "fixture", name: "Fixture", type: "extension" }];
      },
      get: async () => ({
        user: {
          openTabs: async () => {
            if (mode === "tabs-error") throw Error("tabs failure");
            return [{ id: "tab", url: "https://example.test/" }];
          },
        },
      }),
    },
  };
  (globalThis as any).nodeRepl = {
    env: { CUA_REPL_BROWSER_ENV: "codex-app" },
    requestMeta: { turn: "fixture" },
    write: async (...args: unknown[]) => trace.push(["write", ...args]),
  };
  try {
    const api = await factory({
      read_documentation: async (name: string) => {
        trace.push(["read", name]);
        if (mode === "docs-error") throw Error("docs failure");
        return `Documentation ${name}`;
      },
      setup_browser_runtime: async (options: any) => {
        trace.push([
          "setup",
          { ...options, decorateTab: typeof options.decorateTab },
        ]);
        if (mode === "setup-error") throw Error("setup failure");
        return runtime;
      },
    });
    trace.push(["agent", (globalThis as any).agent === runtime]);
    trace.push([
      "keys",
      Object.keys(api),
      "alias",
      api.getState === api.initialize,
    ]);
    trace.push(["state", await api.getState()]);
    trace.push(["silent", await api.initialize({ emit: false })]);
    await api.rewriteDocumentation();
  } catch (error) {
    trace.push(["error", String(error)]);
  } finally {
    console.error = oldError;
    if (oldRepl === undefined) delete (globalThis as any).nodeRepl;
    else (globalThis as any).nodeRepl = oldRepl;
    if (oldAgent === undefined) delete (globalThis as any).agent;
    else (globalThis as any).agent = oldAgent;
  }
  return trace;
}

test("browser-worker factory matches installed startup, state/errors, emission and aliases", async () => {
  for (const mode of [
    "normal",
    "list-error",
    "tabs-error",
    "docs-error",
    "setup-error",
  ]) {
    const actual = await scenario(restored, mode);
    assert.deepEqual(actual, await scenario(original, mode), mode);
    if (mode === "normal")
      assert.ok(
        actual.some((item: any) => item[0] === "agent" && item[1] === true),
      );
  }
});

test("browser-worker subpath is available through the aligned package export", async () => {
  const entry = await import("@core/cua/tinyskyBrowser");
  assert.equal(typeof entry.create_tinysky_browser, "function");
});
