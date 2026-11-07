import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, readdir } from "node:fs/promises";
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
      const nativeRoot = join(root, "native/macos");
      await exec("swift", ["build", "--package-path", nativeRoot, "--target", "CuaHelper"], { maxBuffer: 4 * 1024 * 1024 });
      const build = join(nativeRoot, ".build/debug");
      const dependencyObjects: string[] = [];
      for (const target of ["SoftLink", "Algorithms", "RealModule", "_NumericsShims"]) {
        const directory = join(build, `${target}.build`);
        for (const name of await readdir(directory))
          if (name.endsWith(".o")) dependencyObjects.push(join(directory, name));
      }
      await exec("xcrun", [
        "swiftc", "-I", join(build, "Modules"), ...dependencyObjects,
        "-Xcc", `-fmodule-map-file=${join(nativeRoot, ".build/checkouts/swift-numerics/Sources/_NumericsShims/include/module.modulemap")}`,
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
        join(root, "native/macos/Sources/CuaHelper/UIElementIdentity.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementProviderActionGetters.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementActions.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementDisclosure.swift"),

        join(root, "native/macos/Sources/CuaHelper/UIElementCachedTypedValues.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXURLDecoding.swift"),

        join(root, "native/macos/Sources/CuaHelper/UIElementProviderCapabilities.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementSelectionState.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXUInt64Decoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementEnabled.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementFocusCapability.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementSelectionCapability.swift"),

        join(root, "native/macos/Sources/CuaHelper/UIElementProviderGeometry.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementInsideWebView.swift"),

        join(root, "native/macos/Sources/CuaHelper/UIElementProviderScrollBar.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementScrollBarValue.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementScrollUsingScrollBar.swift"),
        join(root, "native/macos/Sources/CuaHelper/ScrollBarUIElement.swift"),
        join(root, "native/macos/Sources/CuaHelper/ScrollBarPageButton.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXScrollBarDecoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementSystemCollection.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementActionDispatch.swift"),

        join(root, "native/macos/Sources/CuaHelper/UIElementProviderCollection.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementCollectionValue.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementVisibleChildren.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementCount.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXUIElementCollectionDecoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXArrayElementDecoding.swift"),

        join(root, "native/macos/Sources/CuaHelper/AXConcreteUIElementDecoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXElementConstruction.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementParentValue.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementParentChain.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementProviderParent.swift"),

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
        join(root, "native/macos/Sources/CuaHelper/UIElementFrame.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXRectDecoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementUncachedValue.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementAttributeSupport.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXUIElementProtocol.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXMockProvider.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXProviderIdentity.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXSingleAttributeReading.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXPointDecoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXSizeDecoding.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementGeometry.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXProviderReading.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXProviderQuerySystem.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXHitTesting.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXProviderIdentitySystem.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementProviderConstruction.swift"),
        join(root, "native/macos/Tests/AXMockProviderFixture.swift"),
        join(root, "native/macos/Sources/CuaHelper/AccessibilitySPI.swift"),
        join(root, "native/macos/Sources/CuaHelper/AccessibilitySPIBindings.swift"),
        join(root, "native/macos/Sources/CuaHelper/AccessibilitySPISymbolRequest.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXProviderIdentitySPI.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXReadThreadDispatch.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXArraySubsetReading.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXArraySubsetSystem.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXArrayCount.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXProviderCollections.swift"),
        join(root, "native/macos/Sources/CuaHelper/NativeLogger.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXReadErrorLogging.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXUIElementConformance.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementSetValue.swift"),
        join(root, "native/macos/Sources/CuaHelper/UIElementProviderSetValue.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXDynamicParameterEncoding.swift"),

        join(root, "native/macos/Sources/CuaHelper/AXProviderOperations.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXProviderOperationsSystem.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXAttributeSettable.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXAttributeWriting.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXActionReading.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXActionDescriptionReading.swift"),
        join(root, "native/macos/Sources/CuaHelper/AXActionPerforming.swift"),
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
