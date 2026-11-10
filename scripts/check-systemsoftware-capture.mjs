import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const build = join(root, "native/macos/.build/debug");
const objects = [];
for (const module of ["SystemSoftware", "SoftLink"]) {
  const directory = join(build, `${module}.build`);
  for (const name of await readdir(directory)) if (name.endsWith(".o")) objects.push(join(directory, name));
}
const temporary = await mkdtemp(join(tmpdir(), "cua-systemsoftware-check-"));
try {
  const executable = join(temporary, "capture-check");
  execFileSync("swiftc", ["-parse-as-library", "-I", join(build, "Modules"), ...objects,
    join(root, "reconstruction/systemsoftware-capture-check.swift"), "-o", executable], { cwd: root, stdio: "inherit" });
  execFileSync(executable, [], { stdio: "inherit", timeout: 15000 });
} finally { await rm(temporary, { recursive: true, force: true }); }
