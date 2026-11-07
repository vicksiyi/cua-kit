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
test("SoftLink ULEB128 preserves native decoding and offsets", {
  skip: process.platform !== "darwin", timeout: 60_000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-policy-result-"));
  try {
    const executable = join(directory, "test");
    await exec("xcrun", ["swiftc", "-o", executable,
      join(root, "native/macos/Sources/SoftLink/ULEB128.swift"),
      join(root, "native/macos/Tests/SoftLinkULEB128Tests.swift")]);
    const { stdout } = await exec(executable);
    assert.match(stdout, /SoftLink ULEB128 values, truncation and consumed offsets passed/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
