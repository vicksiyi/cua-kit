import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { parse } from "acorn";
const root =
  process.env.CUA_EXTENSION_SOURCE_ROOT ??
  `${homedir()}/Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0`;
const source = await readFile(`${root}/content-scripts/codex.js`, "utf8");
export const contentScriptHash = createHash("sha256")
  .update(source)
  .digest("hex");
if (
  contentScriptHash !==
  "168b307ff1e936bcfdc9344f4e668b4767cf91b6ac8d7dd868e927c9474c9221"
)
  throw Error("Installed content script differs from recorded build");
const ast: any = parse(source, { ecmaVersion: "latest", sourceType: "script" });
const definitions = new Map<string, any>();
for (const statement of ast.body[0].declarations[0].init.callee.body.body) {
  if (statement.type === "FunctionDeclaration")
    definitions.set(statement.id.name, statement);
  if (statement.type === "VariableDeclaration")
    for (const declaration of statement.declarations)
      if (declaration.id.type === "Identifier" && declaration.init)
        definitions.set(declaration.id.name, declaration.init);
}
/** Only emit explicitly inspected bindings, never the original entrypoint. Mutable bundle bindings remain mutable. */
export function contentBindingsSource(names: string[]): string {
  return names
    .map((name) => {
      const node = definitions.get(name);
      if (!node) throw Error(`Missing content binding ${name}`);
      return `let ${name}=${source.slice(node.start, node.end)};`;
    })
    .join("\n");
}

/** Full hash-verified entrypoint, only for isolated browser fixture integration tests. */
export const originalContentScriptSource = source;
