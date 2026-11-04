import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extractNodeReplSources } from "../scripts/extract-node-repl-sources.mjs";
import { createKernelModuleBuilder } from "../packages/node-repl/src/kernel_module_builder";
const exec = promisify(execFile);
const parser = createRequire(
  new URL("../packages/node-repl/package.json", import.meta.url),
)("meriyah");
const { files } = await extractNodeReplSources(
  process.env.CUA_NODE_REPL_BINARY,
);
const diagnosticModule = { exports: {} as any };
new Function("module", files["diagnostics.js"])(diagnosticModule);
const kernel = files["kernel.js"];
const originalFactory = new Function(
  "meriyahPromise",
  "redactDiagnosticSource",
  "state",
  `
let internalBindingCounter=0; const internalBindingSalt='fixture';
${kernel.slice(kernel.indexOf("function collectPatternNames("), kernel.indexOf("function formatErrorMessage(")).replace("const meriyah = await meriyahPromise;", "const meriyah = await meriyahPromise; const {previousModule,previousBindings}=state;")}
return {buildModuleSource,canReadCommittedBinding,collectCommittedBindings};
`,
);
function pair(state: any) {
  let counter = 0;
  return [
    originalFactory(
      Promise.resolve(parser),
      diagnosticModule.exports.redactDiagnosticSource,
      state,
    ),
    createKernelModuleBuilder({
      getPreviousState: () => state,
      nextInternalBindingName: () =>
        `__codex_internal_commit_fixture_${counter++}`,
    }),
  ];
}
test("kernel module builder preserves carried bindings, warning sets, redaction and shared allocation", async () => {
  const state = {
    previousModule: { namespace: {} },
    previousBindings: [
      { name: "x", kind: "const" },
      { name: "y", kind: "var" },
      { name: "f", kind: "function" },
    ],
  };
  const builders = pair(state);
  for (const code of [
    'x += 2; let z="secret";',
    "const x=4;",
    "let globalThis=1; /* private */ y ||= 2;",
    "const {a,b}=obj;",
    "await Promise.resolve();",
    'import value from "pkg";',
  ]) {
    const results = await Promise.all(
      builders.map((b) => b.buildModuleSource(code)),
    );
    assert.deepEqual(results[1], results[0]);
    if (code.startsWith("x +=")) {
      assert.match(results[1].source, /let x = __prev.x/);
      assert.deepEqual([...results[1].warnedConstNames], ["x"]);
      assert.ok(!results[1].redactedSource.includes("secret"));
    }
  }
  for (const builder of builders)
    await assert.rejects(builder.buildModuleSource("let = ;"), SyntaxError);
});
test("kernel commit collection preserves namespace readability and explicit var/function markers", () => {
  const prior = [{ name: "old", kind: "const" }];
  const current = ["lexical", "uninitialized", "hoisted", "fn", "old"].map(
    (name, i) => ({
      name,
      kind: ["let", "const", "var", "function", "let"][i],
    }),
  );
  const namespace = Object.defineProperty(
    { lexical: undefined, hoisted: undefined, fn: () => {}, old: 5 },
    "uninitialized",
    {
      get() {
        throw new ReferenceError("TDZ");
      },
    },
  );
  const builders = pair({ previousModule: null, previousBindings: [] });
  for (const module of [null, { namespace }])
    for (const marked of [new Set<string>(), new Set(["hoisted", "fn"])]) {
      const result = builders.map((b) =>
        b.collectCommittedBindings(module, prior, current, marked),
      );
      assert.deepEqual(result[1], result[0]);
      if (module && marked.size === 0) {
        assert.deepEqual(result[1].bindings, [
          { name: "old", kind: "let" },
          { name: "lexical", kind: "let" },
        ]);
        assert.equal(result[1].committedCurrentBindingCount, 2);
      }
    }
});
test("generated kernel modules execute carryover, delete private hooks and retain partial initialization evidence", async () => {
  const prior = [{ name: "x", kind: "const" }];
  for (const code of [
    "x+=2; const answer=x*2;",
    "const [a,b=missing()]=[1];",
    'z ||= 3; throw Error("later"); var z;',
  ]) {
    const builders = pair({
      previousModule: { namespace: { x: 4 } },
      previousBindings: prior,
    });
    const built = await Promise.all(
      builders.map((b) => b.buildModuleSource(code)),
    );
    const outputs = [];
    for (let i = 0; i < builders.length; i++) {
      const script = `
import vm from 'node:vm';
const context=vm.createContext({});const marks=[];let prelude=false;let meta;
const module=new vm.SourceTextModule(${JSON.stringify(built[i].source)},{context,initializeImportMeta(value){meta=value;value.__codexInternalMarkCommittedBindings=(...names)=>marks.push(...names);value.__codexInternalMarkPreludeCompleted=()=>prelude=true;}});
await module.link(()=>new vm.SyntheticModule(['x'],function(){this.setExport('x',4);},{context}));
let error=null;try{await module.evaluate();}catch(e){error={name:e.name,message:e.message};}
const values={};const inaccessible=[];for(const name of ${JSON.stringify(built[i].nextBindings.map((b: any) => b.name))}){try{values[name]=module.namespace[name]??null;}catch{inaccessible.push(name);}}
console.log(JSON.stringify({marks,prelude,values,inaccessible,error,privateHooks:Object.keys(meta)}));
`;
      const { stdout } = await exec(
        process.execPath,
        ["--experimental-vm-modules", "--input-type=module", "-e", script],
        { timeout: 10000 },
      );
      outputs.push(JSON.parse(stdout));
    }
    assert.deepEqual(outputs[1], outputs[0]);
    assert.equal(outputs[1].prelude, true);
    assert.deepEqual(outputs[1].privateHooks, []);
    if (code.startsWith("x+="))
      assert.deepEqual(outputs[1].values, { x: 6, answer: 12 });
    if (code.startsWith("const [a")) {
      assert.equal(outputs[1].values.a, 1);
      assert.deepEqual(outputs[1].inaccessible, ["b"]);
      assert.deepEqual(outputs[1].marks, []);
    }
    if (code.startsWith("z")) assert.deepEqual(outputs[1].marks, ["z"]);
  }
});
