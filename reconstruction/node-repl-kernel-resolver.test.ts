import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { builtinModules, createRequire, findPackageJSON } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extractNodeReplSources } from "../scripts/extract-node-repl-sources.mjs";
import { createKernelModuleResolver } from "../packages/node-repl/src/kernel_module_resolver";
const { files } = await extractNodeReplSources(
  process.env.CUA_NODE_REPL_BINARY,
);
const source = files["kernel.js"];
const fragment =
  source.slice(
    source.indexOf("const builtinModuleSet"),
    source.indexOf("let trustedServiceRequestCounter"),
  ) +
  "const moduleSearchBases=[];const moduleSearchBaseSet=new Set();" +
  source.slice(
    source.indexOf("function normalizeModuleSearchBase"),
    source.indexOf("const importResolveConditions"),
  ) +
  'const importResolveConditions=new Set(["node","import"]);const requireByBase=new Map();' +
  source.slice(
    source.indexOf("function moduleCacheKey"),
    source.indexOf("function importNativeResolved"),
  );
const original = new Function(
  "fs",
  "path",
  "builtinModules",
  "createRequire",
  "findPackageJSON",
  "fileURLToPath",
  "pathToFileURL",
  "process",
  "cwd",
  "withErrorKind",
  fragment +
    ";return {resolveSpecifier,resolveResultToUrl,setImportMeta,isPathSpecifier,isBarePackageSpecifier,addModuleSearchBase};",
);
const local = { kind: "local", isPackage: false },
  pkg = { kind: "package", isPackage: true };
async function fixture(run: (root: string, pair: any[]) => Promise<void>) {
  const root = fs.realpathSync.native(
    await mkdtemp(path.join(os.tmpdir(), "cua-kernel-resolve-")),
  );
  try {
    for (const dir of [
      "a/node_modules",
      "b/node_modules",
      "cwd/node_modules",
      "outside",
      "a/node_modules/..hidden",
    ])
      await mkdir(path.join(root, dir), { recursive: true });
    for (const file of [
      "local.mjs",
      "legacy.js",
      "data.json",
      "legacy.cjs",
      "outside/escape.mjs",
      "a/node_modules/..hidden/value.mjs",
    ])
      await writeFile(path.join(root, file), "export const value=1;");
    for (const base of ["a", "b", "cwd"]) {
      const dir = path.join(root, base, "node_modules", "fixture");
      await mkdir(dir);
      await writeFile(
        path.join(dir, "package.json"),
        JSON.stringify({
          name: "fixture",
          type: "module",
          exports: { import: "./import.mjs", require: "./require.cjs" },
        }),
      );
      await writeFile(path.join(dir, "import.mjs"), "export const value=1;");
      await writeFile(path.join(dir, "require.cjs"), "module.exports=1;");
    }
    for (const [name, type] of [
      ["esm-js", "module"],
      ["cjs-js", "commonjs"],
    ]) {
      const dir = path.join(root, "a/node_modules", name);
      await mkdir(dir);
      await writeFile(
        path.join(dir, "package.json"),
        JSON.stringify({ name, type, main: "index.js" }),
      );
      await writeFile(path.join(dir, "index.js"), "// resolution fixture");
    }
    await symlink(
      path.join(root, "outside"),
      path.join(root, "a/node_modules/escape"),
    );
    const cwd = path.join(root, "cwd"),
      dirs = [
        path.join(root, "a/node_modules"),
        path.join(root, "b"),
        path.join(root, "a/node_modules"),
      ].join(path.delimiter);
    const tag = <T>(error: T, kind: string): T => {
      if (error && typeof error === "object")
        Object.defineProperty(error, "testKind", {
          value: kind,
          configurable: true,
        });
      return error;
    };
    const pair = [
      original(
        fs,
        path,
        builtinModules,
        createRequire,
        findPackageJSON,
        fileURLToPath,
        pathToFileURL,
        { cwd: () => process.cwd(), env: { NODE_REPL_NODE_MODULE_DIRS: dirs } },
        cwd,
        tag,
      ),
      createKernelModuleResolver({ cwd, moduleDirs: dirs, withErrorKind: tag }),
    ];
    await run(root, pair);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
function capture(fn: () => unknown) {
  try {
    return { value: fn() };
  } catch (e) {
    return { error: (e as Error).message, kind: (e as any).testKind };
  }
}
function compare(pair: any[], fn: (resolver: any) => unknown) {
  const values = pair.map((r) => capture(() => fn(r)));
  assert.deepEqual(values[1], values[0]);
  return values[1];
}
test("kernel resolver preserves builtin denial, specifier classification and file validation", async () =>
  fixture(async (root, pair) => {
    const ref = path.join(root, "cell.mjs");
    for (const specifier of [
      "fs",
      "node:path",
      "process",
      "node:process",
      "node:not-real",
      "https://example.test",
      " pkg ",
      "",
      "./local.mjs",
      pathToFileURL(path.join(root, "local.mjs")).href,
      "./missing.mjs",
      "./outside",
      "./data.json",
      "./legacy.cjs",
      "file:///bad%2Fname.mjs",
    ]) {
      compare(pair, (r) => r.resolveSpecifier(specifier, ref, local));
      compare(pair, (r) => ({
        path: r.isPathSpecifier(specifier),
        bare: r.isBarePackageSpecifier(specifier),
      }));
    }
    assert.equal(
      compare(pair, (r) => r.resolveSpecifier("node:process", ref, local)).kind,
      "import_error",
    );
    assert.equal(
      (
        compare(pair, (r) => r.resolveSpecifier("./local.mjs", ref, local))
          .value as any
      ).kind,
      "file",
    );
  }));
test("kernel resolver preserves configured package precedence and package-context containment", async () =>
  fixture(async (root, pair) => {
    const first = compare(pair, (r) =>
      r.resolveSpecifier("fixture", path.join(root, "cell.mjs"), local),
    ).value as any;
    assert.ok(first.path.startsWith(path.join(root, "a/node_modules/fixture")));
    for (const [name, kind] of [
      ["esm-js", "esm-package"],
      ["cjs-js", "package"],
    ]) {
      const resolved = compare(pair, (r) =>
        r.resolveSpecifier(name, undefined, local),
      ).value as any;
      assert.equal(resolved.kind, kind);
    }
    const nested = compare(pair, (r) =>
      r.resolveSpecifier(
        "fixture",
        path.join(root, "b/node_modules/consumer/index.mjs"),
        pkg,
      ),
    ).value as any;
    assert.ok(
      nested.path.startsWith(path.join(root, "b/node_modules/fixture")),
    );
    for (const specifier of [
      "not-found-package",
      "fixture/not-exported",
      "escape/escape.mjs",
    ])
      compare(pair, (r) =>
        r.resolveSpecifier(specifier, path.join(root, "cell.mjs"), local),
      );
    for (const specifier of [
      path.join(root, "local.mjs"),
      path.join(root, "a/node_modules/fixture/import.mjs"),
      path.join(root, "a/node_modules/escape/escape.mjs"),
      path.join(root, "a/node_modules/..hidden/value.mjs"),
    ])
      compare(pair, (r) =>
        r.resolveSpecifier(specifier, path.join(root, "cell.mjs"), pkg),
      );
    const denied = compare(pair, (r) =>
      r.resolveSpecifier(
        path.join(root, "a/node_modules/escape/escape.mjs"),
        undefined,
        pkg,
      ),
    );
    assert.match(denied.error!, /configured node_modules roots/);
  }));
test("kernel import metadata preserves URLs, resolution projection and main flag", async () =>
  fixture(async (root, pair) => {
    const out = compare(pair, (r) => {
      const meta: any = {};
      r.setImportMeta(
        meta,
        { identifier: path.join(root, "local.mjs") },
        local,
        true,
      );
      const resolve = meta.resolve;
      delete meta.resolve;
      return {
        meta,
        builtin: resolve("path"),
        file: resolve("./local.mjs"),
        package: resolve("fixture"),
      };
    });
    assert.equal((out.value as any).package, "fixture");
    assert.equal((out.value as any).meta.main, true);
    assert.equal((out.value as any).builtin, "node:path");
  }));
