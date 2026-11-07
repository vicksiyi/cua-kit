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
test("Hierarchy reader composes copy and recursive decoding", {
  skip: process.platform !== "darwin", timeout: 60_000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-hierarchy-reading-"));
  try {
    const executable = join(directory, "test");
    await exec("xcrun", ["swiftc", "-o", executable,
      ...["AXStoredValue", "AXValueDescriptors", "AXHierarchyPartialValue", "AXHierarchyDecoding", "AXHierarchyCopy", "AXHierarchyOptions", "AXHierarchyReading", "UIElementAttribute", "AXAttributeReading", "AXProcessID", "UIElementError"].map(name => join(root, `native/macos/Sources/CuaHelper/${name}.swift`)),
      join(root, "native/macos/Tests/AXHierarchyReadingTests.swift")]);
    const { stdout } = await exec(executable);
    assert.match(stdout, /Hierarchy reader preserves recursive configuration and native call composition/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
