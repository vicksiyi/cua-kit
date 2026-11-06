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
  "native stored AX values preserve CF identity and partial descriptors",
  { skip: process.platform !== "darwin", timeout: 60_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "cua-axread-"));
    try {
      const executable = join(directory, "axvalue-tests");
      await exec("xcrun", [
        "swiftc",
        "-o",
        executable,
        join(root, "native/macos/Sources/CuaHelper/AXStoredValue.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXValueDescriptors.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXPartialArrayDecoding.swift"),
        join(root, "native/macos/Tests/AXStoredValueTests.swift"),
      ]);
      const { stdout } = await exec(executable);
      assert.match(
        stdout,
        /native stored AX values preserve CF type checks, identity and partial descriptors/,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
