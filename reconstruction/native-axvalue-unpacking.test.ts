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
  "native AXValue unpacker uses real system values and preserves failure boundaries",
  { skip: process.platform !== "darwin", timeout: 60_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "cua-axvalue-"));
    try {
      const executable = join(directory, "axvalue-tests");
      await exec("xcrun", [
        "swiftc",
        join(root, "native/macos/Sources/CuaHelper/UIElementError.swift"),
        "-o",
        executable,
        join(root, "native/macos/Sources/CuaHelper/AXValueUnpacking.swift"),
        join(root, "native/macos/Tests/AXValueUnpackingTests.swift"),
      ]);
      const { stdout } = await exec(executable);
      assert.match(stdout, /12 native AXValue unpacking cases passed/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
