import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const exec = promisify(execFile);
test("native action description reader preserves system status and strings", {
  skip: process.platform !== "darwin", timeout: 60000,
}, async () => {
  const root = resolve("native/macos");
  const directory = await mkdtemp(join(tmpdir(), "cua-action-description-"));
  try {
    const output = join(directory, "descriptions");
    await exec("xcrun", ["swiftc",
      ...["UIElementError", "UIElementAction", "AXActionDescriptionReading", "UIElementActionDescription"].map(name => join(root, `Sources/CuaHelper/${name}.swift`)),
      join(root, "Tests/AXActionDescriptionReadingTests.swift"), "-o", output]);
    const result = await exec(output);
    assert.match(result.stdout, /native action descriptions preserve errors, nil and exact strings/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("native custom action descriptions preserve precedence and Scanner semantics", {
  skip: process.platform !== "darwin", timeout: 60000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-action-descriptors-"));
  try {
    const output = join(directory, "descriptors");
    await exec("xcrun", ["swiftc",
      ...["UIElementAction", "UIElementActionDescription"].map(name => resolve(`native/macos/Sources/CuaHelper/${name}.swift`)),
      resolve("native/macos/Tests/UIElementActionDescriptionTests.swift"), "-o", output]);
    const result = await exec(output);
    assert.match(result.stdout, /native action description precedence, Scanner and fallbacks verified/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
