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

test(
  "native Swift presentation preserves recovered formatting and selection precedence",
  { skip: process.platform !== "darwin", timeout: 60_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "cua-presentation-"));
    try {
      const executable = join(directory, "presentation-tests");
      await exec("xcrun", [
        "swiftc",
        "-o",
        executable,
        join(
          root,
          "native/macos/Sources/CuaHelper/AccessibilityTreePresentation.swift",
        ),
        join(
          root,
          "native/macos/Tests/AccessibilityTreePresentationTests.swift",
        ),
      ]);
      const { stdout } = await exec(executable);
      assert.match(stdout, /10 native presentation formatting cases passed/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
