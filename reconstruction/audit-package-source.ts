/** File/import inventory only: presence and source hashes do not prove semantic parity. */
import { readdir, readFile, access, writeFile } from "node:fs/promises";
import { resolve, relative, dirname } from "node:path";
import { createHash } from "node:crypto";
import { parse } from "acorn";
const vendorRoot = process.env.CUA_VENDOR_ROOT ?? "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const roots = {
  cua: "cua/dist/lib/js/oai_js_cua/src",
  sky: "sky/dist/project/cua/sky_js/src",
  "cua-repl": "cua-repl/dist/lib/js/oai_js_cua_repl/src",
};
const exists = async (file: string) => access(file).then(() => true, () => false);
async function files(dir: string): Promise<string[]> {
  return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(item => {
    const file = resolve(dir, item.name);
    return item.isDirectory() ? files(file) : [file];
  }))).flat().sort();
}
function imports(source: string) {
  const imports: { specifier: string | null; dynamic: boolean }[] = [];
  function walk(node: any) {
    if (!node || typeof node !== "object") return;
    if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type) && node.source)
      imports.push({ specifier: node.source.value, dynamic: false });
    if (node.type === "ImportExpression")
      imports.push({ specifier: typeof node.source.value === "string" ? node.source.value : null, dynamic: true });
    for (const [key, value] of Object.entries(node)) {
      if (key === "start" || key === "end") continue;
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") walk(value);
    }
  }
  walk(parse(source, { ecmaVersion: "latest", sourceType: "module" }));
  return imports;
}
const packages = [];
for (const [name, subpath] of Object.entries(roots)) {
  const sourceRoot = resolve(vendorRoot, subpath);
  const modules = [];
  for (const sourcePath of (await files(sourceRoot)).filter(file => file.endsWith(".js"))) {
    const source = await readFile(sourcePath, "utf8");
    const path = relative(sourceRoot, sourcePath);
    const target = `packages/${name}/src/${path.replace(/\.js$/, ".ts")}`;
    const edges = [];
    for (const edge of imports(source)) {
      const resolved = edge.specifier?.startsWith(".") ? resolve(dirname(sourcePath), edge.specifier) : null;
      edges.push({ ...edge,
        kind: edge.specifier === null ? "computed-import" : edge.specifier.startsWith("node:") ? "node-builtin" : resolved ? (relative(sourceRoot, resolved).startsWith("..") ? "outside-package-source" : "inside-package-source") : "package-or-import-map",
        ...(resolved ? { resolved: relative(vendorRoot, resolved), exists: await exists(resolved) } : {}),
      });
    }
    modules.push({ source: relative(vendorRoot, sourcePath), sha256: createHash("sha256").update(source).digest("hex"), target, targetExists: await exists(target), builtExists: await exists(`packages/${name}/dist/${path}`), imports: edges });
  }
  packages.push({ name, modules: modules.length, missingTargets: modules.filter(m => !m.targetExists).map(m => m.target), missingBuilt: modules.filter(m => !m.builtExists).map(m => m.target), files: modules });
}
const report = { scope: "Installed CUA, Sky and CUA-REPL JavaScript modules; excludes browser bundle, extension, native executables and declaration fidelity", limitation: "Matching paths and hashes establish inventory/provenance only, not behavior, readable-source completeness or real-device acceptance", vendorRoot, packages };
const output = process.argv[2] ?? "reconstruction/package-source-inventory.json";
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(packages.map(({ name, modules, missingTargets, missingBuilt }) => ({ name, modules, missingTargets, missingBuilt })), null, 2));
