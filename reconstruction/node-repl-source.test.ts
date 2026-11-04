import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import { parse as parseAcorn } from "acorn";
import { extractNodeReplSources } from "../scripts/extract-node-repl-sources.mjs";
import { isArrayBuffer } from "../packages/node-repl/src/realmChecks";
import { redactDiagnosticSource } from "../packages/node-repl/src/diagnostics";
const { files, manifest } = await extractNodeReplSources(
  process.env.CUA_NODE_REPL_BINARY,
);
function evaluate(source: string) {
  const module = { exports: {} as any };
  new Function("module", "exports", source)(module, module.exports);
  return module.exports;
}
const originalRealm = evaluate(files["realmChecks.js"]),
  originalDiagnostics = evaluate(files["diagnostics.js"]);
const upstream = createRequire(
  new URL("../packages/node-repl/package.json", import.meta.url),
)("meriyah");
const originalParser = evaluate(files["meriyah.umd.min.js"]);
const ast = parseAcorn(files["kernel.js"], {
  ecmaVersion: "latest",
  sourceType: "script",
});
const collect = new Function(
  ast.body
    .filter(
      (node: any) =>
        node.type === "FunctionDeclaration" &&
        ["collectPatternBindingNames", "collectPatternNames"].includes(
          node.id.name,
        ),
    )
    .map((node) => files["kernel.js"].slice(node.start, node.end))
    .join("\n") + ";return collectPatternBindingNames;",
)();

test("embedded NodeREPL resources have verified identical copies, exact hashes and valid syntax", async () => {
  const expected = JSON.parse(
    await readFile(new URL("./node-repl-source.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(manifest, expected);
  assert.equal(Object.keys(files).length, 9);
  assert.ok(manifest.resources.every((r: any) => r.occurrences.length === 2));
  assert.equal(upstream.version, "7.0.0");
  assert.equal(originalParser.version, upstream.version);
});
test("realm-safe ArrayBuffer checks match original across VM realms and spoofed brands", () => {
  const foreign = vm.runInNewContext(
    "({buffer:new ArrayBuffer(4),view:new Uint8Array(4)})",
  );
  for (const value of [
    null,
    undefined,
    1,
    "x",
    {},
    [],
    Buffer.alloc(3),
    new ArrayBuffer(0),
    new SharedArrayBuffer(2),
    foreign.buffer,
    foreign.view,
    { [Symbol.toStringTag]: "ArrayBuffer" },
    Object.create(ArrayBuffer.prototype),
    new Proxy(new ArrayBuffer(2), {}),
  ])
    assert.equal(isArrayBuffer(value), originalRealm.isArrayBuffer(value));
  assert.equal(isArrayBuffer(foreign.buffer), true);
  assert.equal(isArrayBuffer(foreign.view), false);
});
test("upstream Meriyah and restored diagnostics preserve original redaction boundaries and truncation", () => {
  const cases = [
    'const secret = "sensitive"; secret + object.secret; // comment',
    "const {name: alias, ...rest} = input; ({alias, key: alias, [alias]: rest});",
    "function named({value}, ...args) { const local = /secret/gi; return `${value}hidden${args[0]}`; }",
    'class Secret { #value = "private"; method(param) { return param + this.#value; } }',
    'try { throw "message" } catch (failure) { console.log(failure); }',
    'const fn = (param = "default") => param + previous; current;',
    "const long = 1;" + " long + 12345;".repeat(1800),
  ];
  for (const code of cases) {
    const results = [];
    for (const parser of [originalParser, upstream]) {
      const tokens: any[] = [],
        comments: any[] = [];
      const tree = parser.parseModule(code, {
        next: true,
        ranges: true,
        onToken: tokens,
        onComment: (_kind: any, _value: any, start: number, end: number) =>
          comments.push({ start, end }),
      });
      const args = [
        code,
        tree,
        [{ name: "current" }],
        [{ name: "previous" }],
        tokens,
        comments,
        collect,
      ] as const;
      const expected = originalDiagnostics.redactDiagnosticSource(...args),
        actual = redactDiagnosticSource(...args);
      assert.equal(actual, expected);
      results.push(actual);
    }
    assert.equal(results[1], results[0]);
    assert.ok(!results[1].includes("sensitive"));
    assert.ok(!results[1].includes("hidden"));
    assert.ok(!results[1].includes("comment"));
  }
  const code = 'let secret="value"; secret; object.secret;';
  const tokens: any[] = [];
  const tree = upstream.parseModule(code, { ranges: true, onToken: tokens });
  assert.equal(
    redactDiagnosticSource(code, tree, [], [], tokens, [], collect),
    'let id0=""; id0; object.secret;',
  );
});
