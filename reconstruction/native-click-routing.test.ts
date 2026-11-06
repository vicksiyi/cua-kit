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
test("native click routing preserves branch and error semantics", {
  skip: process.platform !== "darwin", timeout: 60_000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-click-selection-"));
  try {
    const executable = join(directory, "test");
    await exec("xcrun", ["swiftc", "-o", executable,
      ...["UIElementAction", "UIElementClickPreparation", "UIElementClickRouting"]
        .map(name => join(root, `native/macos/Sources/CuaHelper/${name}.swift`)),
      join(root, "native/macos/Tests/UIElementClickRoutingTests.swift")]);
    const { stdout } = await exec(executable);
    assert.match(stdout, /Click routing preserves second WebView read, cursor-focus-action order and no error retry/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
