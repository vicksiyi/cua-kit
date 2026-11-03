import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { originalServiceBindings } from "./service-source";
import { createAuthQrFlowFromWasmFactory } from "../packages/browser/src/service/browser_auth/qr";
import {
  syntheticQrPayload,
  syntheticQrPngBase64,
} from "./synthetic-qr-fixture";
const asset =
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/zxing_reader.wasm";
test("restored QR wrapper decodes real screenshot bytes with installed original WASM factory", async () => {
  const bytes = await readFile(asset);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "0e8d688d71932ebb6b8b33f700d43d3cb997f59ed9cab3c05102d7f10288a392",
  );
  // Select only UD; never execute the browser-service bundle or its host/bootstrap side effects.
  const factory = originalServiceBindings(["UD"]).UD;
  const flow = createAuthQrFlowFromWasmFactory(
    new URL("file://" + asset).href,
    factory,
  );
  let loads = 0;
  const context: any = {
    filesystem: {
      async readBytes() {
        loads++;
        return bytes;
      },
    },
  };
  const decoded = await flow.decode(
    "data:image/png;base64," + syntheticQrPngBase64,
    { tab_id: "7" },
    context,
  );
  assert.equal(decoded?.payload, syntheticQrPayload);
  assert.ok(decoded!.bounds.width > 0 && decoded!.bounds.height > 0);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 640, height: 480 },
    });
    await page.setContent(
      `<body style="margin:0;background:white"><img style="margin:24px" src="data:image/png;base64,${syntheticQrPngBase64}"></body>`,
    );
    await page.locator("img").evaluate((image: any) => image.decode());
    const cdp = await page.context().newCDPSession(page);
    context.cdp = {
      call: (_tab: number, method: string, params: any) =>
        cdp.send(method as any, params),
    };
    const screenshot = await flow.capture({ tab_id: "7" }, context);
    assert.equal(screenshot?.payload, syntheticQrPayload);
    assert.ok(screenshot!.bounds.x >= 24 && screenshot!.bounds.y >= 24);
    await page.setContent('<body style="background:white">No QR here</body>');
    assert.equal(await flow.capture({ tab_id: "7" }, context), null);
    const publications: any[] = [];
    await flow.poll({
      abortSignal: new AbortController().signal,
      completeWhenQrCodeDisappears: true,
      ctx: context,
      initialPayload: syntheticQrPayload,
      async pageBindingStatus() {
        return null;
      },
      params: { tab_id: "7" },
      publishPayload(...args: any[]) {
        publications.push(args);
      },
    });
    assert.deepEqual(publications, [[syntheticQrPayload, true]]);
    assert.equal(loads, 1);
  } finally {
    await browser.close();
  }
});
