import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const build = join(root, "native/macos/.build/debug");
const objects = [];
for (const module of ["SlimCore", "SystemSoftware", "SoftLink"]) {
  const directory = join(build, `${module}.build`);
  for (const name of await readdir(directory)) if (name.endsWith(".o")) objects.push(join(directory, name));
}
const temporary = await mkdtemp(join(tmpdir(), "cua-systemsoftware-check-"));
try {
  for (const fixture of ["systemsoftware-capture-check", "systemsoftware-observer-check", "systemsoftware-snapshot-check"]) {
    const executable = join(temporary, fixture);
    execFileSync("swiftc", ["-parse-as-library", "-I", join(build, "Modules"), ...objects,
      join(root, `reconstruction/${fixture}.swift`), "-o", executable], { cwd: root, stdio: "inherit" });
    execFileSync(executable, [], { stdio: "inherit", timeout: 15000 });
  }
} finally { await rm(temporary, { recursive: true, force: true }); }
