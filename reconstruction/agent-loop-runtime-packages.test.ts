import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  realpath,
  rm,
  readdir,
} from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import {
  stageRuntimePackages,
  restoredPackageSources,
} from "../packages/agent-loop/src/runtime-packages";

test("runtime deployment retains separate versions and cycles after original sources disappear", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "cua-stage-test-"));
  const source = path.join(parent, "source");
  const modules = path.join(source, "node_modules");
  async function pkg(
    dir: string,
    name: string,
    version: string,
    dependencies: Record<string, string>,
    code: string,
  ) {
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name, version, main: "index.cjs", dependencies }),
    );
    await writeFile(path.join(dir, "index.cjs"), code);
  }
  try {
    const a = path.join(modules, "a"),
      b = path.join(modules, "b");
    await pkg(
      a,
      "a",
      "1.0.0",
      { b: "1", shared: "1" },
      'exports.version = require("shared"); exports.b = () => require("b");',
    );
    await pkg(
      b,
      "b",
      "1.0.0",
      { a: "1", shared: "2" },
      'exports.version = require("shared"); exports.a = () => require("a");',
    );
    await pkg(
      path.join(a, "node_modules/shared"),
      "shared",
      "1.0.0",
      {},
      'module.exports = "v1";',
    );
    await pkg(
      path.join(b, "node_modules/shared"),
      "shared",
      "2.0.0",
      {},
      'module.exports = "v2";',
    );
    const runtime = await stageRuntimePackages([a, b], parent);
    try {
      await rm(source, { recursive: true });
      const require = createRequire(path.join(runtime.root, "entry.cjs"));
      const loaded = require("a");
      assert.equal(loaded.version, "v1");
      assert.equal(loaded.b().version, "v2");
      assert.equal(loaded.b().a(), loaded);
      for (const name of ["a", "b"])
        assert.ok(
          (await realpath(require.resolve(name))).startsWith(
            runtime.root + path.sep,
          ),
        );
      assert.equal(runtime.packages.length, 4);
    } finally {
      await runtime.dispose();
    }
    await pkg(a, "a", "1", { missing: "1" }, "");
    await assert.rejects(
      stageRuntimePackages([a], parent),
      /Missing installed dependency missing/,
    );
    assert.deepEqual(await readdir(parent), ["source"]);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("actual restored CUA runtime packages resolve wholly inside deployment and keep SDK versions", async () => {
  const runtime = await stageRuntimePackages(restoredPackageSources());
  try {
    assert.deepEqual(
      runtime.packages
        .filter((p) => p.name === "@statsig/js-client")
        .map((p) => p.version)
        .sort(),
      ["3.33.1", "3.33.3"],
    );
    const require = createRequire(path.join(runtime.root, "entry.cjs"));
    for (const specifier of [
      "@core/sky/service",
      "@core/browser-desktop/service",
    ]) {
      const resolved = await realpath(require.resolve(specifier));
      assert.ok(resolved.startsWith(runtime.root + path.sep));
    }
    for (const pkg of runtime.packages) {
      const directory = await realpath(pkg.directory);
      assert.ok(directory.startsWith(runtime.root + path.sep));
      assert.notEqual(directory, pkg.source);
    }
  } finally {
    await runtime.dispose();
  }
});
