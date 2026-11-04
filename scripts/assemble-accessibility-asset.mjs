import { readFile, mkdir, writeFile, rename, rm } from "node:fs/promises";
import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

// Build-time packaging only. Runtime loading retains the original relative URL
// and BROWSER_USE_ACCESSIBILITY_CORE_WASM_PATH override.
export async function assembleAccessibilityAsset(source, destination) {
  const content = await readFile(source);
  const compressed = String(source).endsWith(".br");
  const bytes = compressed ? brotliDecompressSync(content) : content;
  const module = await WebAssembly.compile(bytes);
  const exports = new Set(
    WebAssembly.Module.exports(module).map(({ name }) => name),
  );
  for (const name of [
    "memory",
    "_initialize",
    "computer_use_browser_wasm_allocate",
    "computer_use_browser_wasm_deallocate",
    "computer_use_browser_wasm_revision_create",
    "computer_use_browser_wasm_revision_release",
    "computer_use_browser_wasm_revision_text_length",
    "computer_use_browser_wasm_revision_copy_text",
    "computer_use_browser_wasm_revision_identity_length",
    "computer_use_browser_wasm_revision_copy_identity",
    "computer_use_browser_wasm_revision_is_value_settable",
  ]) {
    if (!exports.has(name))
      throw new Error(`Accessibility WebAssembly export is missing: ${name}`);
  }
  const target = resolve(destination);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(
      temporary,
      compressed
        ? content
        : brotliCompressSync(bytes, {
            params: { [constants.BROTLI_PARAM_QUALITY]: 5 },
          }),
    );
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
  return target;
}
