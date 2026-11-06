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
  "native typed attribute dispatch preserves cache values and fallback flags",
  { skip: process.platform !== "darwin", timeout: 60_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "cua-attribute-"));
    try {
      const executable = join(directory, "attribute-tests");
      await exec("xcrun", [
        "swiftc",
        join(root, "native/macos/Sources/CuaHelper/SelectedText.swift"),
        "-o",
        executable,
        join(
          root,
          "native/macos/Sources/CuaHelper/UIElementAttributeValue.swift",
        ),
        join(root, "native/macos/Tests/UIElementAttributeValueTests.swift"),
      ]);
      const { stdout } = await exec(executable);
      assert.match(stdout, /8 native attribute dispatch cases passed/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
