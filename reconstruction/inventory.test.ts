import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const vendor = (name: string) =>
  import(
    pathToFileURL(`${root}/cua/dist/lib/js/oai_js_cua/src/${name}.js`).href
  );
test("native app inventory preserves per-platform projection and unknown-platform error", async () => {
  const restored = (await import("../packages/cua/dist/get_apps.js")).get_apps,
    original = (await vendor("get_apps")).get_apps;
  async function run(fn: any, target: string) {
    const log: any[] = [];
    try {
      return {
        result: await fn({
          target,
          list_apps: async () => {
            log.push("list");
            return [
              { id: "x", name: "App", windows: [] },
              { id: "y", name: "Running", windows: [{ id: 7 }] },
            ];
          },
        }),
        log,
      };
    } catch (e) {
      return { name: (e as Error).name, message: (e as Error).message, log };
    }
  }
  for (const target of ["mac", "windows", "linux", "other"])
    assert.deepEqual(await run(restored, target), await run(original, target));
});
test("combined state preserves concurrent requests, partial failures and error ordering", async () => {
  const restored = (await import("../packages/cua/dist/get_state.js"))
      .get_state,
    original = (await vendor("get_state")).get_state;
  async function run(fn: any, mode: number) {
    const log: string[] = [];
    const computer = {
      target: "linux",
      list_apps: async () => {
        log.push("apps");
        if (mode & 1) throw new Error("apps failed");
        return [{ id: "a", name: "App", windows: [] }];
      },
    };
    const browsers = {
      list: async () => {
        log.push("browsers");
        if (mode & 2) throw new Error("browsers failed");
        return [{ id: "first" }, { id: "second" }];
      },
      get: async (id: string) => {
        log.push(id);
        if (mode & 4 && id === "second") throw new Error("connection failed");
        return { tabs: { list: async () => [{ id: "tab" }] } };
      },
    };
    const options =
      mode === 8
        ? {}
        : mode === 9
          ? { computer }
          : mode === 10
            ? { browsers }
            : { computer, browsers };
    return { result: await fn(options), log };
  }
  for (let mode = 0; mode <= 10; mode++)
    assert.deepEqual(
      await run(restored, mode),
      await run(original, mode),
      String(mode),
    );
});
