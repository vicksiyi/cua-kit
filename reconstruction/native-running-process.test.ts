import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const exec = promisify(execFile);
test("Objective-C process queries match current process and normalized executable path", { skip: process.platform !== "darwin" }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-running-process-"));
  try {
    const executable = join(directory, "test");
    await exec("xcrun", ["clang", "-fobjc-arc", "-framework", "Foundation", "-I", "native/macos/Sources/RunningProcess/include", "native/macos/Sources/RunningProcess/SAIRunningProcess.m", "native/macos/Tests/RunningProcessTests.m", "-o", executable]);
    const { stdout } = await exec(executable);
    assert.match(stdout, /Objective-C running process query validates copy, PID, UID, name and symlink filtering/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
