import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parse } from "acorn";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const source = await readFile(
  `${root}/browser-desktop/scripts/browser-service.mjs`,
  "utf8",
);
if (createHash("sha256").update(source).digest("hex") !== "ff48f49dae194da13d03427af5130fd67c183cf76f007309afc9f3e60179cb0f")
  throw Error("Unrecognized desktop service documentation source; audit before regeneration");
const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
let bundle;
function key(property) {
  return property.key?.name ?? property.key?.value;
}
function scan(node) {
  if (!node || typeof node !== "object") return;
  if (
    node.type === "ObjectExpression" &&
    node.properties.some((p) => key(p) === "default") &&
    node.properties.some((p) => key(p) === "environments")
  ) {
    if (bundle) throw Error("Ambiguous documentation bundle");
    bundle = node;
    return;
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(scan);
    else if (value && typeof value === "object") scan(value);
  }
}
function data(node) {
  switch (node.type) {
    case "Literal":
      if (node.regex) break;
      return node.value;
    case "TemplateLiteral":
      if (!node.expressions.length) return node.quasis[0].value.cooked;
      break;
    case "ArrayExpression":
      return node.elements.map(data);
    case "ObjectExpression":
      return Object.fromEntries(
        node.properties.map((p) => {
          if (
            p.type !== "Property" ||
            p.computed ||
            p.kind !== "init" ||
            p.method
          )
            throw Error("Non-data property");
          return [key(p), data(p.value)];
        }),
      );
    case "UnaryExpression":
      if (node.operator === "!" && node.argument.type === "Literal")
        return !node.argument.value;
      break;
  }
  throw Error(`Documentation is not static data: ${node.type}`);
}
scan(ast);
if (!bundle) throw Error("Desktop documentation bundle not found");
const decoded = data(bundle);
const text = JSON.stringify(decoded, null, 2).replaceAll("@oai/", "@core/");
const sha = createHash("sha256").update(source).digest("hex");
await writeFile(
  "packages/browser-desktop/src/documentation_bundle.ts",
  `// Generated from browser-desktop service static documentation; no vendor runtime is evaluated.\n// Source SHA-256: ${sha}\nimport type { DocumentationBundle } from "@core/browser/service";\nexport const desktopDocumentation: DocumentationBundle = ${text};\n`,
);
console.log(
  JSON.stringify({
    sourceSha256: sha,
    environments: Object.keys(decoded.environments),
    defaultDocuments: Object.keys(decoded.default.documentation).length,
  }),
);
