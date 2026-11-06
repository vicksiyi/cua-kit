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
  "native frame read preserves typed decoding and fallback order",
  { skip: process.platform !== "darwin", timeout: 60_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "cua-axread-"));
    try {
      const executable = join(directory, "axvalue-tests");
      await exec("xcrun", [
        "swiftc",
        join(root, "native/macos/Sources/CuaHelper/UIElementFrame.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXRectDecoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementError.swift"),
        "-o",
        executable,
        join(root, "native/macos/Sources/CuaHelper/AXTextMarkers.swift"),
                join(root, "native/macos/Sources/CuaHelper/UIElementAttribute.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementStorage.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXAttributeReading.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXProcessID.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXStoredValue.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXValueDescriptors.swift"),
                join(root, "native/macos/Sources/CuaHelper/AXStringDecoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementCachedValue.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementAttributeValue.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementUncachedValue.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementAttributeSupport.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXOrdinaryValueDecoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXValueDecoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXValueUnpacking.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXArrayTargetConversion.swift"),
        join(root, "native/macos/Sources/CuaHelper/TypeErasedArray.swift"),
        join(root, "native/macos/Tests/UIElementFrameTests.swift"),
      ]);
      const { stdout } = await exec(executable);
      assert.match(
        stdout,
        /frame read preserves cache, strict decode, error reporting and position-size fallback/,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
