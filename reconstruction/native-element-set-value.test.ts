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
  "native generic setter preserves encoding and resolution order",
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
        join(root, "native/macos/Sources/CuaHelper/AXDynamicParameterEncoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXAttributeWriting.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementSetValue.swift"),
        join(root, "native/macos/Tests/UIElementSetValueTests.swift"),
      ]);
      const { stdout } = await exec(executable);
      assert.match(
        stdout,
        /native generic setter encodes before resolution and preserves write failures/,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
