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
test("native policy result composes canonical target and approval metadata", {
  skip: process.platform !== "darwin", timeout: 60_000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-policy-result-"));
  try {
    const executable = join(directory, "test");
    await exec("xcrun", ["swiftc", "-o", executable,
      ...["NativeComputerUsePolicy", "NativeForbiddenTargets", "BundleWebClassification", "NativePolicyApprovalMetadata", "NativeApplicationTarget", "NativeAppPolicyResult"].map(name => join(root, `native/macos/Sources/CuaHelper/${name}.swift`)),
      join(root, "native/macos/Tests/NativeAppPolicyResultTests.swift")]);
    const { stdout } = await exec(executable);
    assert.match(stdout, /native policy result canonical paths, display-name fallback, ordering and IPC projection passed/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
