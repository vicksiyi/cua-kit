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

/** Execute only selected, inspected call expressions inside a named function (or the outer IIFE for null), never the full startup body. */
export function extensionFunctionCalls(
  name: string | null,
  callPaths: string[],
  external: Record<string, unknown>,
) {
  const definition =
    name === null
      ? { type: "FunctionDeclaration", body }
      : definitions.get(name);
  if (!definition || definition.type !== "FunctionDeclaration")
    throw Error(`Missing extension function ${name}`);
  const pathOf = (node: any): string | undefined => {
    if (node?.type === "Identifier") return node.name;
    if (node?.type === "CallExpression") {
      const callee = pathOf(node.callee);
      return callee == null ? undefined : `${callee}()`;
    }
    if (node?.type === "MemberExpression" && !node.computed) {
      const owner = pathOf(node.object);
      return owner == null ? undefined : `${owner}.${node.property.name}`;
    }
  };
  const selected: any[] = [];
  const visit = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (
      node.type === "CallExpression" &&
      callPaths.includes(pathOf(node.callee) ?? "")
    ) {
      selected.push(node);
      return;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  };
  visit(definition.body);
  for (const path of callPaths)
    if (selected.filter((node) => pathOf(node.callee) === path).length !== 1)
      throw Error(`Expected exactly one ${path} in ${name}`);
  return new Function(
    ...Object.keys(external),
    '"use strict";' +
      selected
        .map((node) => source.slice(node.start, node.end) + ";")
        .join("\n"),
  )(...Object.values(external));
}

/** Evaluate selected immediate local initializers, without executing the enclosing startup. */
export function extensionFunctionLocals(name: string, names: string[], external: Record<string, unknown>) {
  const definition = definitions.get(name);
  if (definition?.type !== "FunctionDeclaration") throw Error(`Missing extension function ${name}`);
  const locals = new Map<string, any>();
  for (const statement of definition.body.body) {
    if (statement.type !== "VariableDeclaration") continue;
    for (const item of statement.declarations) if (item.id.type === "Identifier" && item.init) locals.set(item.id.name, item.init);
  }
  const declarations = names.map((name) => {
    const node = locals.get(name);
    if (!node) throw Error(`Missing local binding ${name}`);
    return `const ${name} = ${source.slice(node.start, node.end)};`;
  });
  return new Function(...Object.keys(external), '"use strict";' + declarations.join("\n") + `return {${names.join(",")}};`)(...Object.values(external));
}
