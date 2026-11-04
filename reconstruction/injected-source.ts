import { readFile } from "node:fs/promises";
import { parse } from "acorn";
import { serviceExpression } from "./service-source";

// Decode only the literal hF string. Never execute the service or injected bundle.
const literal = parse(`(${serviceExpression("hF")})`, {
  ecmaVersion: "latest",
}) as any;
export const injectedSource: string = literal.body[0].expression.value;
const ast = parse(injectedSource, { ecmaVersion: "latest" });
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
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") visit(value);
  }
}
visit(ast);
export function injectedExpression(name: string) {
  const node = definitions.get(name);
  if (!node) throw new Error(`Missing injected source binding ${name}`);
  return injectedSource.slice(node.start, node.end);
}

/** Use actual emitted declarations in browser differential tests; remove only ESM wrappers. */
export async function compiledInjectedDeclarations(path: string) {
  let source = await readFile(path, "utf8");
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
  const edits: { start: number; end: number }[] = [];
  for (const node of ast.body) {
    if (node.type === "ImportDeclaration")
      edits.push({ start: node.start, end: node.end });
    if (node.type === "ExportNamedDeclaration" && node.declaration)
      edits.push({ start: node.start, end: node.declaration.start });
  }
  for (const edit of edits.sort((a, b) => b.start - a.start))
    source = source.slice(0, edit.start) + source.slice(edit.end);
  return source;
}

export function injectedClassMethod(className: string, methodName: string) {
  const source = injectedExpression(className);
  const parsed = parse(`(${source})`, { ecmaVersion: "latest" }) as any;
  const method = parsed.body[0].expression.body.body.find(
    (entry: any) => entry.key?.name === methodName,
  );
  if (!method)
    throw new Error(`Missing injected class method ${className}.${methodName}`);
  return source.slice(method.start - 1, method.end - 1);
}
