import { realpath, mkdir, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
if (process.platform !== "darwin")
  throw Error("macOS sandbox addon requires Darwin");
const root = fileURLToPath(new URL("../", import.meta.url));
const executable = await realpath(process.execPath);
const headers =
  process.env.CUA_NODE_INCLUDE_DIR ??
  resolve(dirname(executable), "../include/node");
await access(resolve(headers, "node_api.h"));
const out = resolve(root, "native/macos-sandbox/dist");
await mkdir(out, { recursive: true });
const result = spawnSync(
  "/usr/bin/clang",
  [
    "-bundle",
    "-undefined",
    "dynamic_lookup",
    "-O2",
    "-Wall",
    "-Wextra",
    "-Wno-deprecated-declarations",
    "-I",
    headers,
    resolve(root, "native/macos-sandbox/sandbox.c"),
    "-lsandbox",
    "-o",
    resolve(out, "sandbox.node"),
  ],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
if (result.status !== 0)
  throw Error(`Sandbox addon build failed: ${result.status}`);
