import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
  readFile,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { createPageAssetsClass } from "../packages/browser/dist/service/context/page_assets.js";
// Real browser/filesystem integration with an explicit test CDP adapter and local-only approval fixture.
// This does not exercise the production host, policy authority, MCP transport or AgentLoop.
const imageBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6V8sAAAAASUVORK5CYII=",
  "base64",
);
const css =
  'body { background-image: url("/pixel.png"); color: rgb(1, 2, 3); }';
const requests: string[] = [];
const server = createServer((request, response) => {
  requests.push(request.url ?? "");
  const routes: Record<string, [string, string | Buffer]> = {
    "/": [
      "text/html",
      '<!doctype html><link rel="stylesheet" href="/style.css"><script src="/code.js"></script><img src="/pixel.png" srcset="/pixel.png 1x"><svg aria-label="Local icon" xmlns="http://www.w3.org/2000/svg"><title>Title</title><circle cx="5" cy="5" r="4"/></svg>',
    ],
    "/style.css": ["text/css; charset=utf-8", css],
    "/pixel.png": ["image/png", imageBytes],
    "/code.js": ["application/javascript", "globalThis.fixtureReady = true;"],
  };
  const route = routes[request.url ?? ""];
  if (!route) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, {
    "Content-Type": route[0],
    "Cache-Control": "no-store",
  });
  response.end(route[1]);
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`,
  root = await mkdtemp(join(tmpdir(), "cua-assets-smoke-"));
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(),
    page = await context.newPage();
  await page.goto(origin + "/");
  await page.waitForFunction(() => (globalThis as any).fixtureReady === true);
  const session = await context.newCDPSession(page);
  let forceFallback = false,
    denyFallback = false,
    evaluations = 0;
  const approvals: any[] = [],
    reports: any[] = [],
    removed: string[] = [];
  const cdp = {
    async call(_tabId: number, method: string, params?: any) {
      if (forceFallback && method === "Page.getResourceContent")
        throw Error("Fixture forces cache miss");
      return await session.send(method as any, params);
    },
    async evaluateJavascript(
      _tabId: number,
      expression: string,
      options?: { awaitPromise: boolean },
    ) {
      evaluations++;
      const result = await session.send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: options?.awaitPromise,
      });
      if (result.exceptionDetails)
        throw Error(
          result.exceptionDetails.exception?.description ??
            result.exceptionDetails.text,
        );
      return result.result.value;
    },
  };
  const security = {
    createAuthorityBuilder: () => ({
      downloadFiles: (request: any) => ({
        assert: async () => {
          approvals.push(request);
          assert.equal(request.pageUrl, origin + "/");
          if (request.type === "page-asset-fetch") {
            assert.equal(new URL(request.assetUrl).origin, origin);
            if (denyFallback) throw Error("Fixture approval denied");
          } else assert.equal(request.type, "page-assets");
        },
      }),
    }),
  };
  const filesystem = {
    tmpDir: root,
    mkdir,
    writeFile,
    rm: async (path: string, options: any) => {
      removed.push(path);
      await rm(path, options);
    },
  };
  const PageAssets = createPageAssetsClass((...args) => reports.push(args));
  const assets = new PageAssets(cdp, security, {}, filesystem, {});
  const inventory = await assets.list({ documentUrl: origin + "/", tabId: 1 });
  const image = inventory.assets.find(
    (asset) => asset.url === origin + "/pixel.png",
  );
  assert(image);
  assert(image.sources.some((source) => source.kind === "resource"));
  assert(image.sources.some((source) => source.kind === "attribute"));
  assert(image.sources.some((source) => source.kind === "computedStyle"));
  assert.equal(inventory.inlineSvgs.length, 1);
  assert.equal(inventory.inlineSvgs[0].name, "Local icon");
  assert.equal(inventory.summary.byKind.script, 1);
  const selection = {
    documentUrl: origin + "/",
    tabId: 1,
    inventoryId: inventory.id,
  };
  async function verifyBundle(
    result: Awaited<ReturnType<InstanceType<typeof PageAssets>["bundle"]>>,
  ) {
    assert.equal(result.failures.length, 0);
    assert.equal(result.assets.length, 3);
    const savedImage = result.assets.find(
      (asset) => asset.url === origin + "/pixel.png",
    );
    assert(savedImage);
    assert.deepEqual(await readFile(savedImage.path), imageBytes);
    const savedCss = result.assets.find(
      (asset) => asset.url === origin + "/style.css",
    );
    assert(savedCss);
    assert.equal(await readFile(savedCss.path, "utf8"), css);
    const savedSvg = result.assets.find((asset) =>
      asset.url.startsWith("inline-svg:"),
    );
    assert(savedSvg);
    assert.equal(
      await readFile(savedSvg.path, "utf8"),
      inventory.inlineSvgs[0].markup,
    );
    assert.deepEqual(JSON.parse(await readFile(result.manifestPath, "utf8")), {
      assets: result.assets,
      failures: result.failures,
    });
  }
  const loaded = await assets.bundle(selection);
  await verifyBundle(loaded);
  assert.equal(
    approvals.filter((item) => item.type === "page-asset-fetch").length,
    0,
  );
  forceFallback = true;
  const beforeRequests = requests.length;
  const fallback = await assets.bundle(selection);
  await verifyBundle(fallback);
  assert.equal(
    approvals.filter((item) => item.type === "page-asset-fetch").length,
    1,
  );
  assert(requests.length >= beforeRequests + 2);
  assert.equal(reports.length, 0);
  denyFallback = true;
  const beforeEvaluations = evaluations;
  await assert.rejects(assets.bundle(selection), /Fixture approval denied/);
  assert.equal(evaluations, beforeEvaluations);
  assert.equal(removed.length, 1);
  assert.equal((await readdir(join(root, "browser-use/assets"))).length, 2);
  assert.equal(reports.length, 2);
  console.log(
    "PASS: real Chromium resource/SVG inventory, cached and authorized fallback bytes, manifest, per-origin approval reuse, denied-fetch suppression and directory cleanup",
  );
} finally {
  await browser?.close();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await rm(root, { recursive: true, force: true });
}
