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
test("native JSON-RPC request writer preserves framing and failure ordering", {
  skip: process.platform !== "darwin", timeout: 60_000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-policy-result-"));
  try {
    const executable = join(directory, "test");
    await exec("xcrun", ["swiftc", "-o", executable,
      ...["NativeJSONRPCMessageDecoder", "NativeJSONRPCLineBuffer", "NativeJSONRPCPipeReader", "NativeJSONRPCRequestWriter"].map(name => join(root, `native/macos/Sources/CuaHelper/${name}.swift`)),
      join(root, "native/macos/Tests/NativeJSONRPCRequestWriterTests.swift")]);
    await assert.rejects(exec(executable, ["--invalid-number"]), (error: any) => {
      assert.match(error.stderr, /Invalid number value \(NaN\) in JSON write/);
      assert.doesNotMatch(error.stdout, /unexpected-closed-check/);
      return true;
    });
    const { stdout } = await exec(executable);
    assert.match(stdout, /native JSON-RPC request framing, pipe integration and failure ordering passed/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
