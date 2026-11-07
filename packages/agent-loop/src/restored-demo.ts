import { ModelHttpError } from "./chat-model";
import { NativePolicyConfigurationError } from "./native-policy-configuration";
import { getDemoDebugLog } from "./demo-debug";
import { SupervisorCompatibilityError } from "./native-supervisor";
import { BrowserStartupError } from "./browser-startup";
/** CLI boundary: known connection prerequisites get actionable output. */
import { ComputerUnavailableError } from "./computer-preflight";
import { fileURLToPath } from "node:url";
import { IndependentBrowserUnavailableError } from "@core/native-host/browserConnector";

const debug = getDemoDebugLog();
debug?.write("entry.start", { entry: "restored-demo", node: process.version });
let entryFailed = false;
try {
  await import("./restored-demo-runtime");
} catch (error) {
  entryFailed = true;
  // Keep the original failure even when the diagnostic disk write fails.
  try { debug?.write("entry.error", { error }); }
  catch { console.error("Could not write the local startup diagnostic."); }
  if (error instanceof ModelHttpError || error instanceof NativePolicyConfigurationError || error instanceof SupervisorCompatibilityError || error instanceof BrowserStartupError) {
    console.error(error.message);
    process.exitCode = 1;
  } else if (error instanceof ComputerUnavailableError) {
    console.error("原生 App 服务检查未通过；本次未发送 DeepSeek 请求或执行 App 操作。具体宿主错误见上方 tool 日志。浏览器扩展连接与原生 App 服务是两条不同链路。");
    process.exitCode = 1;
  } else {
    if (!(error instanceof IndependentBrowserUnavailableError)) throw error;
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const extension = fileURLToPath(
      new URL("../../browser-extension/dist/native-extension", import.meta.url),
    );
    console.error(
      [
        "浏览器尚未连接；本次没有发送 DeepSeek 请求或执行页面操作。",
        error.reason === "directory_missing"
          ? "配置的本地 host 目录不存在，请先在项目中运行 npm run install:chrome。"
          : "未发现 Core CUA 的浏览器连接。",
        "在日常 Chrome 打开 chrome://extensions，开启开发者模式，加载已解压的扩展：",
        extension,
        "若扩展已加载，请检查扩展错误，并在项目中运行 npm run install:chrome 后重新加载扩展。",
        `项目目录：${root}`,
        "然后重试：npm run demo:deepseek -- --check-browser",
        "连接检查通过后，再输入你的自然语言操作指令。",
      ].join("\n"),
    );
    process.exitCode = 1;
  }

} finally {
  try { debug?.write("entry.closed", { failed: entryFailed, exitCode: process.exitCode ?? null }); }
  catch { console.error("Could not close the local startup diagnostic."); }
}
