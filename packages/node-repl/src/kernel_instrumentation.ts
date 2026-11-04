import {
  collectPatternBindingNames,
  type KernelNode,
  type KernelBinding,
} from "./kernel_bindings";
type Replacement = { start: number; end: number; text: string };
/** The kernel owns the salted counter; all instrumentation shares its allocator. */
export function createBindingInstrumentation(
  nextInternalBindingName: () => string,
) {
  function buildMarkCommittedExpression(
    names: string[],
    markCommittedFnName: string,
  ) {
    const serializedNames = names
      .map((name) => JSON.stringify(name))
      .join(", ");
    return `(${markCommittedFnName}(${serializedNames}), undefined)`;
  }

  function tryReadBindingValue(
    module: { namespace: Record<string, unknown> } | null,
    bindingName: string,
  ) {
    if (!module) {
      return { ok: false, value: undefined };
    }

    try {
      return { ok: true, value: module.namespace[bindingName] };
    } catch {
      return { ok: false, value: undefined };
    }
  }

  function instrumentVariableDeclarationSource(
    code: string,
    declaration: KernelNode,
    markCommittedFnName: string,
  ) {
    if (!declaration.declarations?.length) {
      return code.slice(declaration.start, declaration.end);
    }

    const prefix = code.slice(
      declaration.start,
      declaration.declarations[0].start,
    );
    const suffix = code.slice(
      declaration.declarations[declaration.declarations.length - 1].end,
      declaration.end,
    );
    const parts = [];

    for (const decl of declaration.declarations) {
      parts.push(code.slice(decl.start, decl.end));

      const names = collectPatternBindingNames(decl.id);
      if (names.length > 0) {
        const helperName = nextInternalBindingName();
        parts.push(
          `${helperName} = ${buildMarkCommittedExpression(names, markCommittedFnName)}`,
        );
      }
    }

    return `${prefix}${parts.join(", ")}${suffix}`;
  }

  function instrumentLoopBody(
    code: string,
    body: KernelNode,
    names: string[],
    guardName: string,
    markCommittedFnName: string,
  ) {
    const marker = `if (${guardName}) { ${guardName} = false; ${markCommittedFnName}(${names
      .map((name) => JSON.stringify(name))
      .join(", ")}); }`;
    const bodyCode = code.slice(body.start, body.end);

    if (body.type === "BlockStatement") {
      return `{ ${marker}${bodyCode.slice(1)}`;
    }

    return `{ ${marker} ${bodyCode} }`;
  }

  function applyReplacements(code: string, replacements: Replacement[]) {
    let instrumentedCode = code;

    for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
      instrumentedCode =
        instrumentedCode.slice(0, replacement.start) +
        replacement.text +
        instrumentedCode.slice(replacement.end);
    }

    return instrumentedCode;
  }

  function collectHoistedVarDeclarationStarts(ast: KernelNode) {
    const varDeclarationStarts = new Map<string, number>();

    const recordDeclarationStart = (
      map: Map<string, number>,
      name: string,
      start: number,
    ) => {
      const existingStart = map.get(name);
      if (existingStart === undefined || start < existingStart) {
        map.set(name, start);
      }
    };

    const recordVarDeclarationStarts = (declaration: KernelNode) => {
      for (const name of collectPatternBindingNames(declaration.id)) {
        recordDeclarationStart(varDeclarationStarts, name, declaration.start);
      }
    };

    for (const stmt of ast.body ?? []) {
      if (stmt.type === "VariableDeclaration" && stmt.kind === "var") {
        for (const declaration of stmt.declarations ?? []) {
          recordVarDeclarationStarts(declaration);
        }
        continue;
      }

      if (
        stmt.type === "ForStatement" &&
        stmt.init?.type === "VariableDeclaration" &&
        stmt.init.kind === "var"
      ) {
        for (const declaration of stmt.init.declarations ?? []) {
          recordVarDeclarationStarts(declaration);
        }
        continue;
      }

      if (
        (stmt.type === "ForInStatement" || stmt.type === "ForOfStatement") &&
        stmt.left?.type === "VariableDeclaration" &&
        stmt.left.kind === "var"
      ) {
        for (const declaration of stmt.left.declarations ?? []) {
          recordVarDeclarationStarts(declaration);
        }
      }
    }

    return varDeclarationStarts;
  }

  function collectFutureVarWriteReplacements(
    code: string,
    ast: KernelNode,
    {
      helperDeclarations = null,
      markCommittedFnName = null,
    }: {
      helperDeclarations?: string[] | null;
      markCommittedFnName?: string | null;
    } = {},
  ) {
    // Failed-cell hoisted tracking intentionally stays small here. We only mark
    // direct top-level writes to future `var` bindings, plus top-level
    // declaration-site markers handled later in `instrumentCurrentBindings`.
    // We do not recurse through nested statement structure because that quickly
    // requires real lexical-scope tracking for blocks, loop scopes, catch
    // bindings, and similar shadowing cases. Supported write recovery is limited
    // to direct top-level expression statements such as `x = 1`, `x += 1`,
    // `x++`, and logical assignments.
    const varDeclarationStarts = collectHoistedVarDeclarationStarts(ast);
    if (varDeclarationStarts.size === 0) {
      return [];
    }
    const replacements: Replacement[] = [];
    const replacementKeys = new Set();

    if (!markCommittedFnName) {
      throw new Error(
        "collectFutureVarWriteReplacements expected a commit marker binding name",
      );
    }

    const addReplacement = (start: number, end: number, text: string) => {
      const key = `${start}:${end}`;
      if (!replacementKeys.has(key)) {
        replacementKeys.add(key);
        replacements.push({ start, end, text });
      }
    };

    const getFutureVarName = (identifier: KernelNode | null | undefined) => {
      if (!identifier || identifier.type !== "Identifier") {
        return null;
      }

      const declarationStart = varDeclarationStarts.get(identifier.name);
      if (
        declarationStart === undefined ||
        identifier.start >= declarationStart
      ) {
        return null;
      }

      return identifier.name;
    };

    const instrumentUpdateExpression = (
      node: KernelNode,
      identifier: KernelNode,
    ) => {
      const bindingName = getFutureVarName(identifier);
      if (!bindingName) {
        return false;
      }

      addReplacement(
        node.start,
        node.end,
        `(${markCommittedFnName}(${JSON.stringify(bindingName)}), ${code.slice(
          node.start,
          node.end,
        )})`,
      );
      return true;
    };

    const instrumentAssignmentExpression = (node: KernelNode) => {
      if (node.left.type !== "Identifier") {
        return false;
      }

      const bindingName = getFutureVarName(node.left);
      if (!bindingName) {
        return false;
      }

      if (
        node.operator === "&&=" ||
        node.operator === "||=" ||
        node.operator === "??="
      ) {
        if (!helperDeclarations) {
          throw new Error(
            "collectFutureVarWriteReplacements expected helperDeclarations for logical assignment rewriting",
          );
        }

        const helperName = nextInternalBindingName();
        helperDeclarations.push(`let ${helperName};`);
        const shortCircuitOperator =
          node.operator === "&&="
            ? "&&"
            : node.operator === "||="
              ? "||"
              : "??";
        addReplacement(
          node.start,
          node.end,
          `((${helperName} = ${node.left.name}), ${helperName} ${shortCircuitOperator} ((${node.left.name} = ${code.slice(node.right.start, node.right.end)}), ${buildMarkCommittedExpression([bindingName], markCommittedFnName)}, ${node.left.name}))`,
        );
        return true;
      }

      addReplacement(
        node.start,
        node.end,
        `((${code.slice(node.start, node.end)}), ${buildMarkCommittedExpression([bindingName], markCommittedFnName)}, ${node.left.name})`,
      );
      return true;
    };

    const unwrapParenthesizedExpression = (
      node: KernelNode | null | undefined,
    ) => {
      let current = node;
      while (current?.type === "ParenthesizedExpression") {
        current = current.expression;
      }
      return current;
    };

    for (const statement of ast.body ?? []) {
      if (statement.type !== "ExpressionStatement") {
        continue;
      }

      const expression = unwrapParenthesizedExpression(statement.expression);
      if (!expression) {
        continue;
      }

      if (
        expression.type === "UpdateExpression" &&
        expression.argument.type === "Identifier"
      ) {
        instrumentUpdateExpression(expression, expression.argument);
        continue;
      }

      if (expression.type === "AssignmentExpression") {
        instrumentAssignmentExpression(expression);
      }
    }

    return replacements;
  }

  function instrumentCurrentBindings(
    code: string,
    ast: KernelNode,
    currentBindings: KernelBinding[],
    priorBindings: KernelBinding[],
    markCommittedFnName: string,
  ) {
    if (currentBindings.length === 0) {
      return code;
    }

    const replacements: Replacement[] = [];

    for (const stmt of ast.body ?? []) {
      if (stmt.type === "VariableDeclaration") {
        replacements.push({
          start: stmt.start,
          end: stmt.end,
          text: instrumentVariableDeclarationSource(
            code,
            stmt,
            markCommittedFnName,
          ),
        });
        continue;
      }

      if (stmt.type === "FunctionDeclaration" && stmt.id) {
        replacements.push({
          start: stmt.start,
          end: stmt.end,
          // Keep function source text stable for things like `foo.toString()`.
          // Pre-declaration uses are tracked separately by instrumenting the
          // top-level expressions that actually read the hoisted function value.
          text: `${code.slice(stmt.start, stmt.end)}\n;${markCommittedFnName}(${JSON.stringify(stmt.id.name)});`,
        });
        continue;
      }

      if (stmt.type === "ClassDeclaration" && stmt.id) {
        replacements.push({
          start: stmt.start,
          end: stmt.end,
          text: `${code.slice(stmt.start, stmt.end)}\n;${markCommittedFnName}(${JSON.stringify(stmt.id.name)});`,
        });
        continue;
      }

      if (
        stmt.type === "ForStatement" &&
        stmt.init &&
        stmt.init.type === "VariableDeclaration" &&
        stmt.init.kind === "var"
      ) {
        replacements.push({
          start: stmt.start,
          end: stmt.end,
          text: `${code.slice(stmt.start, stmt.init.start)}${instrumentVariableDeclarationSource(
            code,
            stmt.init,
            markCommittedFnName,
          )}${code.slice(stmt.init.end, stmt.end)}`,
        });
        continue;
      }

      if (
        (stmt.type === "ForInStatement" || stmt.type === "ForOfStatement") &&
        stmt.left &&
        stmt.left.type === "VariableDeclaration" &&
        stmt.left.kind === "var"
      ) {
        const names = stmt.left.declarations.flatMap((decl: KernelNode) =>
          collectPatternBindingNames(decl.id),
        );
        if (names.length > 0) {
          const guardName = nextInternalBindingName();
          replacements.push({
            start: stmt.start,
            end: stmt.end,
            // Mark top-level `for...in` / `for...of` vars on the first body
            // execution instead of every iteration. This keeps hot loops cheap
            // after the first pass while still preserving vars for the common
            // case where the loop actually ran before a later throw.
            //
            // The tradeoff is that `for (var x of []) {}` in a failed cell will
            // not carry `x` forward as `undefined`, because the body never runs
            // and the one-time marker never fires. We accept that edge case:
            // `var` is redeclarable, and the only lost state is an unassigned
            // `undefined` from an empty top-level loop in a cell that later
            // fails.
            text: `let ${guardName} = true;\n${code.slice(
              stmt.start,
              stmt.body.start,
            )}${instrumentLoopBody(
              code,
              stmt.body,
              names,
              guardName,
              markCommittedFnName,
            )}`,
          });
        }
      }
    }

    return applyReplacements(code, replacements);
  }

  return {
    buildMarkCommittedExpression,
    tryReadBindingValue,
    instrumentVariableDeclarationSource,
    instrumentLoopBody,
    applyReplacements,
    collectHoistedVarDeclarationStarts,
    collectFutureVarWriteReplacements,
    instrumentCurrentBindings,
  };
}
