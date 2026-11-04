import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { parse } from "acorn";
const root =
  process.env.CUA_EXTENSION_SOURCE_ROOT ??
  `${homedir()}/Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0`;
const source = await readFile(`${root}/background.js`, "utf8");
export const extensionSourceHash = createHash("sha256")
  .update(source)
  .digest("hex");
if (
  extensionSourceHash !==
  "3ccdc7a853700c9fdd8acf8356db33ef18615d17c8a6d2b0054cafe65eb6c7b9"
)
  throw Error("Installed extension source differs from recorded build");
const ast: any = parse(source, { ecmaVersion: "latest", sourceType: "script" });
const body = ast.body[0].declarations[0].init.callee.body.body;
const definitions = new Map<string, any>();
for (const statement of body) {
  if (statement.type === "FunctionDeclaration")
    definitions.set(statement.id.name, statement);
  if (statement.type === "VariableDeclaration")
    for (const declaration of statement.declarations)
      if (declaration.id.type === "Identifier" && declaration.init)
        definitions.set(declaration.id.name, declaration.init);
}
/** Extract only inspected top-level bindings; never execute extension startup. */
export function extensionBindings(
  names: string[],
  external: Record<string, unknown>,
) {
  return new Function(
    ...Object.keys(external),
    '"use strict";' +
      names
        .map((name) => {
          const node = definitions.get(name);
          if (!node) throw Error(`Missing extension binding ${name}`);
          return `const ${name}=${source.slice(node.start, node.end)};`;
        })
        .join("\n") +
      `return {${names.join(",")}};`,
  )(...Object.values(external));
}
