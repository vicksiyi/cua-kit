import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, chmod, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import {
  discoverEndpointFiles,
  IndependentBrowserUnavailableError,
} from "../packages/native-host/src/endpoint_configuration";

test("missing or empty browser host produces actionable CLI diagnostics before model startup", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "core-cli-startup-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [directory, reason] of [
    [root, "no_endpoints"],
    [join(root, "missing"), "directory_missing"],
  ]) {
    await assert.rejects(
      discoverEndpointFiles(directory),
      (error: unknown) =>
        error instanceof IndependentBrowserUnavailableError &&
        error.reason === reason,
    );
    const env = { ...process.env };
    delete env.DEEPSEEK_API_KEY;
    delete env.CORE_CUA_ENDPOINT_FILES;
    env.CUA_NATIVE_SUPERVISOR_PATH = "/not-invoked-before-browser-discovery";
    env.CORE_CUA_HOST_DIRECTORY = directory;
    env.CUA_MCP_ENV = JSON.stringify({
      CUA_REPL_ENABLED_SURFACES: "browser",
      CUA_REPL_BROWSER_ENV: "codex-app",
    });
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "packages/agent-loop/src/restored-demo.ts",
        "--check-browser",
      ],
      { env, encoding: "utf8", timeout: 10000 },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /chrome:\/\/extensions/);
    assert.match(result.stderr, /npm run demo:deepseek -- --check-browser/);
    assert.match(result.stderr, /没有发送 DeepSeek 请求/);
    assert.doesNotMatch(result.stderr, /\n\s+at |DEEPSEEK_API_KEY/);
  }
});

test("unsafe endpoint permissions are not disguised as a missing connection", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "core-cli-private-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await chmod(root, 0o755);
  await assert.rejects(
    discoverEndpointFiles(root),
    (error: unknown) =>
      error instanceof Error &&
      !(error instanceof IndependentBrowserUnavailableError) &&
      /private/.test(error.message),
  );
});
