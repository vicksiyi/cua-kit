import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const exec = promisify(execFile);
test("running application lookup preserves PID fallback and candidate order", { skip: process.platform !== "darwin" }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-running-app-"));
  try {
    const executable = join(directory, "test");
    await exec("xcrun", ["swiftc", "native/macos/Sources/CuaHelper/RunningApplicationLookup.swift", "native/macos/Tests/RunningApplicationLookupTests.swift", "-o", executable]);
    const { stdout } = await exec(executable);
    assert.match(stdout, /PID fallback preserve ordering and cardinality/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
