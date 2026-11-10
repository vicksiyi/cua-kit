import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { inspect } from "node:util";
import { createHash } from "node:crypto";
import { parse } from "acorn";
import { __awaiter } from "tslib";
import { accessibility_tree } from "../packages/sky/src/targets/linux/accessibility_tree";
import { createSkyProxy } from "../packages/sky/src/create_sky_proxy";
import { load_options } from "../packages/sky/src/load_options";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const base = `${root}/sky/dist/project/cua/sky_js/src/`;
const originalTree = (
  await import(pathToFileURL(base + "targets/linux/accessibility_tree.js").href)
).accessibility_tree;
const originalOptions = (
  await import(pathToFileURL(base + "load_options.js").href)
).load_options;
const source = await readFile(base + "sky.js", "utf8"),
  ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
const body = ast.body
  .filter(
    (n) =>
      n.type !== "ImportDeclaration" && n.type !== "ExportNamedDeclaration",
  )
  .map((n) => source.slice(n.start, n.end))
  .join("\n");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const originalRpc = await import(pathToFileURL(base + "sky_service_rpc.js").href);
function importedAlias(name: string) {
  for (const node of ast.body as any[]) {
    if (node.type === "ImportDeclaration") {
      const found = node.specifiers.find((s: any) => s.imported?.name === name);
      if (found) return found.local.name;
    }
  }
  throw Error(`Missing vendor import ${name}`);
}
const exportedSky = (ast.body as any[]).find(n => n.type === "ExportNamedDeclaration")
  .specifiers.find((s: any) => s.exported.name === "sky").local.name;
const originalProxyFactory = new AsyncFunction(
  ...["__awaiter", "create_client", "load_options", "create_drag_handle", "invoke"].map(importedAlias),
  body + `;return {sky:${exportedSky}};`,
);
const originalProxy = (awaiter: unknown, direct: unknown, options: unknown, _tree: unknown) =>
  originalProxyFactory(awaiter, direct, options, originalRpc.create_drag_handle, originalRpc.invoke);
async function host<T>(runtime: any, run: () => Promise<T>) {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "nodeRepl");
  if (runtime === undefined) Reflect.deleteProperty(globalThis, "nodeRepl");
  else
    Object.defineProperty(globalThis, "nodeRepl", {
      configurable: true,
      value: runtime,
    });
  try {
    return await run();
  } finally {
    if (prior) Object.defineProperty(globalThis, "nodeRepl", prior);
    else Reflect.deleteProperty(globalThis, "nodeRepl");
  }
}
async function result(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (e: any) {
    return { error: e.message, name: e.name };
  }
}
test("Linux AX presentation matches original condensation, states, actions and nonenumerable methods", () => {
  let seed = 37;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed >>> 8;
  };
  const roles = [
    "group",
    "panel",
    "filler",
    "section",
    "generic",
    "text",
    "static",
    "label",
    "button",
    "entry",
    "image",
    "icon",
    "menu item",
    "scroll pane",
  ];
  let id = 0;
  function node(depth: number): any {
    return {
      id: String(++id),
      native_id: rand() % 13 === 0 ? "x11:42" : undefined,
      role: roles[rand() % roles.length],
      name: ["", "name", "long\nname", "same"][rand() % 4],
      description: rand() % 3 === 0 ? "same" : undefined,
      value: rand() % 4 === 0 ? "value" : undefined,
      states: [
        undefined,
        [],
        ["enabled"],
        ["focused", "editable"],
        ["checkable"],
        ["checked", "indeterminate"],
        ["selected", "expanded"],
      ][rand() % 7],
      actions: [
        undefined,
        [],
        ["click", "showcontextmenu"],
        ["showcontextmenu", "showcontextmenu"],
        ["doDefault", "Other"],
        ["clickancestor", "scrolltovisible"],
      ][rand() % 6],
      children:
        depth > 0
          ? Array.from({ length: rand() % 4 }, () => node(depth - 1))
          : [],
    };
  }
  for (let i = 0; i < 300; i++) {
    const tree = node(3),
      modal =
        i % 3 === 0
          ? {
              id: 7,
              title: i % 2 ? "Modal" : "",
              app: "fixture",
              x: 0,
              y: 0,
              width: 1,
              height: 1,
              focused: true,
              modal: true,
            }
          : undefined;
    const a = accessibility_tree(structuredClone(tree), modal),
      b = originalTree(structuredClone(tree), modal);
    assert.equal(a.to_string(), b.to_string());
    assert.equal(inspect(a), inspect(b));
    assert.equal(JSON.stringify(a), JSON.stringify(tree));
    function compare(x: any, y: any) {
      assert.deepEqual(Object.keys(x), Object.keys(y));
      for (const key of [
        "to_string",
        Symbol.for("nodejs.util.inspect.custom"),
      ]) {
        const left = Object.getOwnPropertyDescriptor(x, key)!,
          right = Object.getOwnPropertyDescriptor(y, key)!;
        assert.deepEqual(
          { ...left, value: typeof left.value },
          { ...right, value: typeof right.value },
        );
      }
      x.children.forEach((child: any, index: number) =>
        compare(child, y.children[index]),
      );
    }
    compare(a, b);
  }
});
test("Sky RPC proxy matches original receiver, media restoration, reflection and Linux drag protocol", async () => {
  for (const target of ["mac", "linux", "windows"]) {
    async function run(original: boolean) {
      const calls: any[] = [],
        handles = new Map<string, string>();
      const runtime = {
        async rpc(this: any, name: string, request: any) {
          let normalized = request;
          if ("handle_id" in request) {
            if (!handles.has(request.handle_id))
              handles.set(request.handle_id, String(handles.size));
            normalized = {
              ...request,
              handle_id: handles.get(request.handle_id),
            };
          }
          calls.push([name, normalized, this === runtime]);
          if (request.type === "setup")
            return {
              target,
              methods: [
                "echo",
                "get_screenshot",
                "get_window_state",
                "stop_audio_recording",
                "drag_handle",
              ],
            };
          if (request.method === "get_screenshot")
            return [
              {
                filepath: "/synthetic",
                data_url: "data:image/png;base64,AAH/",
              },
            ];
          if (request.method === "stop_audio_recording")
            return { filepath: "/synthetic", data_url: "no-comma" };
          if (request.method === "get_window_state")
            return {
              ax_tree: { id: "1", role: "button", name: "go", children: [] },
              screenshots: [],
              focused_modal: { id: 7, title: "modal" },
            };
          return null;
        },
      };
      return host(runtime, async () => {
        const { sky } = original
          ? await originalProxy(
              __awaiter,
              () => {
                throw Error("direct forbidden");
              },
              () => ({}),
              originalTree,
            )
          : await createSkyProxy(() => {
              throw Error("direct forbidden");
            });
        const keys = Object.keys(sky),
          descriptors = keys.map((k) => [
            k,
            {
              ...Object.getOwnPropertyDescriptor(sky, k),
              value: typeof sky[k],
            },
          ]);
        const echo = sky.echo;
        await echo("a", 2);
        const screenshots = await sky.get_screenshot(),
          audio = await sky.stop_audio_recording(),
          state = await sky.get_window_state();
        if (target === "linux") {
          const one = sky.drag_handle(),
            two = sky.drag_handle();
          await one.start({ x: 1, y: 2 });
          await one.move_to({ x: 3, y: 4 });
          await one.end();
          await two.start({ x: 0, y: 0 });
          await two.end();
        }
        return {
          calls,
          keys,
          descriptors,
          screenshots,
          audio,
          state: JSON.stringify(state),
          text: state.ax_tree.to_string?.(),
          has: "echo" in sky,
          missing: sky.missing,
          target: sky.target,
        };
      });
    }
    assert.deepEqual(await run(false), await run(true));
  }
});
test("Sky proxy preserves deferred setup errors, lazy direct client and invalid host errors", async () => {
  for (const mode of ["direct", "setup-error", "no-rpc"]) {
    async function run(original: boolean) {
      let creations = 0;
      const calls: any[] = [];
      const direct = () => {
        creations++;
        return {
          target: "mac",
          read() {
            return this.target;
          },
        };
      };
      return host(
        mode === "direct"
          ? undefined
          : mode === "no-rpc"
            ? {}
            : {
                rpc: async () => {
                  throw Error("setup failure");
                },
              },
        async () => {
          const { sky } = original
            ? await originalProxy(__awaiter, direct, () => ({}), originalTree)
            : await createSkyProxy(direct);
          const before = creations,
            target = await result(() => sky.target),
            value = await result(() => sky.read()),
            keys = await result(() => Object.keys(sky));
          return { before, creations, target, value, keys };
        },
      );
    }
    assert.deepEqual(await run(false), await run(true));
  }
});
test("Sky config loader preserves path precedence, raw values and desktop API constraints", async () => {
  assert.equal(createHash("sha256").update(await readFile(base + "load_options.js")).digest("hex"), "45c056a12f7cf1b90a224ae3a0f05636d8482d51ebd1f88085dcce38349c9222", "Installed loader changed; re-audit the current-version oracle");
  const prior = process.env.OAI_SKY_CONFIG_PATH,
    dir = await mkdtemp(path.join(tmpdir(), "sky-config-")),
    file = path.join(dir, "config.json");
  try {
    for (const value of [undefined, "", "  "]) {
      if (value === undefined) delete process.env.OAI_SKY_CONFIG_PATH;
      else process.env.OAI_SKY_CONFIG_PATH = value;
      assert.deepEqual(load_options(), originalOptions());
    }
    process.env.OAI_SKY_CONFIG_PATH = ` ${file} `;
    for (const content of [
      '{"target":"linux","extra":1}',
      "null",
      '{"target":"unknown"}',
      '{"target":"windows","api":"desktop","extra":1}',
      '{"target":"mac","api":"desktop"}',
      '{"target":"linux","api":"desktop"}',
      '{"target":"windows","api":"window"}',
      '{"target":"windows","api":null}',
      '{"api":"desktop"}',
      '[]',
      '42',
      '"text"',
      'false',
      "invalid",
    ]) {
      await writeFile(file, content);
      assert.deepEqual(
        await result(() => load_options()),
        await result(() => originalOptions()),
      );
    }
  } finally {
    if (prior === undefined) delete process.env.OAI_SKY_CONFIG_PATH;
    else process.env.OAI_SKY_CONFIG_PATH = prior;
    await rm(dir, { recursive: true, force: true });
  }
});
