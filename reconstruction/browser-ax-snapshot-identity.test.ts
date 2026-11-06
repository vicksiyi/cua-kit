import test from "node:test";
import assert from "node:assert/strict";
import {
  AccessibilityStateStore,
  StaleAccessibilityCaptureError,
} from "../packages/browser/src/service/accessibility/state_store";
import { accessibilityDocumentKey } from "../packages/browser/src/service/accessibility/navigation_state";
import {
  serviceClassMethod,
  serviceClassWithMethods,
  serviceSourceSha256,
} from "./service-source";
assert.equal(
  serviceSourceSha256,
  "396d4bcd890e8e41e336469eb1a050bafd36bb2d91152b75bb22b70b56622021",
);
const names = [
  "commitCapture",
  "targetForSnapshot",
  "validateCapture",
  "discardCapture",
];
const cls = serviceClassWithMethods(names);
const original = new Function(
  "Bo",
  "Nr",
  "return {" + names.map((n) => serviceClassMethod(cls, n)).join(",") + "}",
)(StaleAccessibilityCaptureError, accessibilityDocumentKey);
test("AX snapshot identities reject replaced captures and clear only the matching snapshot", () => {
  for (const source of [true, false]) {
    const store = new AccessibilityStateStore(
      { getJsDialog: () => undefined } as any,
      () => "session",
      false,
    );
    if (source) Object.assign(store, original);
    const state = store.currentState(7);
    state.mainFrameId = "main";
    state.loaderId = "loader";
    const key = accessibilityDocumentKey("main", "loader");
    const capture = () =>
      store.commitCapture(state, {
        documentKey: key,
        candidate: {
          documentKey: key,
          frames: new Map(),
          targets: new Map([
            [
              "button",
              { target: { tabId: 7 }, backendNodeId: 42, frameId: "main" },
            ],
          ]),
          accessibilityRevision: {
            text: "button",
            identityForElement: () => "button",
          },
          tab: { id: 7, title: "fixture" },
          rendered: "button",
        },
      })!;
    const first = capture();
    assert.match(first.snapshotId!, /^[0-9a-f-]{36}$/);
    assert.equal(
      store.targetForSnapshot(7, first.snapshotId!, 1).backendNodeId,
      42,
    );
    store.validateCapture(7, first);
    const second = capture();
    assert.notEqual(second.snapshotId, first.snapshotId);
    assert.throws(
      () => store.validateCapture(7, first),
      StaleAccessibilityCaptureError,
    );
    assert.throws(
      () => store.targetForSnapshot(7, first.snapshotId!, 1),
      StaleAccessibilityCaptureError,
    );
    store.discardCapture(7, first);
    assert.equal(state.snapshotId, second.snapshotId);
    assert.equal(state.targets.size, 1);
    const target = state.targets.get("button")!;
    target.frameId = "child";
    assert.throws(
      () => store.targetForSnapshot(7, second.snapshotId!, 1),
      StaleAccessibilityCaptureError,
    );
    target.frameId = "main";
    target.javaScriptDialog = { dialogID: "dialog", control: "confirm" };
    // Align the lower-level target validity check so the SIWC dialog rejection is exercised.
    store.cdp.getJsDialog = () => ({ id: "dialog", type: "confirm" });
    assert.throws(
      () => store.targetForSnapshot(7, second.snapshotId!, 1),
      StaleAccessibilityCaptureError,
    );
    store.discardCapture(7, second);
    assert.equal(state.snapshotId, undefined);
    assert.equal(state.accessibilityRevision, undefined);
    assert.equal(state.targets.size, 0);
    assert.throws(
      () => store.validateCapture(7, second),
      StaleAccessibilityCaptureError,
    );
    const screenshot = store.commitCapture(state, {
      documentKey: key,
      data: "fixture-image",
    })!;
    assert.equal(screenshot.snapshotId, undefined);
    assert.equal(screenshot.data, "fixture-image");
  }
});
