import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
import { extractNodeReplSources } from "../scripts/extract-node-repl-sources.mjs";
import * as bindings from "../packages/node-repl/src/kernel_bindings";
import { createBindingInstrumentation } from "../packages/node-repl/src/kernel_instrumentation";
const parser = createRequire(
  new URL("../packages/node-repl/package.json", import.meta.url),
)("meriyah");
const { files } = await extractNodeReplSources(
  process.env.CUA_NODE_REPL_BINARY,
);
const source = files["kernel.js"];
const fragment = source.slice(
  source.indexOf("function collectPatternNames("),
  source.indexOf("async function buildModuleSource("),
);
const original = () =>
  new Function(
    `let internalBindingCounter=0; const internalBindingSalt='fixture'; ${fragment}; return {collectBindings, collectPatternBindingNames, collectReassignedConstNames, collectHoistedVarDeclarationStarts, collectFutureVarWriteReplacements, instrumentCurrentBindings, applyReplacements, tryReadBindingValue};`,
  )();
const restored = () => {
  let counter = 0;
  return {
    ...bindings,
    ...createBindingInstrumentation(
      () => `__codex_internal_commit_fixture_${counter++}`,
    ),
  };
};
const parse = (code: string) =>
  parser.parseModule(code, {
    next: true,
    module: true,
    ranges: true,
    disableWebCompat: true,
  });
test("kernel binding analysis preserves destructuring, top-level collection and shadowing rules", () => {
  const codes = [
    "const {a: x=1,...rest}=obj; let [y,,...tail]=list; function f(){} class C{}",
    "for(var x=0;x<2;x++){} for(var y of list){} for(var z in obj){} for(let local of list){}",
    "x++; ({x}=obj); [y]=list; for(z of list){}; obj.x=2;",
    "{let x; x++;} function f(y){y++; x++;} (({z})=>z++)(obj);",
    "for(let x of (y++,list)){x++;z++;} function f(){var y; y++;}",
    "for(let x=0;x<2;x++){x++;} try{}catch(x){x++;}",
    "const x=0; x++; {var z=1;} if(true){var nested=2;}",
  ];
  for (const code of codes) {
    const ast = parse(code),
      prior = ["x", "y", "z"].map((name) => ({ name, kind: "const" }));
    const results = [original(), restored()].map((lib) => {
      const current = lib.collectBindings(ast);
      return {
        current,
        reassigned: [
          ...lib.collectReassignedConstNames(
            ast,
            prior,
            new Set(current.map((b: any) => b.name)),
          ),
        ],
        hoisted: [...lib.collectHoistedVarDeclarationStarts(ast)],
      };
    });
    assert.deepEqual(results[1], results[0], code);
  }
  // Preserve the source's intentionally limited top-level collection.
  assert.deepEqual(
    restored().collectBindings(parse("if(true){var nested=2;}")),
    [],
  );
});
function execute(code: string, mode: "current" | "future") {
  const results = [original(), restored()].map((lib) => {
    const ast = parse(code),
      helpers: string[] = [],
      marks: string[] = [];
    const transformed =
      mode === "current"
        ? lib.instrumentCurrentBindings(
            code,
            ast,
            lib.collectBindings(ast),
            [],
            "__mark",
          )
        : lib.applyReplacements(
            code,
            lib.collectFutureVarWriteReplacements(code, ast, {
              helperDeclarations: helpers,
              markCommittedFnName: "__mark",
            }),
          );
    const sandbox = { __mark: (...names: string[]) => marks.push(...names) };
    let error;
    try {
      vm.runInNewContext(helpers.join("\n") + "\n" + transformed, sandbox, {
        timeout: 1000,
      });
    } catch (e) {
      error = { name: (e as Error).name, message: (e as Error).message };
    }
    return { transformed, helpers, marks, error };
  });
  assert.deepEqual(results[1], results[0], code);
  return results[1];
}
test("kernel declaration instrumentation preserves partial failures and loop commit timing", () => {
  const cases = [
    "let x=1,y=missing();",
    'const [x,y]=[1,2]; class C{}; function f(){}; throw Error("later");',
    'for(var x=0;x<2;x++){}; throw Error("later");',
    "for(var x of [1,2]) x++; for(var y in {a:1}) { y; }",
    'for(var x of []){}; throw Error("later");',
    "let {x,y=missing()}={x:1};",
  ];
  for (const code of cases) execute(code, "current");
  assert.deepEqual(execute(cases[0], "current").marks, ["x"]);
  assert.deepEqual(execute(cases[4], "current").marks, []);
  assert.deepEqual(execute(cases[5], "current").marks, []);
});
test("kernel future-var writes preserve short circuit, failed writes and unsupported nesting", () => {
  const cases = [
    'x=1; throw Error("later"); var x;',
    'x++; throw Error("later"); var x;',
    'x ||= 3; throw Error("later"); var x;',
    'x &&= missing(); throw Error("later"); var x;',
    'x ??= 4; throw Error("later"); var x;',
    "x=missing(); var x;",
    'if(true){x=1;} throw Error("later"); var x;',
    "(x=2); x+=3; var x;",
  ];
  for (const code of cases) execute(code, "future");
  assert.deepEqual(execute(cases[3], "future").marks, []);
  assert.deepEqual(execute(cases[5], "future").marks, []);
  assert.deepEqual(execute(cases[6], "future").marks, []);
  for (const lib of [original(), restored()]) {
    assert.throws(
      () => lib.collectFutureVarWriteReplacements("var x;", parse("var x;")),
      /commit marker/,
    );
    assert.throws(
      () =>
        lib.collectFutureVarWriteReplacements(
          "x ||= 1; var x;",
          parse("x ||= 1; var x;"),
          { markCommittedFnName: "mark" },
        ),
      /helperDeclarations/,
    );
    assert.deepEqual(lib.tryReadBindingValue(null, "x"), {
      ok: false,
      value: undefined,
    });
    assert.deepEqual(
      lib.tryReadBindingValue(
        {
          namespace: Object.defineProperty({}, "x", {
            get() {
              throw Error("TDZ");
            },
          }),
        },
        "x",
      ),
      { ok: false, value: undefined },
    );
    assert.deepEqual(
      lib.tryReadBindingValue({ namespace: { x: undefined } }, "x"),
      { ok: true, value: undefined },
    );
  }
});
