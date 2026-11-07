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
test("SoftLink mapped-image command scan preserves ordering and malformed-size behavior", {
  skip: process.platform !== "darwin", timeout: 60_000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-policy-result-"));
  try {
    const executable = join(directory, "test");
    await exec("xcrun", ["swiftc", "-o", executable,
      ...["SegmentName", "LoadCommands"].map(name => join(root, `native/macos/Sources/SoftLink/${name}.swift`)),
      join(root, "native/macos/Tests/SoftLinkLoadCommandsTests.swift")]);
    const { stdout } = await exec(executable);
    assert.match(stdout, /SoftLink load-command scan passed/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
