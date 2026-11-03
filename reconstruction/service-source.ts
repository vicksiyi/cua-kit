import { readFile } from "node:fs/promises";
import { parse } from "acorn";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const source = await readFile(
  `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-service.mjs`,
  "utf8",
);
const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
const definitions = new Map<string, any>(),
  assignments = new Map<string, any>();
function visit(node: any) {
  if (!node || typeof node !== "object") return;
  if (node.type === "FunctionDeclaration") definitions.set(node.id.name, node);
  if (
    node.type === "VariableDeclarator" &&
    node.id.type === "Identifier" &&
    node.init
  )
    definitions.set(node.id.name, node.init);
  if (node.type === "AssignmentExpression") {
    if (node.left.type === "Identifier")
      definitions.set(node.left.name, node.right);
    if (
      node.left.type === "MemberExpression" &&
      node.left.object.type === "Identifier" &&
      node.left.property.type === "Identifier" &&
      !node.left.computed
    )
      assignments.set(
        `${node.left.object.name}.${node.left.property.name}`,
        node,
      );
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") visit(value);
  }
}
visit(ast);
export function serviceExpression(name: string) {
  const node = definitions.get(name);
  if (!node) throw new Error(`Missing source binding ${name}`);
  return source.slice(node.start, node.end);
}
export function serviceAssignment(name: string) {
  const node = assignments.get(name);
  if (!node) throw new Error(`Missing source assignment ${name}`);
  return source.slice(node.start, node.end);
}
export function originalServiceBindings(
  names: string[],
  external: Record<string, unknown> = {},
) {
  return new Function(
    ...Object.keys(external),
    '"use strict";' +
      names
        .map((name) => `const ${name}=${serviceExpression(name)};`)
        .join("\n") +
      `return {${names.join(",")}};`,
  )(...Object.values(external));
}

export function serviceClassMethod(className: string, methodName: string) {
  const node = definitions.get(className);
  const method = node?.body?.body?.find(
    (item: any) =>
      item.type === "MethodDefinition" && item.key.name === methodName,
  );
  if (!method)
    throw new Error(`Missing source method ${className}.${methodName}`);
  return source.slice(method.start, method.end);
}

/** Inspect one esbuild export table without evaluating the vendor module. */
export function serviceExportTable(name: string): Record<string, string> {
  for (const node of (ast as any).body) {
    const call =
      node.type === "ExpressionStatement" ? node.expression : undefined;
    if (
      call?.type !== "CallExpression" ||
      call.callee?.name !== "H" ||
      call.arguments[0]?.name !== name
    )
      continue;
    const object = call.arguments[1];
    if (object?.type !== "ObjectExpression")
      throw new Error("Unexpected export table shape");
    return Object.fromEntries(
      object.properties.map((property: any) => {
        if (
          property.value?.type !== "ArrowFunctionExpression" ||
          property.value.body?.type !== "Identifier"
        )
          throw new Error("Unexpected export getter");
        return [property.key.name, property.value.body.name];
      }),
    );
  }
  throw new Error(`Missing export table ${name}`);
}
