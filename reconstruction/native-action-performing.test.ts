import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const exec = promisify(execFile);
test("native action execution preserves original tolerated errors", {
  skip: process.platform !== "darwin", timeout: 60000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-perform-"));
  try {
    const output = join(directory, "settable");
    await exec("xcrun", ["swiftc",
      ...["UIElementError", "UIElementAction", "AXAttributeReading", "AXProcessID", "AXActionPerforming"].map(name => resolve(`native/macos/Sources/CuaHelper/${name}.swift`)),
      resolve("native/macos/Tests/AXActionPerformingTests.swift"), "-o", output]);
    const result = await exec(output);
    assert.match(result.stdout, /native action status policy preserves tolerated and throwing errors without retries/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("native element dispatch preserves branch ordering and stops on errors", {
  skip: process.platform !== "darwin", timeout: 60000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-dispatch-"));
  try {
    const output = join(directory, "dispatch");
    await exec("xcrun", ["swiftc",
      ...["UIElementAction", "UIElementActionDispatch"].map(name => resolve(`native/macos/Sources/CuaHelper/${name}.swift`)),
      resolve("native/macos/Tests/UIElementActionDispatchTests.swift"), "-o", output]);
    const result = await exec(output);
    assert.match(result.stdout, /native action dispatch preserves disclosure precedence, scroll fallback and error propagation/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("native scrollbar execution composes with action dispatch without duplicate fallback", {
  skip: process.platform !== "darwin", timeout: 60000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-dispatch-"));
  try {
    const output = join(directory, "dispatch");
    await exec("xcrun", ["swiftc",
      ...["UIElementAction", "UIElementActionDispatch", "UIElementScrollUsingScrollBar"].map(name => resolve(`native/macos/Sources/CuaHelper/${name}.swift`)),
      resolve("native/macos/Tests/UIElementScrollUsingScrollBarTests.swift"), "-o", output]);
    const result = await exec(output);
    assert.match(result.stdout, /native scrollbar dispatch preserves axis, page button, fallback and thrown errors/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("native menu preparation composes with full action dispatch", {
  skip: process.platform !== "darwin", timeout: 60000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-dispatch-"));
  try {
    const output = join(directory, "dispatch");
    await exec("xcrun", ["swiftc",
      ...["UIElementAction", "UIElementRole", "UIElementActionDispatch", "UIElementMenuPreparation"].map(name => resolve(`native/macos/Sources/CuaHelper/${name}.swift`)),
      resolve("native/macos/Tests/UIElementMenuPreparationTests.swift"), "-o", output]);
    const result = await exec(output);
    assert.match(result.stdout, /native menu preparation preserves prefix ordering, first match and error stop: 64 cases/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test("native visible children selection preserves count and support semantics", {
  skip: process.platform !== "darwin", timeout: 60000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-visible-"));
  try {
    const output = join(directory, "visible");
    await exec("xcrun", ["swiftc",
      ...["UIElementError", "AXProcessID", "AXAttributeReading", "UIElementAttribute", "UIElementVisibleChildren"].map(name => resolve(`native/macos/Sources/CuaHelper/${name}.swift`)),
      resolve("native/macos/Tests/UIElementVisibleChildrenTests.swift"), "-o", output]);
    const result = await exec(output);
    assert.match(result.stdout, /visible children selection preserves fresh support, positive counts, precedence and no reread: 400 cases/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test("native array count preserves cache and error semantics", {
  skip: process.platform !== "darwin", timeout: 60000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-count-"));
  try {
    const output = join(directory, "count");
    await exec("xcrun", ["swiftc",
      ...["UIElementError", "AXStoredValue", "AXValueDescriptors", "UIElementCount", "AXArrayCount", "UIElementAttribute", "AXAttributeReading", "AXProcessID"].map(name => resolve(`native/macos/Sources/CuaHelper/${name}.swift`)),
      resolve("native/macos/Tests/UIElementCountTests.swift"), "-o", output]);
    const result = await exec(output);
    assert.match(result.stdout, /native count preserves support gate, subset totals, raw arrays and strict AX errors: 48 cases/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test("native parent chain preserves source traversal boundaries", {
  skip: process.platform !== "darwin", timeout: 60000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-parents-"));
  try {
    const output = join(directory, "parents");
    await exec("xcrun", ["swiftc",
      resolve("native/macos/Sources/CuaHelper/UIElementParentChain.swift"),
      resolve("native/macos/Tests/UIElementParentChainTests.swift"), "-o", output]);
    const result = await exec(output);
    assert.match(result.stdout, /native parent chain preserves eager seed, inclusive depth, lookahead and cycle bound/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test("native actions preserve disclosure merge and read failure", {
  skip: process.platform !== "darwin", timeout: 60000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-actions-"));
  try {
    const output = join(directory, "actions");
    await exec("xcrun", ["swiftc",
      ...["UIElementAction", "UIElementActions"].map(name => resolve(`native/macos/Sources/CuaHelper/${name}.swift`)),
      resolve("native/macos/Tests/UIElementActionsTests.swift"), "-o", output]);
    const result = await exec(output);
    assert.match(result.stdout, /native actions preserve read failure, lazy disclosure and append duplicates: 32 cases/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test("native selection capability excludes menu roles lazily", {
  skip: process.platform !== "darwin", timeout: 60000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-selectable-"));
  try {
    const output = join(directory, "selectable");
    await exec("xcrun", ["swiftc",
      ...["UIElementRole", "UIElementSelectionCapability"].map(name => resolve(`native/macos/Sources/CuaHelper/${name}.swift`)),
      resolve("native/macos/Tests/UIElementSelectionCapabilityTests.swift"), "-o", output]);
    const result = await exec(output);
    assert.match(result.stdout, /native selection capability excludes menu roles before attribute queries/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("native focus capability preserves role-specific error fallback", {
  skip: process.platform !== "darwin", timeout: 60000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-selectable-"));
  try {
    const output = join(directory, "selectable");
    await exec("xcrun", ["swiftc",
      ...["UIElementRole", "UIElementFocusCapability"].map(name => resolve(`native/macos/Sources/CuaHelper/${name}.swift`)),
      resolve("native/macos/Tests/UIElementFocusCapabilityTests.swift"), "-o", output]);
    const result = await exec(output);
    assert.match(result.stdout, /native focus capability preserves support gating and role-specific error fallback: 60 cases/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test("native web-view classification preserves ancestor and bundle fallback boundaries", {
  skip: process.platform !== "darwin", timeout: 60000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-webview-"));
  try {
    const output = join(directory, "webview");
    await exec("xcrun", ["swiftc",
      ...["UIElementRole", "UIElementParentChain", "UIElementInsideWebView"].map(name => resolve(`native/macos/Sources/CuaHelper/${name}.swift`)),
      resolve("native/macos/Tests/UIElementInsideWebViewTests.swift"), "-o", output]);
    const result = await exec(output);
    assert.match(result.stdout, /web-view classification preserves self, depth, lookahead, cycles and lazy prefix fallback/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
