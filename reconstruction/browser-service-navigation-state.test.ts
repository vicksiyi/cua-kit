import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  startNavigation,
  accessibilityTargetKey,
  accessibilityDocumentKey,
  frameDepth,
  needsCaptureRetry,
  navigationChanged,
  isCaptureUsable,
} from "../packages/browser/src/service/accessibility/navigation_state";
const original = originalServiceBindings([
  "Lv",
  "$h",
  "Lr",
  "Uv",
  "W2",
  "jv",
  "$2",
]);
const state = {
  revision: 2,
  navigationRevision: 1,
  loading: false,
  committed: true,
  painted: true,
};
test("AX navigation transitions, target/document identity and cyclic frame depth match original", () => {
  for (const loading of [false, true]) {
    const expected = { ...state, loading },
      actual = { ...expected };
    for (let i = 0; i < 3; i++) {
      original.Lv(expected);
      startNavigation(actual);
      assert.deepEqual(actual, expected);
    }
  }
  for (const target of [
    { tabId: 1 },
    { tabId: 1, sessionId: "session", targetId: "target" },
    { tabId: 1, sessionId: "", targetId: "target" },
    { tabId: 2, targetId: "target" },
  ])
    assert.equal(accessibilityTargetKey(target), original.$h(target));
  for (const frame of [undefined, "", "frame"])
    for (const loader of [undefined, "", "loader"])
      assert.equal(
        accessibilityDocumentKey(frame, loader),
        original.Lr(frame, loader),
      );
  const frames = new Map([
    ["root", { frameId: "root" }],
    ["child", { frameId: "child", parentFrameId: "root" }],
    ["orphan", { frameId: "orphan", parentFrameId: "missing" }],
    ["loop", { frameId: "loop", parentFrameId: "loop" }],
    ["a", { frameId: "a", parentFrameId: "b" }],
    ["b", { frameId: "b", parentFrameId: "a" }],
  ]);
  for (const frame of frames.values())
    assert.equal(frameDepth(frame, frames), original.Uv(frame, frames));
  for (const current of [
    state,
    { ...state, revision: 3 },
    { ...state, navigationRevision: 2 },
    { ...state, loading: true },
    { ...state, documentId: "other" },
  ])
    assert.equal(
      navigationChanged(state, current),
      original.jv(state, current),
    );
});
test("AX capture retry and readiness preserve original thresholds and URL semantics", () => {
  for (const elementCount of [0, 2, 3, 9, 10, 49, 50, 99, 100, 150])
    for (const documentElementCount of [undefined, 149, 150, 299, 300])
      for (const documentTextLength of [undefined, 3999, 4000]) {
        const current = { ...state, documentElementCount, documentTextLength };
        assert.equal(
          needsCaptureRetry(elementCount, current),
          original.W2(elementCount, current),
        );
      }
  const urls = [
    undefined,
    "https://example.com/a?x=1#old",
    "http://example.com:8080/a?y=2",
    "https://other.com/a",
    "https://example.com/b",
    "invalid",
  ];
  for (const url of urls)
    for (const candidateUrl of urls)
      for (const elementCount of [2, 3, 9, 10])
        for (const painted of [false, true])
          for (const tabStatus of [undefined, "complete"])
            for (const javaScriptDialogId of [undefined, "dialog"]) {
              const candidate = { elementCount, url: candidateUrl },
                current = {
                  ...state,
                  url,
                  painted,
                  tabStatus,
                  javaScriptDialogId,
                };
              assert.equal(
                isCaptureUsable(candidate, current),
                original.$2(candidate, current),
              );
            }
  assert.equal(
    isCaptureUsable(
      { elementCount: 10, url: "http://example.com:8080/a?other" },
      { ...state, url: "https://example.com/a#old" },
    ),
    true,
  );
});
