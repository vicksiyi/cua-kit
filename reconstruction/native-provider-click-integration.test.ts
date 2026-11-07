import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const exec = promisify(execFile);
const nativeRoot = fileURLToPath(new URL("../native/macos/", import.meta.url));

test("complete helper provider click composition preserves clipping and hit errors",
  { skip: process.platform !== "darwin", timeout: 120_000 }, async () => {
    await exec("swift", ["build", "--package-path", nativeRoot], { maxBuffer: 4 * 1024 * 1024 });
    const { stdout } = await exec(join(nativeRoot, ".build/debug/cua-helper"), ["--provider-click-self-test"],
      { timeout: 15_000, maxBuffer: 1024 * 1024 });
    assert.match(stdout, /Provider click composition checks passed/);
  });
