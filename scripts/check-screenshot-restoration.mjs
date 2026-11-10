import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const native = "native/macos/Sources/CuaHelper/";
const slimCore = new Set(["NativeLogger", "TemporaryFile", "TemporaryFilePath", "DataFile", "File", "FileNaming", "ScreenshotFile", "ScreenshotEncoding", "ImageDestination", "ScreenshotImplementation", "ScreenshotImageOutput", "ScreenshotFileOutput", "ScreenshotFileCapture", "ScreenshotCaptureSize", "ScreenshotPixelDimensions", "ScreenshotWindowRegion", "ScreenshotDisplaySelection", "ScreenshotIncludedDisplayPlan", "ScreenshotSingleWindowFilter", "ScreenshotDisplayFilter", "ScreenshotStreamConfiguration", "ScreenScreenshotCapture", "ScreenshotContentScope", "ScreenshotDelay", "ScreenshotCurrentProcess", "ScreenshotWindowSelection", "ScreenshotAppNameMatcher", "ScreenshotAppWindow", "ScreenshotOffscreenTarget", "ScreenshotOffscreenPlan", "ScreenshotImageResize"]);
const cases = [
  ["production-configuration", ["ScreenshotSingleWindowFilter", "ScreenshotCaptureSize", "ScreenshotPixelDimensions", "ScreenshotStreamConfiguration"], "screenshot-production-configuration-check"],
  ["included-display-plan", ["ScreenshotImplementation", "ScreenshotWindowRegion", "ScreenshotDisplaySelection", "ScreenshotIncludedDisplayPlan"], "screenshot-included-display-plan-check"],
  ["content-acquisition", ["ScreenshotContentScope", "ScreenshotShareableContent"], "screenshot-content-acquisition-check"],
  ["current-process", ["ScreenshotCurrentProcess"], "screenshot-current-process-check"],
  ["delay", ["ScreenshotDelay"], "screenshot-delay-check"],
  ["temporary-file-path", ["NativeLogger", "TemporaryFile", "TemporaryFilePath"], "temporary-file-path-check"],
  ["temporary-file-ownership", ["NativeLogger", "TemporaryFile", "TemporaryFilePath"], "temporary-file-ownership-check"],
  ["temporary-file-writing", ["NativeLogger", "TemporaryFile", "TemporaryFilePath"], "temporary-file-writing-check"],
  ["data-file-construction", ["NativeLogger", "TemporaryFile", "TemporaryFilePath", "DataFile"], "data-file-construction-check"],
  ["data-file-materialization", ["NativeLogger", "TemporaryFile", "TemporaryFilePath", "DataFile"], "data-file-materialization-check"],
  ["screenshot-file-representation", ["NativeLogger", "TemporaryFile", "TemporaryFilePath", "DataFile", "File", "ScreenshotFile"], "screenshot-file-representation-check"],
  ["file-accessors", ["NativeLogger", "TemporaryFile", "TemporaryFilePath", "DataFile", "File"], "file-accessors-check"],
  ["file-naming-stages", ["NativeLogger", "TemporaryFile", "TemporaryFilePath", "DataFile", "File", "FileNaming"], "file-naming-stages-check"],
  ["image-output", ["ScreenshotImplementation", "ScreenshotEncoding", "ImageDestination", "ScreenshotImageOutput"], "image-destination-check"],
  ["screenshot-file-output", ["NativeLogger", "TemporaryFile", "TemporaryFilePath", "DataFile", "File", "FileNaming", "ScreenshotFile", "ScreenshotImplementation", "ScreenshotEncoding", "ImageDestination", "ScreenshotImageOutput", "ScreenshotFileOutput", "ScreenshotFileCapture"], "screenshot-file-output-check"],
  ["offscreen-plan", ["ScreenshotOffscreenPlan"], "screenshot-offscreen-plan-check"],
  ["offscreen-target", ["ScreenshotOffscreenTarget"], "screenshot-offscreen-target-check"],
  ["image-resize", ["ScreenshotImageResize"], "screenshot-image-resize-check"],
  ["app-name-matcher", ["ScreenshotAppNameMatcher"], "screenshot-app-name-matcher-check"],
  ["screen-capture-composition", ["ScreenScreenshotCapture"], "screen-screenshot-capture-check"],
];
if (process.platform !== "darwin") throw new Error("Screenshot native checks require macOS SDKs");
const directory = await mkdtemp(join(tmpdir(), "cua-screenshot-checks-"));
try {
  for (const [name, files, fixture] of cases) {
    const executable = join(directory, name);
    execFileSync("swiftc", ["-o", executable, ...files.map(file => `native/macos/Sources/${slimCore.has(file) ? "SlimCore" : "CuaHelper"}/${file}.swift`), `reconstruction/${fixture}.swift`], { cwd: root, stdio: "inherit" });
    execFileSync(executable, [], { cwd: root, stdio: "inherit", timeout: 15000 });
  }
  console.log(`${cases.length} screenshot restoration checks passed (no desktop capture or input).`);
} finally { await rm(directory, { recursive: true, force: true }); }
