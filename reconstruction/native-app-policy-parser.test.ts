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
test("native policy parser preserves strict response decoding", {
  skip: process.platform !== "darwin", timeout: 60_000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-policy-parser-"));
  try {
    const executable = join(directory, "test");
    await exec("xcrun", ["swiftc", "-o", executable,
      join(root, "native/macos/Sources/CuaHelper/NativeComputerUsePolicy.swift"),
      join(root, "native/macos/Sources/CuaHelper/NativeForbiddenTargets.swift"),
      join(root, "native/macos/Tests/NativeComputerUsePolicyTests.swift")]);
    const { stdout } = await exec(executable);
    assert.match(stdout, /native policy parser defaults, conjunction, strict types and separate rule maps passed/);
    assert.match(stdout, /72 app access combinations and forbidden classifier ordering passed/);
    assert.match(stdout, /24 normal forbidden targets and exact-match boundaries passed/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
