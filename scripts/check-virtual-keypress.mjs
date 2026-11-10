import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temporary = await mkdtemp(join(tmpdir(), "cua-virtual-keypress-"));
try {
  const executable = join(temporary, "check");
  execFileSync("xcrun", ["clang", "-fobjc-arc", "-framework", "Foundation", "-framework", "Carbon",
    "-I", join(root, "native/macos/Sources/RunningProcess/include"),
    join(root, "reconstruction/virtual-keypress-check.m"),
    join(root, "native/macos/.build/debug/RunningProcess.build/SAIVirtualKeyPress.m.o"),
    "-o", executable], { stdio: "inherit" });
  execFileSync(executable, [], { stdio: "inherit", timeout: 15000 });
} finally { await rm(temporary, { recursive: true, force: true }); }
