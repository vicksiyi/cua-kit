import { readFile } from "node:fs/promises";
import { parse } from "acorn";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const source = await readFile(
  `${root}/browser-desktop/scripts/browser-service.mjs`,
  "utf8",
);
const definitions = new Map<string, any>();
function visit(node: any) {
  if (!node || typeof node !== "object") return;
  if (node.type === "FunctionDeclaration") definitions.set(node.id.name, node);
  if (
    node.type === "VariableDeclarator" &&
    node.id.type === "Identifier" &&
    node.init
  )
    definitions.set(node.id.name, node.init);
  if (node.type === "AssignmentExpression" && node.left.type === "Identifier")
    definitions.set(node.left.name, node.right);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") visit(value);
  }
}
visit(parse(source, { ecmaVersion: "latest", sourceType: "module" }));
/** Evaluate only explicitly inspected bindings, never the desktop module bootstrap. */
export function desktopBindings(
  names: string[],
  external: Record<string, unknown> = {},
) {
  return new Function(
    ...Object.keys(external),
    '"use strict";' +
      names
        .map((name) => {
          const node = definitions.get(name);
          if (!node) throw Error(`Missing desktop binding ${name}`);
          return `const ${name}=${source.slice(node.start, node.end)};`;
        })
        .join("\n") +
      `return {${names.join(",")}};`,
  )(...Object.values(external));
}
