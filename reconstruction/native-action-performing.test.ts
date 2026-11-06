import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const exec = promisify(execFile);
test("native action execution preserves original tolerated errors", {
  skip: process.platform !== "darwin", timeout: 60000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-perform-"));
  try {
    const output = join(directory, "settable");
    await exec("xcrun", ["swiftc",
      ...["UIElementError", "UIElementAction", "AXAttributeReading", "AXProcessID", "AXActionPerforming"].map(name => resolve(`native/macos/Sources/CuaHelper/${name}.swift`)),
      resolve("native/macos/Tests/AXActionPerformingTests.swift"), "-o", output]);
    const result = await exec(output);
    assert.match(result.stdout, /native action status policy preserves tolerated and throwing errors without retries/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
