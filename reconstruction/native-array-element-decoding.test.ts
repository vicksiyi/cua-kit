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
  "native array compactMap uses typed AX decoding and preserves remaining order",
  { skip: process.platform !== "darwin", timeout: 60_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "cua-array-elements-"));
    try {
      const executable = join(directory, "axvalue-tests");
      await exec("xcrun", [
        "swiftc",
        "-o",
        executable,
        join(root, "native/macos/Sources/CuaHelper/AXValueDescriptors.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXPartialArrayDecoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementError.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXValueUnpacking.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXValueDecoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXArrayElementDecoding.swift"),

        join(root, "native/macos/Tests/AXArrayElementDecodingTests.swift"),
      ]);
      const { stdout } = await exec(executable);
      assert.match(stdout, /7 native array element decoding checks passed/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
