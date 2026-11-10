import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const exec = promisify(execFile);
test("native approval response uses upstream MCP SDK and restored store", {
  skip: process.platform !== "darwin", timeout: 120000,
}, async () => {
  const root = resolve("native/macos");
  const directory = await mkdtemp(join(tmpdir(), "cua-approval-response-"));
  try {
    await exec("swift", ["build", "--package-path", root], { maxBuffer: 4 * 1024 * 1024 });
    const build = join(root, ".build/debug");
    const objects: string[] = [];
    for (const name of ["MCP", "EventSource", "Logging", "SystemPackage", "CSystem"]) {
      const folder = join(build, `${name}.build`);
      for (const entry of await readdir(folder)) if (entry.endsWith(".o")) objects.push(join(folder, entry));
    }
    const output = join(directory, "actions");
    await exec("xcrun", ["swiftc", "-I", join(build, "Modules"), "-I", join(build, "RunningProcess.build"),
      "-Xcc", `-fmodule-map-file=${join(root, ".build/checkouts/swift-system/Sources/CSystem/include/module.modulemap")}`,
      ...["NativeIPCErrorDescription", "NativeIPCServerErrorMapping", "NativeIPCClientError", "NativeCallToolResult", "NativeMCPErrorContext", "NativeMCPToolError", "NativeAppApprovalResponse", "NativeAppApprovalStore"].map(name => join(root, `Sources/CuaHelper/${name}.swift`)),
      join(root, "Tests/NativeAppApprovalResponseTests.swift"), ...objects, "-o", output], { maxBuffer: 1024 * 1024 });
    const result = await exec(output);
    assert.match(result.stdout, /native MCP SDK approval response and storage composition passed/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
