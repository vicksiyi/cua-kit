import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { parse } from "acorn";
const root =
  process.env.CUA_EXTENSION_SOURCE_ROOT ??
  `${homedir()}/Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0`;
export const originalSideChatSource = await readFile(
  `${root}/content-scripts/side-chat-tab-mentions.js`,
  "utf8",
);
export const sideChatHash = createHash("sha256")
  .update(originalSideChatSource)
  .digest("hex");
if (
  sideChatHash !==
  "94718278ed82a5e7d5cd6b02761802f4719b5d7eb06f984404004eac8735f867"
)
  throw Error("Installed side-chat script differs from recorded build");
const ast: any = parse(originalSideChatSource, {
  ecmaVersion: "latest",
  sourceType: "script",
});
const definitions = new Map<string, any>();
for (const statement of ast.body[0].declarations[0].init.callee.body.body) {
  if (statement.type === "FunctionDeclaration")
    definitions.set(statement.id.name, statement);
  if (statement.type === "VariableDeclaration")
    for (const declaration of statement.declarations)
      if (declaration.id.type === "Identifier" && declaration.init)
        definitions.set(declaration.id.name, declaration.init);
}
export function sideChatBindingsSource(names: string[]) {
  return names
    .map((name) => {
      const node = definitions.get(name);
      if (!node) throw Error(`Missing side-chat binding ${name}`);
      return `let ${name}=${originalSideChatSource.slice(node.start, node.end)};`;
    })
    .join("\n");
}
