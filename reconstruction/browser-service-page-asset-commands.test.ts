import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  TabPageAssetsBundleCommand as bundle,
  TabPageAssetsListCommand as list,
} from "../packages/browser/src/service/commands/page_assets";
import { TabPageAssetsCommands } from "../packages/browser/src/commands/page_assets";
import { createPageAssetsClass } from "../packages/browser/src/service/context/page_assets";
const original = originalServiceBindings(["F", "W", "OF", "MF"], {
  Mi: TabPageAssetsCommands,
});
test("page asset commands preserve distinct tab lookup/authority ordering and payload projection", async () => {
  async function run(command: any, mode: string) {
    const trace: any[] = [];
    const ctx: any = {
      tabs: {
        async get(id: number) {
          trace.push(["tab", id]);
          if (mode === "tab-error") throw Error("missing tab");
          return {
            url: mode === "missing-url" ? undefined : "https://captured.test/",
          };
        },
      },
      security: {
        async currentTabUrl(id: number) {
          trace.push(["current", id]);
          return "https://current.test/";
        },
      },
      acquireAuthority() {
        trace.push("authority");
        return {
          observeContent(url: any) {
            trace.push(["observe", url]);
            return {
              async assert() {
                trace.push("assert");
                if (mode === "denied") throw Error("denied");
              },
            };
          },
        };
      },
      pageAssets: {
        async list(value: any) {
          trace.push(["list", value]);
          return { id: "inventory" };
        },
        async bundle(value: any) {
          trace.push(["bundle", value]);
          return { assets: [] };
        },
      },
    };
    try {
      return {
        value: await command(
          {
            tab_id: mode === "invalid" ? 0 : 7,
            inventoryId: "inventory",
            assetIds: ["asset"],
            kinds: ["image"],
            ignored: true,
          },
          ctx,
        ),
        trace,
      };
    } catch (e) {
      return { error: (e as Error).message, trace };
    }
  }
  for (const [command, reference] of [
    [bundle, original.OF],
    [list, original.MF],
  ])
    for (const mode of [
      "normal",
      "denied",
      "tab-error",
      "missing-url",
      "invalid",
    ])
      assert.deepEqual(await run(command, mode), await run(reference, mode));
  assert.equal((await run(bundle, "denied")).trace[0][0], "tab");
  assert.equal(
    (await run(list, "denied")).trace.some((x) => x[0] === "tab"),
    false,
  );
});
test("page asset commands discover real Chromium SVG and write bundle plus manifest through reconstructed backend", async () => {
  const { chromium } = await import("playwright"),
    fs = await import("node:fs/promises"),
    { tmpdir } = await import("node:os"),
    { join } = await import("node:path");
  const directory = await fs.mkdtemp(join(tmpdir(), "cua-assets-"));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<svg xmlns="http://www.w3.org/2000/svg" aria-label="fixture"><circle cx="5" cy="5" r="4"/></svg>',
    );
    const session = await page.context().newCDPSession(page);
    await session.send("Page.enable");
    const cdp: any = {
      call: (_id: number, method: string, params: any) =>
        session.send(method as any, params),
      async evaluateJavascript(_id: number, expression: string) {
        const result = await session.send("Runtime.evaluate", {
          expression,
          returnByValue: true,
          awaitPromise: true,
        });
        if (result.exceptionDetails) throw Error("page evaluation failed");
        return result.result.value;
      },
    };
    const permissions: any[] = [];
    const security: any = {
      currentTabUrl: async () => page.url(),
      createAuthorityBuilder: () => ({
        downloadFiles: (value: any) => ({
          assert: async () => {
            permissions.push(value);
          },
        }),
      }),
    };
    const Assets = createPageAssetsClass(() => {}),
      assets = new Assets(
        cdp,
        security,
        {},
        {
          tmpDir: directory,
          mkdir: fs.mkdir,
          rm: fs.rm,
          writeFile: fs.writeFile,
        },
        {},
      );
    const context: any = {
      pageAssets: assets,
      security,
      tabs: { get: async () => ({ url: page.url() }) },
      acquireAuthority: () => ({
        observeContent: (url: string) => ({
          assert: async () => {
            permissions.push({ observe: url });
          },
        }),
      }),
    };
    const inventory = await list({ tab_id: 7 }, context);
    assert.equal(inventory.inlineSvgs.length, 1);
    const result = await bundle(
      {
        tab_id: 7,
        inventoryId: inventory.id,
        assetIds: [inventory.inlineSvgs[0].id],
      },
      context,
    );
    assert.equal(result.summary.downloadedCount, 1);
    assert.equal(result.failures.length, 0);
    const svg = await fs.readFile(result.assets[0].path, "utf8");
    assert.match(svg, /<circle/);
    assert.match(svg, /fixture/);
    const manifest = JSON.parse(await fs.readFile(result.manifestPath, "utf8"));
    assert.deepEqual(manifest.assets, result.assets);
    assert.ok(permissions.some((value) => value.type === "page-assets"));
  } finally {
    await browser.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
