import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
test("native click target preserves point and error semantics", {
  skip: process.platform !== "darwin", timeout: 60_000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-click-selection-"));
  try {
    const executable = join(directory, "test");
    const build = join(root, "native/macos/.build/debug");
    const objects: string[] = [];
    for (const module of ["AccessibilitySupport", "SystemSoftware", "SoftLink", "RunningProcess"]) {
      const path = join(build, `${module}.build`);
      for (const name of await readdir(path)) if (name.endsWith(".o")) objects.push(join(path, name));
    }
    await exec("xcrun", ["swiftc", "-o", executable,
      "-I", join(build, "Modules"), "-I", join(build, "RunningProcess.build"), ...objects,
      join(root, "native/macos/Sources/CuaHelper/UIElementClickTarget.swift"),
      join(root, "native/macos/Tests/UIElementClickTargetTests.swift")]);
    const { stdout } = await exec(executable);
    assert.match(stdout, /click target preserves offscreen rejection, point identity and original errors/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
