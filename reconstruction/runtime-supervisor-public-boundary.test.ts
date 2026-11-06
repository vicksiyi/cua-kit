import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
const require = createRequire(import.meta.url);

test("native supervisor replacement has no implicit TS service export", async () => {
  const manifest = JSON.parse(await readFile(new URL("../packages/runtime-supervisor/package.json",import.meta.url),"utf8"));
  for (const path of ["", "/process-port", "/mcp", "/stdio", "/native-pipe-host", "/sandbox-runtime", "/sandbox-launcher", "/config-host", "/persistent-config-host"]) {
    assert.throws(()=>require.resolve("@core/runtime-supervisor"+path), {code:"ERR_PACKAGE_PATH_NOT_EXPORTED"});
    const legacy = "./legacy" + path;
    assert.ok(manifest.exports[legacy]?.types);
  }
  assert.ok(Object.keys(manifest.exports).every(key=>key === "./legacy" || key.startsWith("./legacy/")));
  const caller = JSON.parse(await readFile(new URL("../packages/agent-loop/package.json",import.meta.url),"utf8"));
  assert.equal(caller.dependencies[manifest.name],undefined);
});
