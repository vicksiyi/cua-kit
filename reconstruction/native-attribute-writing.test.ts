import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const exec = promisify(execFile);
test("native writes preserve encoded values and strict error policy", {
  skip: process.platform !== "darwin", timeout: 60000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-write-"));
  try {
    const output = join(directory, "settable");
    await exec("xcrun", ["swiftc",
      ...["UIElementError", "UIElementAttribute", "AXAttributeReading", "AXProcessID", "AXAttributeWriting", "AXStoredValue", "AXValueDescriptors"].map(name => resolve(`native/macos/Sources/CuaHelper/${name}.swift`)),
      resolve("native/macos/Tests/AXAttributeWritingTests.swift"), "-o", output]);
    const result = await exec(output);
    assert.match(result.stdout, /native writes preserve encoded identity and reject every AX error/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
