import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  restoredWorkerCommand,
  launchRestoredSupervisor,
} from "../packages/agent-loop/src/native-supervisor";
test("demo adapter preserves native worker bootstrap arguments and rejects ambiguous launches", () => {
  for (const [original, restored] of [
    ["kernel.js", "kernel.js"],
    ["trusted-worker.js", "trusted_worker.js"],
  ]) {
    const input = [
      "/fixture/assets",
      "/fixture/node",
      "--experimental-vm-modules",
      "/fixture/assets/" + original,
      "--session-id",
      "fixture",
      "--working-dir",
      "/fixture/work",
    ];
    const launch = restoredWorkerCommand(input);
    assert.equal(launch.command, "/fixture/node");
    assert.equal(
      launch.args[1],
      path.resolve("packages/node-repl/dist/" + restored),
    );
    assert.deepEqual(launch.args.slice(2), input.slice(4));
  }
  assert.throws(
    () =>
      restoredWorkerCommand([
        "/fixture/assets",
        "node",
        "/fixture/assets/kernel.js",
      ]),
    /absolute Node/,
  );
  assert.throws(
    () =>
      restoredWorkerCommand([
        "/fixture/assets",
        "/node",
        "/elsewhere/kernel.js",
      ]),
    /Unrecognized/,
  );
  assert.throws(
    () =>
      restoredWorkerCommand([
        "/fixture/assets",
        "/node",
        "/fixture/assets/kernel.js",
        "/fixture/assets/trusted-worker.js",
      ]),
    /exactly one/,
  );
});
test("demo adapter rejects unverified supervisors and conflicting wrapper configuration before launch", async () => {
  await assert.rejects(
    launchRestoredSupervisor({}),
    /CUA_NATIVE_SUPERVISOR_PATH/,
  );
  await assert.rejects(
    launchRestoredSupervisor({
      CUA_NATIVE_SUPERVISOR_PATH: "/fixture/native",
      NODE_REPL_WORKER_WRAPPER: "[]",
    }),
    /already configured/,
  );
  const dir = await mkdtemp(path.join(os.tmpdir(), "cua-native-adapter-"));
  try {
    const binary = path.join(dir, "unverified");
    await writeFile(binary, "not an executable");
    await assert.rejects(
      launchRestoredSupervisor({ CUA_NATIVE_SUPERVISOR_PATH: binary }),
      /differs from the verified build/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
