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
test("native approval metadata preserves risk and persistence semantics", {
  skip: process.platform !== "darwin", timeout: 60_000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-approval-metadata-"));
  try {
    const executable = join(directory, "test");
    await exec("xcrun", ["swiftc", "-o", executable,
      ...["NativeComputerUsePolicy", "NativeForbiddenTargets", "BundleWebClassification", "NativePolicyApprovalMetadata"].map(name => join(root, `native/macos/Sources/CuaHelper/${name}.swift`)),
      join(root, "native/macos/Tests/NativePolicyApprovalMetadataTests.swift")]);
    const { stdout } = await exec(executable);
    assert.match(stdout, /native approval metadata risk lists, lazy HTTP probe and persistence passthrough passed/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
