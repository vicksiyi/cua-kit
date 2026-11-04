import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  parseLeaseViewport,
  parseTabLease,
  parseStoredLeases,
  parsePendingViewports,
  matchesSourceLease,
} from "../packages/browser-extension/src/lease_codec";
const original = extensionBindings(
  [
    "by",
    "wy",
    "yy",
    "Du",
    "Sy",
    "Ey",
    "Ty",
    "Iy",
    "hc",
    "Cp",
    "cs",
    "ls",
    "Sr",
  ],
  {},
);
const lease: any = {
  tabId: 1,
  sessionId: "s",
  turnId: "t",
  origin: "agent",
  claimedAt: 10,
  instanceId: null,
  state: "active",
};
test("extension lease decoding preserves original persisted structure and request-header validation", () => {
  const cases: any[] = [undefined, null, 1, [], {}, lease];
  for (const [key, values] of Object.entries({
    tabId: [-1, 0, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1, "1"],
    sessionId: [undefined, "", 1],
    turnId: [undefined, "", 1],
    origin: ["user", "other"],
    claimedAt: [Infinity, NaN, -1, "1"],
    instanceId: [undefined, null, "id", 1],
    state: ["handoff", "other"],
    requestHeaders: [
      null,
      [],
      [{ name: "Cookie", value: "bad" }],
      [{ name: "X", value: "{{session_id}}" }],
    ],
    requestHeaderEnabled: [false, true, 1],
    mark: ["handoff", "deliverable", "close"],
    isActiveHandoff: [true, false, "true"],
    viewportSize: [
      undefined,
      null,
      {},
      { width: 1, height: 2 },
      { width: 0, height: 1 },
    ],
  }))
    for (const value of values) cases.push({ ...lease, [key]: value });
  for (const value of cases) {
    assert.deepEqual(parseTabLease(value), original.Sy(value));
    assert.deepEqual(
      parseStoredLeases({ leases: { "1": value } }),
      original.Ey({ leases: { "1": value } }),
    );
  }
  for (const stored of [
    null,
    {},
    { leases: [] },
    {
      leases: {
        "01": lease,
        "2": lease,
        bad: lease,
        "-1": { ...lease, tabId: -1 },
      },
    },
    Object.create({ leases: { "1": lease } }),
  ])
    assert.deepEqual(parseStoredLeases(stored), original.Ey(stored));
});
test("extension viewport decoding and lease identity retain null, key matching and excluded mutable fields", () => {
  for (const value of [
    undefined,
    null,
    false,
    [],
    {},
    { width: 1, height: 2 },
    { width: Number.MAX_SAFE_INTEGER + 1, height: 2 },
    { width: 1.5, height: 2 },
    { width: 0, height: 2 },
    { width: Infinity, height: 2 },
  ]) {
    assert.deepEqual(parseLeaseViewport(value), original.Du(value));
    const stored = {
      pendingViewportSizes: {
        s: { turnId: "", viewportSize: value },
        bad: { turnId: 1, viewportSize: value },
        null: null,
      },
    };
    assert.deepEqual(parsePendingViewports(stored), original.Ty(stored));
  }
  for (const field of [
    "tabId",
    "sessionId",
    "turnId",
    "origin",
    "claimedAt",
    "instanceId",
    "state",
    "isActiveHandoff",
    "requestHeaders",
    "requestHeaderEnabled",
    "viewportSize",
    "mark",
  ]) {
    const changed = { ...lease, [field]: "changed" };
    assert.equal(
      matchesSourceLease(changed, lease),
      original.Iy(changed, lease),
    );
  }
  assert.equal(
    matchesSourceLease(
      { ...lease, mark: "deliverable", requestHeaderEnabled: true },
      lease,
    ),
    true,
  );
  assert.equal(matchesSourceLease(null, lease), false);
});
