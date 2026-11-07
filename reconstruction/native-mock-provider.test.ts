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
  "Mock provider dispatch preserves lookup and result boundaries",
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
        join(root, "native/macos/Sources/CuaHelper/ColdCacheAttributeSelection.swift"),
        join(root, "native/macos/Sources/CuaHelper/PrefetchedUIElementCache.swift"),
        join(root, "native/macos/Sources/CuaHelper/FallbackUIElementCache.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementCacheConstruction.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXMultipleAttributeReading.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementAction.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXUIElementProtocol.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXMockProvider.swift"),
        join(root, "native/macos/Tests/AXMockProviderTests.swift"),
      ]);
      const { stdout } = await exec(executable);
      assert.match(
        stdout,
        /Provider dispatch preserves misses, nil results, failures, identity and per-call lookup/,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
