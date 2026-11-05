import { mkdir, copyFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
if (process.platform !== "darwin") throw Error("macOS sandbox addon requires Darwin");
const root = fileURLToPath(new URL("../", import.meta.url));
const crate = resolve(root, "native/macos-sandbox");
let cargo = process.env.CUA_CARGO ?? "cargo";
if (!process.env.CUA_CARGO) {
  const rustupCargo = join(homedir(), ".cargo/bin/cargo");
  try { await access(rustupCargo); cargo = rustupCargo; } catch {}
}
const result = spawnSync(cargo, ["build", "--locked", "--release", "--manifest-path", resolve(crate, "Cargo.toml")], {
  stdio: "inherit", env: { ...process.env, CARGO_TARGET_DIR: resolve(crate, "target") },
});
if (result.error) throw result.error;
if (result.status !== 0) throw Error(`Rust sandbox addon build failed: ${result.status}`);
const out = resolve(crate, "dist");
await mkdir(out, { recursive: true });
await copyFile(resolve(crate, "target/release/libcore_macos_sandbox.dylib"), resolve(out, "sandbox.node"));
