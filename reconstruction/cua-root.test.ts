import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { parse } from "acorn";

const root = process.env.CUA_VENDOR_ROOT ?? "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
let serial = 0;
const dataModule = (code: string) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;

// Replace only native/runtime dependencies; execute each implementation's own
// get_state and inventory helpers. No production source is rewritten by this test.
async function load(file: string, fixture: unknown) {
  (globalThis as any).__cuaRootFixture = fixture;
  let source = await readFile(file, "utf8");
  const imports = (parse(source, { ecmaVersion: "latest", sourceType: "module" }) as any).body.filter((node: any) => node.type === "ImportDeclaration");
  const nonce = ++serial;
  for (const node of imports.reverse()) {
    const specifier = node.source.value;
    let replacement: string;
    if (specifier === "@core/browser" || specifier.endsWith("browser-client.js")) {
      replacement = dataModule(`export const setupBrowserRuntime = globalThis.__cuaRootFixture.setup; // ${nonce}`);
    } else if (specifier === "@core/sky" || specifier.endsWith("/sky.js")) {
      replacement = dataModule(`export const sky = globalThis.__cuaRootFixture.sky; // ${nonce}`);
    } else {
      replacement = new URL(specifier, pathToFileURL(file)).href;
    }
    source = source.slice(0, node.source.start) + JSON.stringify(replacement) + source.slice(node.source.end);
  }
  return (await import(dataModule(source + `\n// instance ${nonce}`))).cua;
}

async function scenario(file: string, mode: string) {
  const trace: unknown[] = [];
  let calls = 0;
  const sky = { target: "linux", list_apps: async () => {
    trace.push("apps");
    if (mode === "apps-error") throw Error("apps unavailable");
    return [{ id: "app", name: "Fixture", windows: [] }];
  }};
  const runtimes: any[] = [];
  const setup = async (options: unknown) => {
    trace.push(["setup", options]);
    if (mode === "setup-error" || (mode === "retry-error" && calls++ > 0)) throw Error("setup failed");
    const runtime = { documentation: `docs-${runtimes.length}`, browsers: {
      list: async () => {
        trace.push("browsers");
        if (mode === "browsers-error") throw Error("browsers unavailable");
        return [{ id: "browser" }];
      },
      get: async () => ({ tabs: { list: async () => [{ id: "tab" }] } }),
    }};
    runtimes.push(runtime);
    return runtime;
  };
  try {
    const cua = await load(file, { sky, setup });
    trace.push(["initial", cua.computer, cua.browsers, cua.documentation]);
    for (let attempt = 0; attempt < 2; attempt++) {
      const detachedInitialize = cua.initialize;
      try { trace.push(["result", await detachedInitialize()]); }
      catch (error) { trace.push(["error", String(error)]); }
      trace.push(["fields", cua.computer === sky, cua.browsers === runtimes.at(-1)?.browsers, cua.documentation]);
    }
    return trace;
  } finally { delete (globalThis as any).__cuaRootFixture; }
}
for (const mode of ["normal", "setup-error", "retry-error", "apps-error", "browsers-error"]) {
  test(`root CUA initialization matches installed source: ${mode}`, async () => {
    assert.deepEqual(
      await scenario(resolve("packages/cua/dist/cua.js"), mode),
      await scenario(`${root}/cua/dist/lib/js/oai_js_cua/src/cua.js`, mode),
    );
  });
}
test("package root resolves to the restored public entry", async () => {
  assert.equal(import.meta.resolve("@core/cua"), pathToFileURL(resolve("packages/cua/dist/index.js")).href);
  assert.match(await readFile("packages/cua/dist/index.js", "utf8"), /export\s*\{\s*cua\s*\}\s*from\s*["']\.\/cua\.js/);
});
