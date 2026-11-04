import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parse } from "acorn";
const root = process.env.CUA_EXTENSION_SOURCE_ROOT ?? `${process.env.HOME}/Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0`;
const source = await readFile(`${root}/chunks/js-kernel-host-COXQa-ka.js`, "utf8");
if (createHash("sha256").update(source).digest("hex") !== "5ea78ade270d71bb6ffcec719207ad02bf63db30d0c16058f24a74a7f9f3682a") throw Error("Unrecognized extension kernel host source");
const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
let bundle;
function key(property) {
  return property.key?.name ?? property.key?.value;
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
for (const statement of ast.body) {
  for (const declaration of statement.declarations ?? []) {
    if (declaration.id.name === "us") {
      if (bundle) throw Error("Ambiguous extension documentation bundle");
      bundle = declaration.init;
    }
  }
}
if (!bundle) throw Error("Extension documentation bundle not found");
const decoded = data(bundle);
const text = JSON.stringify(decoded, null, 2).replaceAll("@oai/", "@core/");
const sha = createHash("sha256").update(source).digest("hex");
await writeFile(
  "packages/browser-extension/src/kernel_documentation.ts",
  `// Generated from extension kernel host static documentation; no vendor runtime is evaluated.\n// Source SHA-256: ${sha}\nimport type { DocumentationBundle } from "@core/browser/service";\nexport const kernelDocumentation: DocumentationBundle = ${text};\n`,
);
console.log(
  JSON.stringify({
    sourceSha256: sha,
    environments: Object.keys(decoded.environments ?? {}),
    defaultDocuments: Object.keys(decoded.default.documentation).length,
  }),
);
