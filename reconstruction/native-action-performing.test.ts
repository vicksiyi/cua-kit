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
