import { access, chmod, copyFile, mkdir, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
if (process.platform === "win32")
  throw Error("The reconstructed native browser host currently requires Unix");
const root = fileURLToPath(new URL("../", import.meta.url));
const crate = join(root, "native/browser-extension-host");
let cargo = process.env.CUA_CARGO || "cargo";
if (!process.env.CUA_CARGO) {
  const local = join(homedir(), ".cargo/bin/cargo");
  try {
    await access(local);
    cargo = local;
  } catch {}
}
execFileSync(
  cargo,
  [
    "build",
    "--locked",
    "--release",
    "--manifest-path",
    join(crate, "Cargo.toml"),
    "--bin",
    "core-browser-extension-host",
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, CARGO_TARGET_DIR: join(crate, "target") },
  },
);
await mkdir(join(crate, "dist"), { recursive: true });
const destination = join(crate, "dist/core-browser-extension-host");
const temporary = destination + `.${process.pid}.tmp`;
try {
  await copyFile(
    join(crate, "target/release/core-browser-extension-host"),
    temporary,
  );
  await chmod(temporary, 0o755);
  await rename(temporary, destination);
} finally {
  await rm(temporary, { force: true });
}
