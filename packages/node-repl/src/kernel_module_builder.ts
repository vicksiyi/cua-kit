import {
  collectBindings,
  collectPatternBindingNames,
  collectReassignedConstNames,
  type KernelBinding,
  type KernelNode,
} from "./kernel_bindings";
import { createBindingInstrumentation } from "./kernel_instrumentation";
import { redactDiagnosticSource, type DiagnosticToken } from "./diagnostics";
type BindingModule = { namespace: Record<string, unknown> };
// The embedded kernel passes legacy options and receives token records; retain
// that runtime contract even where upstream declarations describe token enums.
type KernelParser = {
  parseModule(
    code: string,
    options: {
      next: boolean;
      module: boolean;
      ranges: boolean;
      loc: boolean;
      disableWebCompat: boolean;
      onToken?: DiagnosticToken[];
      onComment?: (
        kind: string,
        value: string,
        start: number,
        end: number,
      ) => void;
    },
  ): KernelNode;
};
const meriyahPromise = import("meriyah") as unknown as Promise<KernelParser>;
/** Shared kernel state and salted allocator remain owned by the execution loop. */
export function createKernelModuleBuilder({
  getPreviousState,
  nextInternalBindingName,
}: {
  getPreviousState: () => {
    previousModule: BindingModule | null;
    previousBindings: KernelBinding[];
  };
  nextInternalBindingName: () => string;
}) {
  const {
    applyReplacements,
    collectFutureVarWriteReplacements,
    instrumentCurrentBindings,
    tryReadBindingValue,
  } = createBindingInstrumentation(nextInternalBindingName);
  async function buildModuleSource(code: string) {
    const meriyah = await meriyahPromise;
    const { previousModule, previousBindings } = getPreviousState();
    const diagnosticTokens: DiagnosticToken[] = [];
    const diagnosticComments: { start: number; end: number }[] = [];
    const ast = meriyah.parseModule(code, {
      next: true,
      module: true,
      ranges: true,
      loc: false,
      disableWebCompat: true,
      onToken: diagnosticTokens,
      onComment(_kind, _value, start, end) {
        diagnosticComments.push({ start, end });
      },
    });
    const currentBindings = collectBindings(ast);
    const priorBindings = previousModule ? previousBindings : [];
    const currentBindingNames = new Set(
      currentBindings.map((binding) => binding.name),
    );
    const reassignedConstNames = collectReassignedConstNames(
      ast,
      priorBindings,
      currentBindingNames,
    );
    const warnedConstNames = new Set(reassignedConstNames);
    for (const binding of currentBindings) {
      if (
        binding.kind === "const" &&
        priorBindings.some(
          (prior) => prior.name === binding.name && prior.kind === "const",
        )
      ) {
        warnedConstNames.add(binding.name);
      }
    }
    const carriedBindings = priorBindings.filter(
      (binding) => !currentBindingNames.has(binding.name),
    );
    const redactedSource = redactDiagnosticSource(
      code,
      ast,
      currentBindings,
      priorBindings,
      diagnosticTokens,
      diagnosticComments,
      collectPatternBindingNames,
    );
    const helperDeclarations = [];
    const markCommittedFnName = nextInternalBindingName();
    const markPreludeCompletedFnName = nextInternalBindingName();
    helperDeclarations.push(
      // `import.meta` is syntax-level and cannot be shadowed by user bindings
      // like `const globalThis = ...`, so alias the marker helper through it
      // once in the prelude and use that stable local binding everywhere.
      // Then delete the raw import.meta hooks so user code cannot spoof
      // committed bindings by calling them directly.
      `const ${markCommittedFnName} = import.meta.__codexInternalMarkCommittedBindings;`,
      `const ${markPreludeCompletedFnName} = import.meta.__codexInternalMarkPreludeCompleted;`,
      "delete import.meta.__codexInternalMarkCommittedBindings;",
      "delete import.meta.__codexInternalMarkPreludeCompleted;",
    );
    const writeInstrumentedCode = applyReplacements(
      code,
      collectFutureVarWriteReplacements(code, ast, {
        helperDeclarations,
        markCommittedFnName,
      }),
    );
    const instrumentedAst = meriyah.parseModule(writeInstrumentedCode, {
      next: true,
      module: true,
      ranges: true,
      loc: false,
      disableWebCompat: true,
    });
    const instrumentedCode = instrumentCurrentBindings(
      writeInstrumentedCode,
      instrumentedAst,
      currentBindings,
      priorBindings,
      markCommittedFnName,
    );

    let prelude = "";
    if (previousModule && carriedBindings.length) {
      // Recreate carried bindings before running user code in this new cell.
      prelude += 'import * as __prev from "@prev";\n';
      prelude += carriedBindings
        .map((b) => {
          let keyword = "let";
          if (b.kind === "var") {
            keyword = "var";
          } else if (b.kind === "const" && !reassignedConstNames.has(b.name)) {
            keyword = "const";
          }
          return `${keyword} ${b.name} = __prev.${b.name};`;
        })
        .join("\n");
      prelude += "\n";
    }
    if (helperDeclarations.length > 0) {
      prelude += `${helperDeclarations.join("\n")}\n`;
    }
    prelude += `${markPreludeCompletedFnName}();\n`;

    const mergedBindings = new Map<string, string>();
    for (const binding of priorBindings) {
      mergedBindings.set(binding.name, binding.kind);
    }
    for (const binding of currentBindings) {
      mergedBindings.set(binding.name, binding.kind);
    }
    // Export the merged binding set so the next cell can import it through @prev.
    const exportNames = Array.from(mergedBindings.keys());
    const exportStmt = exportNames.length
      ? `\nexport { ${exportNames.join(", ")} };`
      : "";

    const nextBindings = Array.from(mergedBindings, ([name, kind]) => ({
      name,
      kind,
    }));
    return {
      source: `${prelude}${instrumentedCode}${exportStmt}`,
      redactedSource,
      currentBindings,
      nextBindings,
      priorBindings,
      warnedConstNames,
    };
  }

  function canReadCommittedBinding(
    module: BindingModule | null,
    binding: KernelBinding,
  ) {
    if (!module || binding.kind === "var" || binding.kind === "function") {
      return false;
    }

    return tryReadBindingValue(module, binding.name).ok;
  }
  // Failed cells keep prior bindings plus the current-cell bindings whose
  // initialization definitely ran before the throw. That means:
  // - lexical bindings (`const` / `let` / `class`) can fall back to namespace
  //   readability, which preserves names whose initialization already completed
  //   even when a later step in the same declarator throws
  // - `var` / `function` bindings only persist when an explicit declaration-site
  //   or write-site marker fired, so unreached hoisted bindings do not become
  //   ghost bindings in later cells
  function collectCommittedBindings(
    module: BindingModule | null,
    priorBindings: KernelBinding[],
    currentBindings: KernelBinding[],
    committedCurrentBindingNames: Set<string>,
  ) {
    const mergedBindings = new Map<string, string>();
    let committedCurrentBindingCount = 0;

    for (const binding of priorBindings) {
      mergedBindings.set(binding.name, binding.kind);
    }

    for (const binding of currentBindings) {
      if (
        committedCurrentBindingNames.has(binding.name) ||
        canReadCommittedBinding(module, binding)
      ) {
        mergedBindings.set(binding.name, binding.kind);
        committedCurrentBindingCount += 1;
      }
    }

    return {
      bindings: Array.from(mergedBindings, ([name, kind]) => ({ name, kind })),
      committedCurrentBindingCount,
    };
  }

  return {
    buildModuleSource,
    canReadCommittedBinding,
    collectCommittedBindings,
  };
}
