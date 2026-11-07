import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { NativeHelper } from "../packages/native-macos/src/helper";
const exec = promisify(execFile);

test("owned NDJSON transport preserves runtime failures and request parsing errors", {
  skip: process.platform !== "darwin", timeout: 60_000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-stdio-errors-"));
  try {
    const executable = join(directory, "fixture");
    await exec("xcrun", ["swiftc", "-o", executable,
      ...["NativeStdio", "NativeTermination", "UIElementError", "NativeIPCClientError", "NativeIPCErrorDescription"].map(name => resolve(`native/macos/Sources/CuaHelper/${name}.swift`)),
      resolve("native/macos/Tests/NativeStdioErrorFixture.swift")]);
    const { helper } = await NativeHelper.connect(executable);
    try {
      for (const [method, code, message] of [
        ["ax", "ACCESSIBILITY_ERROR", "Accessibility error: AXError.cannotComplete (-25204)"],
        ["host", "STALE_OBSERVATION", "fixture stale observation"],
        ["runtime", "NATIVE_ERROR", "fixture runtime failure"],
      ]) {
        await assert.rejects(helper.request(method), (error: any) => error.code === code && error.message === message);
      }
      assert.deepEqual(await helper.request("alive"), { alive: true });
    } finally { await helper.close(); }
    // Exercise malformed framing through the actual Swift transport, without UI.
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(executable, [], { input: '{bad json}\n{"id":7,"method":"hello"}\n', encoding: "utf8", timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
    const replies = result.stdout.trim().split("\n").map(line => JSON.parse(line));
    assert.equal(replies.length, 2);
    for (const reply of replies) {
      assert.equal(reply.id, null);
      assert.equal(reply.error.code, "INVALID_ARGUMENT");
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
