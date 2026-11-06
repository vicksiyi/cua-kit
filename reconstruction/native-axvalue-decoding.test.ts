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
  "native AXValue decoding preserves cast precedence and error boundaries",
  { skip: process.platform !== "darwin", timeout: 60_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "cua-axvalue-decode-"));
    try {
      const executable = join(directory, "axvalue-tests");
      await exec("xcrun", [
        "swiftc",
        join(root, "native/macos/Sources/CuaHelper/UIElementError.swift"),
        "-o",
        executable,
        join(root, "native/macos/Sources/CuaHelper/AXValueUnpacking.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXValueDecoding.swift"),
        join(root, "native/macos/Tests/AXValueDecodingTests.swift"),
      ]);
      const { stdout } = await exec(executable);
      assert.match(stdout, /22 native AXValue decoding cases passed/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
