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
  "native AX descriptors preserve nil, subset coverage and half-open ranges",
  { skip: process.platform !== "darwin", timeout: 60_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "cua-ax-descriptors-"));
    try {
      const executable = join(directory, "axvalue-tests");
      await exec("xcrun", [
        "swiftc",
        "-o",
        executable,
        join(root, "native/macos/Sources/CuaHelper/AXValueDescriptors.swift"),
        join(root, "native/macos/Tests/AXValueDescriptorsTests.swift"),
      ]);
      const { stdout } = await exec(executable);
      assert.match(stdout, /12 native AX descriptor cases passed/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
