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

test(
  "native role identity composes with role frequency table",
  { skip: process.platform !== "darwin", timeout: 60_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "cua-axread-"));
    try {
      const executable = join(directory, "axvalue-tests");
      await exec("xcrun", ["swiftc", "-o", executable,
        join(root, "native/macos/Sources/CuaHelper/UIElementRole.swift"),
        join(root, "native/macos/Sources/CuaHelper/FrequencyTable.swift"),
        join(root, "native/macos/Tests/UIElementRoleTests.swift"),
      ]);
      const { stdout } = await exec(executable);
      assert.match(
        stdout,
        /native role identity and role frequency composition passed/,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
