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
  "native scrollbar page-button discovery composes with restored execution",
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
                join(root, "native/macos/Sources/CuaHelper/UIElementAttribute.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementStorage.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXAttributeReading.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXProcessID.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXStoredValue.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXValueDescriptors.swift"),
                join(root, "native/macos/Sources/CuaHelper/AXStringDecoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXBoolDecoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementCachedValue.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementRole.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementCachedRole.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementDescriptiveAttributes.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementCachedDescription.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementEnabled.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementFocusCapability.swift"),
        join(root, "native/macos/Tests/UIElementEnabledTests.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementAttributeValue.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXOrdinaryValueDecoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXValueDecoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXValueUnpacking.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXArrayTargetConversion.swift"),
        join(root, "native/macos/Sources/CuaHelper/TypeErasedArray.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementAction.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementActions.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementDisclosureActions.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementDisclosure.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementAttributeSupport.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementSystemDisclosure.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementSetValue.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXParameterEncoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXDynamicParameterEncoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXAttributeWriting.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXAttributeSettable.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementActionDispatch.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementScrollUsingScrollBar.swift"),
        join(root, "native/macos/Sources/CuaHelper/ScrollBarPageButton.swift"),
        join(root, "native/macos/Sources/CuaHelper/ScrollBarUIElement.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementScrollBarValue.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXElementConstruction.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXScrollBarDecoding.swift"),

        join(root, "native/macos/Sources/CuaHelper/UIElementCollectionValue.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementUncachedValue.swift"),

        join(root, "native/macos/Sources/CuaHelper/UIElementSystemCollection.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementVisibleChildren.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementCount.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXArrayCount.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXConcreteUIElementDecoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementParentValue.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementParentChain.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementInsideWebView.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementWebViewValue.swift"),

        join(root, "native/macos/Sources/CuaHelper/ColdCacheAttributeSelection.swift"),
        join(root, "native/macos/Sources/CuaHelper/PrefetchedUIElementCache.swift"),
        join(root, "native/macos/Sources/CuaHelper/FallbackUIElementCache.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementCacheConstruction.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXMultipleAttributeReading.swift"),

        join(root, "native/macos/Sources/CuaHelper/AXUIElementCollectionDecoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXUIElementDecoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXArrayElementDecoding.swift"),

        join(root, "native/macos/Tests/ScrollBarPageButtonTests.swift"),
      ]);
      const { stdout } = await exec(executable);
      assert.match(
        stdout,
        /native page-button discovery preserves role, subrole, first match and cached identity/,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
