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
test("Parent node defaults honor generic roles and witness overrides", {
  skip: process.platform !== "darwin", timeout: 60_000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-node-defaults-"));
  try {
    const executable = join(directory, "test");
    await exec("xcrun", ["swiftc", "-o", executable,
      ...["UIElementRole", "AccessibilityRole", "AccessibilityPresentationAction", "UIElementFlattenedRole", "AccessibilityNode", "AccessibilityNodeDefaults"].map(name => join(root, `native/macos/Sources/CuaHelper/${name}.swift`)),
      join(root, "native/macos/Tests/AccessibilityNodeDefaultsTests.swift")]);
    const { stdout } = await exec(executable);
    assert.match(stdout, /Node defaults preserve generic roles, lazy reads and conformer overrides/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
