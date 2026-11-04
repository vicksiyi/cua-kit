import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPackagedAuthQrFlow } from "../packages/browser/src/service/browser_auth/qr";
import {
  syntheticQrPayload,
  syntheticQrPngBase64,
} from "./synthetic-qr-fixture";

test("default QR flow decodes using the npm WASM through the host filesystem", async () => {
  const reads: string[] = [];
  const context = {
    filesystem: {
      async readBytes(url: URL) {
        reads.push(url.href);
        assert.equal(url.protocol, "file:");
        assert.match(
          url.pathname,
          /node_modules\/zxing-wasm\/dist\/reader\/zxing_reader\.wasm$/,
        );
        return readFile(url);
      },
    },
    playwright: {
      evaluateOnPlaywrightPage() {
        throw new Error("Unexpected native decoder fallback");
      },
    },
  };
  const flow = createPackagedAuthQrFlow();
  const input = "data:image/png;base64," + syntheticQrPngBase64;
  const first = await flow.decode(input, { tab_id: "7" }, context);
  const second = await flow.decode(input, { tab_id: "7" }, context);
  assert.equal(first?.payload, syntheticQrPayload);
  assert.deepEqual(second, first);
  assert.ok(first!.bounds.width > 0);
  assert.equal(reads.length, 1);
});
