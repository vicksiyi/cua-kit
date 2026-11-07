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
test("SoftLink full filesystem loader preserves native branches and output order", {
  skip: process.platform !== "darwin", timeout: 60_000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-policy-result-"));
  try {
    const executable = join(directory, "test");
    await exec("xcrun", ["swiftc", "-o", executable,
      ...["SipHashState", "SipHash", "Images", "FilesystemImageRequests", "FilesystemImageCandidate", "FrameworkCandidates", "FilesystemImages"].map(name => join(root, `native/macos/Sources/SoftLink/${name}.swift`)),
      join(root, "native/macos/Tests/SoftLinkFilesystemImagesTests.swift")]);
    const { stdout } = await exec(executable);
    assert.match(stdout, /SoftLink full filesystem loading branch order and strategy isolation passed/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
