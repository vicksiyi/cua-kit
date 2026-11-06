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
  "native selected-text getter preserves fallback, empty values and error handling",
  { skip: process.platform !== "darwin", timeout: 60_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "cua-selected-text-"));
    try {
      const executable = join(directory, "selected-text-tests");
      await exec("xcrun", [
        "swiftc",
        join(root, "native/macos/Sources/CuaHelper/SelectedText.swift"),
        "-o",
        executable,
        join(
          root,
          "native/macos/Sources/CuaHelper/AccessibilityTreePresentation.swift",
        ),
        join(root, "native/macos/Tests/SelectedTextTests.swift"),
      ]);
      const { stdout } = await exec(executable);
      assert.match(stdout, /10 native selected-text cases passed/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
