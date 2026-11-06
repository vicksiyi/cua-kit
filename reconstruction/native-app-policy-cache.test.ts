import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
test("native policy provider cache preserves expiry and error semantics", {
  skip: process.platform !== "darwin", timeout: 60_000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-policy-cache-"));
  try {
    const executable = join(directory, "test");
    await exec("xcrun", ["swiftc", "-o", executable,
      join(root, "native/macos/Sources/CuaHelper/NativeAppPolicyCache.swift"),
      join(root, "native/macos/Tests/NativeAppPolicyCacheTests.swift")]);
    const { stdout } = await exec(executable);
    assert.match(stdout, /native policy cache expiry, request-start timestamp, errors and clock rollback passed/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
