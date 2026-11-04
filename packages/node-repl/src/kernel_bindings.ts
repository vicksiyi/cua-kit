/** Structural AST boundary shared by Meriyah nodes and original visitors. */
export type KernelNode = { type: string; [field: string]: any };
export type KernelBinding = { name: string; kind: string };
export function collectPatternNames(
  pattern: KernelNode | null | undefined,
  kind: string,
  map: Map<string, string>,
) {
  if (!pattern) return;
  switch (pattern.type) {
    case "Identifier":
      if (!map.has(pattern.name)) map.set(pattern.name, kind);
      return;
    case "ObjectPattern":
      for (const prop of pattern.properties ?? []) {
        if (prop.type === "Property") {
          collectPatternNames(prop.value, kind, map);
        } else if (prop.type === "RestElement") {
          collectPatternNames(prop.argument, kind, map);
        }
      }
      return;
    case "ArrayPattern":
      for (const elem of pattern.elements ?? []) {
        if (!elem) continue;
        if (elem.type === "RestElement") {
          collectPatternNames(elem.argument, kind, map);
        } else {
          collectPatternNames(elem, kind, map);
        }
      }
      return;
    case "AssignmentPattern":
      collectPatternNames(pattern.left, kind, map);
      return;
    case "RestElement":
      collectPatternNames(pattern.argument, kind, map);
      return;
    default:
      return;
  }
}

export function collectBindings(ast: KernelNode): KernelBinding[] {
  const map = new Map<string, string>();
  for (const stmt of ast.body ?? []) {
    if (stmt.type === "VariableDeclaration") {
      const kind = stmt.kind;
      for (const decl of stmt.declarations) {
        collectPatternNames(decl.id, kind, map);
      }
    } else if (stmt.type === "FunctionDeclaration" && stmt.id) {
      map.set(stmt.id.name, "function");
    } else if (stmt.type === "ClassDeclaration" && stmt.id) {
      map.set(stmt.id.name, "class");
    } else if (stmt.type === "ForStatement") {
      if (
        stmt.init &&
        stmt.init.type === "VariableDeclaration" &&
        stmt.init.kind === "var"
      ) {
        for (const decl of stmt.init.declarations) {
          collectPatternNames(decl.id, "var", map);
        }
      }
    } else if (
      stmt.type === "ForInStatement" ||
      stmt.type === "ForOfStatement"
    ) {
      if (
        stmt.left &&
        stmt.left.type === "VariableDeclaration" &&
        stmt.left.kind === "var"
      ) {
        for (const decl of stmt.left.declarations) {
          collectPatternNames(decl.id, "var", map);
        }
      }
    }
  }
  return Array.from(map.entries()).map(([name, kind]) => ({ name, kind }));
}

export function collectReassignedConstNames(
  ast: KernelNode,
  priorBindings: KernelBinding[],
  currentBindingNames: Set<string>,
) {
  const priorConstNames = new Set(
    priorBindings
      .filter(
        (binding) =>
          binding.kind === "const" && !currentBindingNames.has(binding.name),
      )
      .map((binding) => binding.name),
  );
  const reassignedNames = new Set<string>();

  const visit = (node: any, shadowedNames = new Set<string>()) => {
    if (!node || typeof node !== "object" || typeof node.type !== "string") {
      return;
    }

    if (node.type === "BlockStatement") {
      const blockShadowedNames = new Set(shadowedNames);
      for (const statement of node.body ?? []) {
        if (
          statement.type === "VariableDeclaration" &&
          statement.kind !== "var"
        ) {
          for (const declaration of statement.declarations ?? []) {
            for (const name of collectPatternBindingNames(declaration.id)) {
              blockShadowedNames.add(name);
            }
          }
        } else if (
          (statement.type === "FunctionDeclaration" ||
            statement.type === "ClassDeclaration") &&
          statement.id
        ) {
          blockShadowedNames.add(statement.id.name);
        }
      }
      for (const statement of node.body ?? []) {
        visit(statement, blockShadowedNames);
      }
      return;
    }

    if (
      node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression"
    ) {
      const functionShadowedNames = new Set(shadowedNames);
      if (node.id) {
        functionShadowedNames.add(node.id.name);
      }
      for (const parameter of node.params ?? []) {
        for (const name of collectPatternBindingNames(parameter)) {
          functionShadowedNames.add(name);
        }
      }
      visit(node.body, functionShadowedNames);
      return;
    }

    if (
      (node.type === "ForInStatement" || node.type === "ForOfStatement") &&
      node.left?.type === "VariableDeclaration" &&
      node.left.kind !== "var"
    ) {
      const loopShadowedNames = new Set(shadowedNames);
      for (const declaration of node.left.declarations ?? []) {
        for (const name of collectPatternBindingNames(declaration.id)) {
          loopShadowedNames.add(name);
        }
      }
      visit(node.right, shadowedNames);
      visit(node.left, loopShadowedNames);
      visit(node.body, loopShadowedNames);
      return;
    }

    const target =
      node.type === "AssignmentExpression" ||
      ((node.type === "ForInStatement" || node.type === "ForOfStatement") &&
        node.left?.type !== "VariableDeclaration")
        ? node.left
        : node.type === "UpdateExpression"
          ? node.argument
          : null;

    for (const name of collectPatternBindingNames(target)) {
      if (priorConstNames.has(name) && !shadowedNames.has(name)) {
        reassignedNames.add(name);
      }
    }

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) {
          visit(child, shadowedNames);
        }
      } else {
        visit(value, shadowedNames);
      }
    }
  };

  visit(ast);

  return reassignedNames;
}

export function collectPatternBindingNames(
  pattern: KernelNode | null | undefined,
) {
  const map = new Map<string, string>();
  collectPatternNames(pattern, "binding", map);
  return Array.from(map.keys());
}
