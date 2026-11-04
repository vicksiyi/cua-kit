import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { brotliDecompressSync } from "node:zlib";
import { assembleAccessibilityAsset } from "../scripts/assemble-accessibility-asset.mjs";

import { javaScriptDialogTree } from "../packages/browser/src/service/accessibility/dialog_tree";

const vendor = `${process.env.CUA_VENDOR_ROOT ?? "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai"}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-accessibility.wasm.br`;

test("packaged compiled loader resolves the real AX asset by its default relative URL", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-ax-asset-"));
  try {
    const target = join(directory, "browser-accessibility.wasm.br");
    await assembleAccessibilityAsset(vendor, target);
    assert.deepEqual(await readFile(target), await readFile(vendor));
    await copyFile(
      "packages/browser/dist/service/accessibility/wasm.js",
      join(directory, "wasm.mjs"),
    );
    const { loadBrowserAccessibilityWasm } = await import(
      pathToFileURL(join(directory, "wasm.mjs")).href
    );
    // No explicit source: tests the actual emitted import.meta.url asset resolution.
    const runtime = await loadBrowserAccessibilityWasm();
    const revision = runtime.buildRevision(
      null,
      {
        capturedAt: "2026-11-04T00:00:00Z",
        tab: {
          id: 1,
          title: "Asset fixture",
          url: "https://example.test",
          active: true,
        },
        nodes: javaScriptDialogTree(
          { title: "Asset fixture" },
          {
            id: "fixture",
            type: "alert",
            url: "https://example.test",
            message: "Packaged WASM works",
          },
        ),
        warnings: [],
      },
      { mode: "full" },
    );
    assert.equal(typeof revision.text, "string");
    assert.match(revision.text, /Asset fixture/);

    const plain = join(directory, "input.wasm");
    await writeFile(plain, brotliDecompressSync(await readFile(vendor)));
    await assembleAccessibilityAsset(plain, target);
    assert.deepEqual(
      brotliDecompressSync(await readFile(target)),
      await readFile(plain),
    );

    const before = await readFile(target);
    const invalid = join(directory, "invalid.wasm");
    await writeFile(invalid, "not WASM");
    await assert.rejects(assembleAccessibilityAsset(invalid, target));
    // Valid WASM with no ABI must also be rejected before replacing a working asset.
    await writeFile(invalid, Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]));
    await assert.rejects(
      assembleAccessibilityAsset(invalid, target),
      /export is missing: memory/,
    );
    assert.deepEqual(await readFile(target), before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
