import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const vendor = (path: string) =>
  import(
    pathToFileURL(`${root}/cua/dist/lib/js/oai_js_cua/src/${path}.js`).href
  );
const globals = globalThis as any;
const data = "data:image/png;base64,AQID";
type Call = [string, any[]];
async function exercise(
  bind: any,
  platform: string,
  calls: Call[],
  mode: "single" | "multiple" | "none" | "failure" = "single",
) {
  const log: any[] = [];
  const before = globals.nodeRepl;
  let stateCount = 0;
  globals.nodeRepl = {
    write: async (...args: any[]) => {
      log.push(["display", ...args]);
    },
    emitImage: async (bytes: any) => {
      log.push(["image", bytes]);
    },
  };
  const computer = new Proxy(
    {},
    {
      get: (_, method) => async (args: any) => {
        log.push([method, structuredClone(args)]);
        if (method === "get_app_state") {
          return {
            text: "MAC AX",
            app: "App",
            screenshot: mode === "none" ? null : { url: data },
          };
        }
        if (method === "get_window_state") {
          if (mode === "failure" && ++stateCount > 1)
            throw new Error("observation failed");
          const regions =
            mode === "none"
              ? []
              : [
                  {
                    id: "r1",
                    zIndex: 2,
                    url: data,
                    bytes: new Uint8Array([1, 2, 3]),
                  },
                  ...(mode === "multiple"
                    ? [
                        {
                          id: "r2",
                          zIndex: 1,
                          url: data,
                          bytes: new Uint8Array([1, 2, 3]),
                        },
                      ]
                    : []),
                ];
          return {
            window: { id: 2, title: "modal" },
            ax_tree_source: "AT-SPI",
            ax_tree: { to_string: () => "LINUX AX" },
            accessibility: {
              tree: "WINDOWS AX",
              focused_element: "focus",
              selected_text: "selected",
              selected_elements: ["a", "b"],
              document_text: "document",
            },
            screenshots: regions.map(({ bytes, url, ...rest }) =>
              platform === "linux" ? { ...rest, bytes } : { ...rest, url },
            ),
          };
        }
        if (method === "type_characters") return 3;
        return "forwarded";
      },
    },
  );
  try {
    const app = bind(
      computer,
      platform === "mac" ? "App" : { id: 1, title: "base" },
    );
    for (const [method, args] of calls) {
      let synchronous = true;
      try {
        const result = app[method](...args);
        synchronous = false;
        log.push(["result", method, await result]);
      } catch (error) {
        log.push(["error", method, synchronous, (error as Error).message]);
      }
    }
    return log;
  } finally {
    globals.nodeRepl = before;
  }
}
for (const platform of ["mac", "linux", "windows"])
  test(`${platform} binder preserves original observation, input and failure behavior`, async () => {
    const module = `tinysky_alt/bind_${platform}_app`;
    const original = (await vendor(module))[`bind_${platform}_app`];
    const restored = (await import(`../packages/cua/src/${module}.ts`))[
      `bind_${platform}_app`
    ];
    const common: Call[] = [
      ["getAXState", [{ disableDiffing: true }]],
      ["getScreenshot", []],
      ["getAXStateAndScreenshot", [{ disableDiffing: false }]],
      ["click", [4]],
      ["click", [[10, 20], { mouseButton: "right", clickCount: 2 }]],
      ["click", [[10, 20], { durationMs: 125, key: "Shift" }]],
      ["click", [4, { durationMs: 0 }]],
      [
        "drag",
        [
          [1, 2],
          [3, 4],
        ],
      ],
      ["pressKey", ["Enter"]],
      ["pressKey", ["Enter", { durationMs: 0 }]],
      ["pressKey", ["Enter", { durationMs: -1 }]],
      ["paste", ["text"]],
      ["paste", ["<b>x</b>", { format: "html" }]],
      ["typeText", ["text"]],
      ["typeText", ["text", 4]],
      ["setValue", [4, "value"]],
      [
        "selectText",
        [4, "text", { prefix: "a", suffix: "b", selectionType: "word" }],
      ],
      ["performSecondaryAction", [4, "action"]],
      ["scroll", [4, "down", 2]],
      ["scroll", [[1, 2], "up", { pixels: 2.5 }]],
      ["scroll", [[1, 2], "d", { pixels: 0 }]],
      ["getScreenshot", [{ emit: false }]],
    ];
    if (platform === "linux") common.push(["typeCharacters", ["abc"]]);
    for (const mode of ["single", "multiple", "none", "failure"] as const) {
      const calls = [...common];
      if (platform === "windows")
        calls.push(
          ["getScreenshot", []],
          ["click", [[1, 2], { screenshotId: "r2" }]],
          ["click", [1, { screenshotId: "r1" }]],
          ["getAXState", []],
          ["click", [[1, 2], { screenshotId: "r1" }]],
        );
      assert.deepEqual(
        await exercise(restored, platform, calls, mode),
        await exercise(original, platform, calls, mode),
        mode,
      );
    }
  });

test("screenshot bytes preserve original data URL and file URL behavior", async () => {
  const original = (await vendor("core/screenshot_bytes")).screenshot_bytes;
  const restored = (
    await import("../packages/cua/src/core/screenshot_bytes.ts")
  ).screenshot_bytes;
  const dir = await mkdtemp(join(tmpdir(), "cua-restored-shot-"));
  const file = join(dir, "fixture");
  await writeFile(file, new Uint8Array([7, 8, 9]));
  try {
    for (const url of [data, "data:,", "data:raw", pathToFileURL(file).href])
      assert.deepEqual(await restored(url), await original(url));
    for (const url of [
      "https://example.com/a",
      pathToFileURL(join(dir, "missing")).href,
    ]) {
      async function error(fn: any) {
        try {
          await fn(url);
        } catch (e) {
          return { code: (e as any).code, message: (e as Error).message };
        }
      }
      assert.deepEqual(await error(restored), await error(original));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
