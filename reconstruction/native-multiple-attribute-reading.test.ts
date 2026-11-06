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
  "native AX multiple attribute reads preserve status and per-value mapping",
  { skip: process.platform !== "darwin", timeout: 60_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "cua-axread-"));
    try {
      const executable = join(directory, "axvalue-tests");
      await exec("xcrun", [
        "swiftc",
        join(root, "native/macos/Sources/CuaHelper/UIElementError.swift"),
        "-o",
        executable,
        join(root, "native/macos/Sources/CuaHelper/AXTextMarkers.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXParameterEncoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementAttribute.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementStorage.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXStoredValue.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXValueDescriptors.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXAttributeReading.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXProcessID.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXMultipleAttributeReading.swift"),
        join(root, "native/macos/Tests/AXMultipleAttributeReadingTests.swift"),
      ]);
      const { stdout } = await exec(executable);
      await assert.rejects(exec(executable, ["--short-output"]), (error: any) => {
        assert.match(error.stderr, /AX batch values are shorter/);
        return true;
      });
      assert.match(
        stdout,
        /native AX batch statuses, ordered overwrite.removal, errors and null values passed/,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
