import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import * as host from "@core/native-host";
import * as legacy from "@core/native-host/legacy";

test("public native-host clients do not pull the legacy server into their module graph", async () => {
  assert.equal(typeof host.startRustNativeHost, "function");
  assert.equal("startNativeHost" in host, false);
  assert.equal("NativeHostRouter" in host, false);
  assert.equal(typeof legacy.startNativeHost, "function");
  const result = await build({
    entryPoints: [
      "packages/native-host/src/index.ts",
      "packages/native-host/src/client.ts",
      "packages/native-host/src/pipe_authentication.ts",
    ],
    bundle: true, write: false, outdir: "unused-native-host-graph",
    metafile: true, platform: "node", format: "esm", packages: "external",
  });
  assert.deepEqual(Object.keys(result.metafile!.inputs).filter(path =>
    /native-host\/src\/(server|router|main|lifecycle_log)\.ts$/.test(path)), []);
});
