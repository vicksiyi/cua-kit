import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parse } from "acorn";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const originalPath = `${root}/cua/dist/lib/js/oai_js_cua/src/tinysky_alt/create_tinysky_alt.js`;
const tslib = await import(
  pathToFileURL(
    `${root}/cua/dist/lib/js/oai_js/node_modules/tslib/tslib.es6.js`,
  ).href
);
async function factory(path: string, deps: any, load: any) {
  let code = await readFile(path, "utf8");
  const ast = parse(code, {
    ecmaVersion: "latest",
    sourceType: "module",
  }) as any;
  const edits: any[] = [];
  let exported = "create_tinysky_alt";
  for (const node of ast.body) {
    if (node.type === "ImportDeclaration") {
      const name = node.source.value.split("/").at(-1).replace(/\.js$/, "");
      edits.push({
        start: node.start,
        end: node.end,
        text: node.specifiers
          .map(
            (s: any) =>
              `const ${s.local.name}=deps[${JSON.stringify(name)}][${JSON.stringify(s.imported?.name ?? "default")}];`,
          )
          .join("\n"),
      });
    }
    if (node.type === "ExportNamedDeclaration") {
      if (node.declaration)
        edits.push({
          start: node.start,
          end: node.declaration.start,
          text: "",
        });
      else {
        exported = node.specifiers.find(
          (s: any) => s.exported.name === "create_tinysky_alt",
        ).local.name;
        edits.push({ start: node.start, end: node.end, text: "" });
      }
    }
  }
  function walk(node: any) {
    if (!node || typeof node !== "object") return;
    if (node.type === "ImportExpression")
      edits.push({ start: node.start, end: node.start + 6, text: "load" });
    for (const v of Object.values(node)) {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") walk(v);
    }
  }
  walk(ast);
  for (const edit of edits.sort((a, b) => b.start - a.start))
    code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
  return new Function("deps", "load", code + `;return ${exported};`)(
    deps,
    load,
  );
}
async function scenario(
  path: string,
  target: string,
  options: any,
  reference: any,
) {
  const trace: any[] = [];
  const computer = {
    target,
    async list_apps() {
      trace.push("list_apps");
      return ["app"];
    },
    async list_windows() {
      trace.push("list_windows");
      return [{ id: 7 }];
    },
    async get_window(value: any) {
      trace.push(["get_window", value]);
      return { id: value.id };
    },
    async get_app_state(value: any) {
      trace.push(["get_app_state", value]);
      return { app: { id: "app" }, text: "native-state" };
    },
  };
  const agent = { browsers: { id: "browsers" } };
  const bind = (kind: string) => (_computer: any, item: any) => ({
    id: item.id,
    async getAXState(options: any) {
      trace.push(["app-state", kind, options]);
      return "native-state";
    },
  });
  const deps = {
    "tslib.es6": tslib,
    UnreachableCaseError: {
      UnreachableCaseError: class extends Error {
        constructor(value: any) {
          super(String(value));
        }
      },
    },
    get_apps: {
      get_apps: async (c: any) => {
        trace.push(["apps", c.target]);
        return ["app"];
      },
    },
    get_state: {
      get_state: async (value: any) => {
        trace.push(["state", !!value.browsers, !!value.computer]);
        return { apps: [], browsers: [] };
      },
    },
    bind_linux_app: { bind_linux_app: bind("linux") },
    bind_mac_app: { bind_mac_app: bind("mac") },
    bind_windows_app: { bind_windows_app: bind("windows") },
    create_bootstrap_emitter: {
      create_bootstrap_emitter: (value: any) => {
        trace.push(["bootstrap", value.target]);
        return {
          emit: async (...args: any[]) => {
            trace.push(["emit", ...args]);
          },
          rewrite_documentation: async () => {
            trace.push("rewrite");
          },
        };
      },
    },
    create_browser_api: { create_browser_api: () => ({ browserMethod: true }) },
    create_documentation: {
      create_documentation: () => ({ exclude_browser_confirmations: true }),
    },
    read_documentation: { read_documentation() {} },
    setup_browser: {
      setup_browser: async (value: any) => {
        trace.push(["setup-browser", value.exclude_browser_confirmations]);
        return agent;
      },
    },
  };
  const create = await factory(path, deps, async (name: string) => {
    const browser = name.includes("browser");
    trace.push(["load", browser ? "browser" : "computer"]);
    return browser ? { setupBrowserRuntime() {} } : { sky: computer };
  });
  const previous = Object.getOwnPropertyDescriptor(globalThis, "agent");
  try {
    const api = await create(options);
    const keys = Object.keys(api).sort();
    await api.getState({ emit: false });
    await api.rewriteDocumentation();
    if (api.listApps) await api.listApps({ emit: false });
    if (api.listWindows) await api.listWindows({ emit: false });
    let app;
    if (api.getApp) app = await api.getApp(reference);
    return { keys, app: app?.id, trace };
  } catch (e: any) {
    return { error: e.message, trace };
  } finally {
    if (previous) Object.defineProperty(globalThis, "agent", previous);
    else Reflect.deleteProperty(globalThis, "agent");
  }
}
test("complete TinySky factory preserves provider selection, bootstrap and platform app binding", async () => {
  const local = "packages/cua/dist/tinysky_alt/create_tinysky_alt.js";
  for (const target of ["mac", "linux", "windows", "unknown"])
    for (const options of [
      { browser: false, computer: false },
      { browser: true, computer: false },
      { browser: false, computer: true },
      {},
    ])
      for (const reference of [
        "App",
        { windowId: 7 },
        { windowId: 8 },
        { windowId: 0 },
        null,
      ])
        assert.deepEqual(
          await scenario(local, target, options, reference),
          await scenario(originalPath, target, options, reference),
        );
});
