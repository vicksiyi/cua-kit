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
