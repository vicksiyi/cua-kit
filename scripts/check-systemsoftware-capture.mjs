import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const build = join(root, "native/macos/.build/debug");
const objects = [];
for (const module of ["SlimCore", "SystemSoftware", "AccessibilitySupport", "SoftLink", "RunningProcess"]) {
  const directory = join(build, `${module}.build`);
  for (const name of await readdir(directory)) if (name.endsWith(".o")) objects.push(join(directory, name));
}
const temporary = await mkdtemp(join(tmpdir(), "cua-systemsoftware-check-"));
try {
  for (const fixture of ["systemsoftware-capture-check", "systemsoftware-observer-check", "systemsoftware-snapshot-check", "window-ordering-iterator-check", "safe-activation-window-order-check", "systemsoftware-application-registry-check", "running-application-front-process-check", "accessibility-notifications-check", "accessibility-scroll-check", "cgevent-integer-bindings-check", "cgevent-scalars-check"]) {
    const executable = join(temporary, fixture);
    const extraSources = fixture === "window-ordering-iterator-check"
      ? ["CGWindowEventStream", "WindowOrderingRestorationContext", "WindowOrderingEventLoop"].map(name => join(root, `native/macos/Sources/CuaHelper/${name}.swift`))
      : fixture === "safe-activation-window-order-check"
        ? [join(root, "native/macos/Sources/CuaHelper/SafeActivationWindowOrder.swift")]
        : [];
    execFileSync("swiftc", ["-Xcc", `-fmodule-map-file=${join(build, "RunningProcess.build/module.modulemap")}`, "-parse-as-library", "-I", join(build, "Modules"), ...objects, ...extraSources,
      join(root, `reconstruction/${fixture}.swift`), "-o", executable], { cwd: root, stdio: "inherit" });
    execFileSync(executable, [], { stdio: "inherit", timeout: 15000 });
  }
} finally { await rm(temporary, { recursive: true, force: true }); }
