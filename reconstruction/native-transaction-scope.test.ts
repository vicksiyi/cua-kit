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
  "Full transaction task-local scope restores nested and throwing work",
  { skip: process.platform !== "darwin", timeout: 60_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "cua-transaction-scope-"));
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
                join(root, "native/macos/Sources/CuaHelper/UIElementRole.swift"),
        join(root, "native/macos/Sources/CuaHelper/AccessibilityRole.swift"),
        join(root, "native/macos/Sources/CuaHelper/AccessibilityPresentationAction.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementFlattenedRole.swift"),
        join(root, "native/macos/Sources/CuaHelper/AccessibilityNode.swift"),
        join(root, "native/macos/Sources/CuaHelper/AccessibilityNodeDefaults.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementProtocol.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementAction.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementActionDescription.swift"),
        join(root, "native/macos/Sources/CuaHelper/FrequencyTable.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementTreeTransaction.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementScopedConstruction.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXStringDecoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXBoolDecoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementCachedValue.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementCachedRole.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementAttributeValue.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXOrdinaryValueDecoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXValueDecoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXValueUnpacking.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXArrayTargetConversion.swift"),
        join(root, "native/macos/Sources/CuaHelper/TypeErasedArray.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementRoleFrequency.swift"),
        join(root, "native/macos/Sources/CuaHelper/SubtreeAttributeSelection.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementSubtreeTransaction.swift"),
        join(root, "native/macos/Tests/UIElementTreeTransactionTests.swift"),
      ]);
      const { stdout } = await exec(executable);
      assert.match(
        stdout,
        /Complete transaction scope preserves roots, nesting, flags and throwing restoration/,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
