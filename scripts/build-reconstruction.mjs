import { execFileSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { parse } from "acorn";
import { assembleAccessibilityAsset } from "./assemble-accessibility-asset.mjs";
execFileSync(
  "node_modules/.bin/tsc",
  [
    "-p",
    "reconstruction/tsconfig.core.json",
    "--noEmit",
    "false",
    "--rootDir",
    "packages/core/src",
    "--outDir",
    "packages/core/dist",
  ],
  { stdio: "inherit" },
);
execFileSync(
  "node_modules/.bin/tsc",
  [
    "-p",
    "reconstruction/tsconfig.json",
    "--noEmit",
    "false",
    "--rootDir",
    "packages/cua/src",
    "--outDir",
    "packages/cua/dist",
  ],
  { stdio: "inherit" },
);
execFileSync(
  "node_modules/.bin/tsc",
  [
    "-p",
    "reconstruction/tsconfig.browser.json",
    "--noEmit",
    "false",
    "--rootDir",
    "packages/browser/src",
    "--outDir",
    "packages/browser/dist",
  ],
  { stdio: "inherit" },
);
execFileSync(
  "node_modules/.bin/tsc",
  [
    "-p",
    "reconstruction/tsconfig.repl.json",
    "--noEmit",
    "false",
    "--rootDir",
    "packages/cua-repl/src",
    "--outDir",
    "packages/cua-repl/dist",
  ],
  { stdio: "inherit" },
);
execFileSync(
  "node_modules/.bin/tsc",
  [
    "-p",
    "reconstruction/tsconfig.desktop.json",
    "--noEmit",
    "false",
    "--rootDir",
    "packages/browser-desktop/src",
    "--outDir",
    "packages/browser-desktop/dist",
  ],
  { stdio: "inherit" },
);
execFileSync(
  "node_modules/.bin/tsc",
  [
    "-p",
    "reconstruction/tsconfig.sky.json",
    "--noEmit",
    "false",
    "--rootDir",
    "packages/sky/src",
    "--outDir",
    "packages/sky/dist",
  ],
  { stdio: "inherit" },
);
execFileSync("node_modules/.bin/tsc", ["-p", "reconstruction/tsconfig.node-repl.json", "--noEmit", "false", "--rootDir", "packages/node-repl/src", "--outDir", "packages/node-repl/dist"], {stdio: "inherit"});
execFileSync("node_modules/.bin/tsc", ["-p", "reconstruction/tsconfig.extension.json", "--noEmit", "false", "--rootDir", "packages/browser-extension/src", "--outDir", "packages/browser-extension/dist"], {stdio: "inherit"});
// Source uses extensionless imports. Only emitted ESM gets Node-compatible .js suffixes.
async function patchDirectory(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await patchDirectory(path);
      continue;
    }
    if (!path.endsWith(".js")) continue;
    let code = await readFile(path, "utf8");
    const ast = parse(code, { ecmaVersion: "latest", sourceType: "module" });
    const edits = [];
    function visit(node) {
      if (!node || typeof node !== "object") return;
      if (
        [
          "ImportDeclaration",
          "ExportNamedDeclaration",
          "ExportAllDeclaration",
          "ImportExpression",
        ].includes(node.type)
      ) {
        const source = node.source;
        if (
          source?.type === "Literal" &&
          typeof source.value === "string" &&
          source.value.startsWith(".") &&
          !extname(source.value)
        )
          edits.push({
            start: source.start,
            end: source.end,
            text: JSON.stringify(source.value + ".js"),
          });
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === "object") visit(value);
      }
    }
    visit(ast);
    for (const e of edits.sort((a, b) => b.start - a.start))
      code = code.slice(0, e.start) + e.text + code.slice(e.end);
    await writeFile(path, code);
  }
}
await patchDirectory("packages/cua/dist");

await patchDirectory("packages/core/dist");
await patchDirectory("packages/cua-repl/dist");

await patchDirectory("packages/browser/dist");
await patchDirectory("packages/browser-desktop/dist");
await patchDirectory("packages/sky/dist");
await patchDirectory("packages/node-repl/dist");
await patchDirectory("packages/browser-extension/dist");

const accessibilitySource =
  process.env.CUA_BROWSER_ACCESSIBILITY_WASM_SOURCE?.trim();
if (accessibilitySource) {
  await assembleAccessibilityAsset(
    accessibilitySource,
    "packages/browser/dist/service/accessibility/browser-accessibility.wasm.br",
  );
}
