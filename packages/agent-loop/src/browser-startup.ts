/** Demo lifecycle only: restored CUA modules continue to consume explicit endpoints. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { discoverEndpointFiles, IndependentBrowserUnavailableError } from "@core/native-host/browserConnector";

export class BrowserStartupError extends Error {}

export async function discoverOrStartChrome(directory: string, dependencies = {
  discover: discoverEndpointFiles,
  launch: async () => {
    if (process.platform !== "darwin") throw new Error("Automatic Chrome startup currently requires macOS");
    await promisify(execFile)("/usr/bin/open", ["-a", "Google Chrome"], { timeout: 10000 });
  },
  now: Date.now,
  wait: (ms: number) => delay(ms),
  report: (message: string) => console.error(message),
}, timeoutMs = 15000): Promise<string[]> {
  try {
    return await dependencies.discover(directory);
  } catch (error) {
    // Missing installation and unsafe configuration are not transient startup failures.
    if (!(error instanceof IndependentBrowserUnavailableError) || error.reason !== "no_endpoints") throw error;
  }
  dependencies.report("未发现扩展连接，正在打开 Google Chrome 并等待 Native Messaging 宿主（最多 15 秒）……");
  try {
    await dependencies.launch();
  } catch (cause) {
    throw new BrowserStartupError("无法启动 Google Chrome；请确认应用已安装。尚未调用模型。", { cause });
  }
  const deadline = dependencies.now() + timeoutMs;
  for (;;) {
    try {
      return await dependencies.discover(directory);
    } catch (error) {
      if (!(error instanceof IndependentBrowserUnavailableError) || error.reason !== "no_endpoints") throw error;
    }
    const remaining = deadline - dependencies.now();
    if (remaining <= 0) throw new BrowserStartupError(
      "已请求打开 Google Chrome，但等待扩展连接超时。请检查当前 Chrome profile 中 Core CUA 扩展是否启用及其 service worker 错误。安装扩展不等于宿主已经连接。尚未调用模型。\n不依赖扩展可显式使用：npm run demo:deepseek -- --cdp-browser \"你的指令\"（独立 Chromium，不复用日常 Chrome 登录状态）。",
    );
    await dependencies.wait(Math.min(250, remaining));
  }
}
