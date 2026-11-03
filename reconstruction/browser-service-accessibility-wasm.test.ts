import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { brotliDecompressSync } from "node:zlib";
import { serviceExpression, originalServiceBindings } from "./service-source";
import {
  loadBrowserAccessibilityWasm,
  allocateAccessibilityBuffer,
  revisionError,
  AccessibilityRevision,
} from "../packages/browser/src/service/accessibility/wasm";
const path = `${process.env.CUA_VENDOR_ROOT ?? "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai"}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-accessibility.wasm.br`;
const bytes = brotliDecompressSync(await readFile(path));
const original = new Function(
  "Gv",
  `
const X2 = new TextEncoder(), Ure = new TextDecoder('utf-8', {fatal:true});
const jre = new FinalizationRegistry(({runtime, pointer}) => runtime.exports.computer_use_browser_wasm_revision_release(pointer));
${["Vv", "$re", "zh", "Wre", "Hre"].map((name) => `const ${name} = ${serviceExpression(name).replaceAll("import.meta.url", JSON.stringify(import.meta.url))};`).join("\n")}
return {load:Hre, Revision:zh};`,
)((name: string) => import(`node:${name}`));
const dialogNodes = originalServiceBindings(["q2"], {
  Lt: (value: string) => new URL(value),
}).q2;
function snapshot(message: string) {
  return {
    capturedAt: "2026-11-04T00:00:00Z",
    tab: { id: 7, title: "Fixture", url: "https://example.test", active: true },
    nodes: dialogNodes(
      { title: "Fixture" },
      {
        id: "dialog",
        type: "prompt",
        url: "https://example.test",
        message,
        promptText: "你好",
      },
    ),
    warnings: [],
  };
}
function observe(revision: any) {
  return {
    text: revision.text,
    elements: Array.from({ length: 20 }, (_, id) => [
      id,
      revision.identityForElement(id),
      revision.isValueSettableForElement(id),
    ]),
  };
}
function failure(fn: () => unknown) {
  try {
    fn();
    return null;
  } catch (e: any) {
    return [e.constructor.name, e.message];
  }
}

test("real installed WASM yields identical full/diff revisions through reconstructed and original bridges", async () => {
  const actual = await loadBrowserAccessibilityWasm(bytes, {
    env: { OMITTED: undefined, LANG: "en_US.UTF-8" },
  });
  const expected = await original.load(bytes, { env: { LANG: "en_US.UTF-8" } });
  let a: any, b: any;
  for (const [message, mode] of [
    ["Hello", "full"],
    ["Changed", "auto"],
    ["Changed", "auto"],
    ["你好😀", "full"],
  ] as const) {
    a = actual.buildRevision(a, snapshot(message), { mode });
    b = expected.buildRevision(b, snapshot(message), { mode });
    assert.deepEqual(observe(a), observe(b));
    assert.equal(typeof a.text, "string");
  }
  assert.match(a.text, /你好/);
  for (const id of [NaN, 0.5, Infinity, -2147483649, 2147483648]) {
    assert.deepEqual(
      failure(() => a.identityForElement(id)),
      failure(() => b.identityForElement(id)),
    );
    assert.deepEqual(
      failure(() => a.isValueSettableForElement(id)),
      failure(() => b.isValueSettableForElement(id)),
    );
  }
  for (const [value, options] of [
    [null, {}],
    [{}, {}],
    [snapshot("x"), { mode: undefined }],
    [snapshot("x"), "bad"],
  ])
    assert.deepEqual(
      failure(() => actual.buildRevision(null, value as any, options as any)),
      failure(() => expected.buildRevision(null, value, options)),
    );
  const other = await loadBrowserAccessibilityWasm(bytes),
    otherOriginal = await original.load(bytes);
  assert.deepEqual(
    failure(() => other.buildRevision(a, snapshot("x"))),
    failure(() => otherOriginal.buildRevision(b, snapshot("x"))),
  );
  assert.deepEqual(
    failure(() => actual.buildRevision({} as any, snapshot("x"))),
    failure(() => expected.buildRevision({}, snapshot("x"))),
  );
});

test("compressed file WASI loading agrees with original bytes path; invalid environments reject before IO", async () => {
  const actual = await loadBrowserAccessibilityWasm(path);
  const expected = await original.load(bytes);
  assert.deepEqual(
    observe(actual.buildRevision(null, snapshot("file"))),
    observe(expected.buildRevision(null, snapshot("file"))),
  );
  for (const env of [{ bad: 3 }, { "bad\0key": "x" }, { bad: "x\0" }]) {
    await assert.rejects(
      loadBrowserAccessibilityWasm("missing.wasm", { env: env as any }),
      /Invalid accessibility WebAssembly environment entry/,
    );
    await assert.rejects(
      original.load(bytes, { env }),
      /Invalid accessibility WebAssembly environment entry/,
    );
  }
});

test("allocation and revision text cleanup match original on invalid sizes and copy failures", () => {
  const old = originalServiceBindings(["Vv", "$re"]);
  for (const size of [0, -1, 0.5, NaN, Infinity, 2147483648])
    assert.deepEqual(
      failure(() => allocateAccessibilityBuffer({} as any, size)),
      failure(() => old.Vv({}, size)),
    );
  for (const code of [0, 1, 2, 5, 99])
    assert.deepEqual(
      [revisionError(code).constructor.name, revisionError(code).message],
      [old.$re(code).constructor.name, old.$re(code).message],
    );
  function run(Revision: any, mismatch: boolean) {
    const freed: number[] = [];
    const runtime = {
      exports: {
        memory: new WebAssembly.Memory({ initial: 1 }),
        computer_use_browser_wasm_allocate: () => 16,
        computer_use_browser_wasm_deallocate: (p: number) => freed.push(p),
        computer_use_browser_wasm_revision_release: () => {},
        computer_use_browser_wasm_revision_text_length: () => 2,
        computer_use_browser_wasm_revision_copy_text: () => (mismatch ? 1 : 2),
      },
    };
    const revision = new Revision(runtime, 8);
    return { error: failure(() => revision.text), freed };
  }
  for (const mismatch of [false, true])
    assert.deepEqual(
      run(AccessibilityRevision, mismatch),
      run(original.Revision, mismatch),
    );
});
