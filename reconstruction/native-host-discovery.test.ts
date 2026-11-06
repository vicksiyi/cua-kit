import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdtemp, rm, symlink, realpath } from "node:fs/promises";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { startRustNativeHost } from "../packages/native-host/src/native_process";
import { discoverEndpointFiles } from "../packages/native-host/src/endpoint_configuration";
import { configureIndependentBrowser } from "../packages/agent-loop/src/independent-browser";

test("configured private directory discovers actual host and cleans up after shutdown", async (t) => {
  const root = await realpath(await mkdtemp("/tmp/core-discovery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(
    discoverEndpointFiles(root),
    /No independent browser host/,
  );
  const host = await startRustNativeHost(new PassThrough(), new PassThrough(), {
    parentDirectory: root,
  });
  t.after(() => host.close());
  assert.deepEqual(await discoverEndpointFiles(root), [host.endpointFile]);
  const configured = await configureIndependentBrowser({
    CUA_REPL_ENABLED_SURFACES: "browser",
    CORE_CUA_HOST_DIRECTORY: root,
  });
  assert.deepEqual(JSON.parse(configured.CORE_CUA_ENDPOINT_FILES), [
    host.endpointFile,
  ]);
  assert.equal(configured.BROWSER_USE_BACKEND_PATHS, host.endpoint.socketPath);
  assert.ok(!JSON.stringify(configured).includes(host.endpoint.token));
  await host.close();
  await assert.rejects(
    discoverEndpointFiles(root),
    /No independent browser host/,
  );
});

test("discovery and host refuse shared or symlinked endpoint roots", async (t) => {
  const root = await realpath(await mkdtemp("/tmp/core-discovery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const link = join(root, "link");
  await symlink(root, link);
  await assert.rejects(discoverEndpointFiles(link), /private/);
  await chmod(root, 0o755);
  await assert.rejects(discoverEndpointFiles(root), /private/);
  await assert.rejects(
    startRustNativeHost(new PassThrough(), new PassThrough(), {
      parentDirectory: root,
    }),
    /private/,
  );
});
