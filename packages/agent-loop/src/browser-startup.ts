/** Demo lifecycle only: restored CUA modules continue to consume explicit endpoints. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import {
  discoverLiveEndpointFiles,
  IndependentBrowserUnavailableError,
} from "@core/native-host/browserConnector";
import {
  inspectChromeExtension,
  chromeProfileLaunchCommand,
  chromeExtensionId,
  checkNativeHostInstallation,
} from "@core/native-host";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export class BrowserStartupError extends Error {}

export async function discoverOrStartChrome(
  directory: string,
  dependencies = {
    discover: discoverLiveEndpointFiles,
    launch: async (endpointDirectory: string) => {
      if (process.platform !== "darwin")
        throw new Error("Automatic Chrome startup currently requires macOS");
      const manifest = JSON.parse(
        await readFile(
          new URL(
            "../../browser-extension/native-manifest.json",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const status = inspectChromeExtension({
        userDataDirectory: join(
          homedir(),
          "Library/Application Support/Google/Chrome",
        ),
        extensionId: chromeExtensionId(manifest.key),
      });
      if (!status.enabled)
        throw new BrowserStartupError(
          `Chrome profile ${status.selectedProfileDirectory} 中的 Core CUA 扩展${status.installed ? "未启用" : "未安装"}。请在该 profile 中加载并启用项目扩展；未启动浏览器。`,
        );
      try {
        await checkNativeHostInstallation({
          manifestPath: join(
            homedir(),
            "Library/Application Support/Google/Chrome/NativeMessagingHosts/com.core.cua.json",
          ),
          extensionId: chromeExtensionId(manifest.key),
          endpointDirectory,
        });
      } catch (cause) {
        throw new BrowserStartupError(
          "Core CUA Native Messaging 注册、启动器或连接目录配置异常。请检查 npm run install:chrome 的安装结果；未启动浏览器。",
          { cause },
        );
      }
      const command = chromeProfileLaunchCommand(
        status.selectedProfileDirectory,
      );
      console.error(
        `Chrome startup profile: ${status.selectedProfileDirectory}`,
      );
      await promisify(execFile)(command.command, command.args, {
        timeout: 10000,
        signal,
      });
    },
    now: Date.now,
    wait: (ms: number) => delay(ms, undefined, { signal }),
    report: (message: string) => console.error(message),
  },
  timeoutMs = 15000,
  signal?: AbortSignal,
): Promise<string[]> {
  signal?.throwIfAborted();
  try {
    const endpoints = await dependencies.discover(directory);
    signal?.throwIfAborted();
    return endpoints;
  } catch (error) {
    signal?.throwIfAborted();
    // Missing installation and unsafe configuration are not transient startup failures.
    if (
      !(error instanceof IndependentBrowserUnavailableError) ||
      error.reason !== "no_endpoints"
    )
      throw error;
  }
  dependencies.report(
    "扩展连接暂不可用，等待 2 秒后重试一次，再决定是否打开 Chrome……",
  );
  await dependencies.wait(2000);
  signal?.throwIfAborted();
  try {
    const endpoints = await dependencies.discover(directory);
    signal?.throwIfAborted();
    return endpoints;
  } catch (error) {
    signal?.throwIfAborted();
    if (
      !(error instanceof IndependentBrowserUnavailableError) ||
      error.reason !== "no_endpoints"
    )
      throw error;
  }
  dependencies.report(
    "未发现扩展连接，正在检查 Chrome profile；扩展启用后将打开该 profile 并等待宿主连接（最多 15 秒）……",
  );
  try {
    signal?.throwIfAborted();
    await dependencies.launch(directory);
    signal?.throwIfAborted();
  } catch (cause) {
    signal?.throwIfAborted();
    if (cause instanceof BrowserStartupError) throw cause;
    throw new BrowserStartupError(
      "无法启动 Google Chrome；请确认应用已安装。",
      { cause },
    );
  }
  const deadline = dependencies.now() + timeoutMs;
  for (;;) {
    signal?.throwIfAborted();
    try {
      const endpoints = await dependencies.discover(directory);
      signal?.throwIfAborted();
      return endpoints;
    } catch (error) {
      signal?.throwIfAborted();
      if (
        !(error instanceof IndependentBrowserUnavailableError) ||
        error.reason !== "no_endpoints"
      )
        throw error;
    }
    const remaining = deadline - dependencies.now();
    if (remaining <= 0)
      throw new BrowserStartupError(
        '已请求打开 Google Chrome，但等待扩展连接超时。请检查当前 Chrome profile 中 Core CUA 扩展是否启用及其 service worker 错误。安装扩展不等于宿主已经连接。\n不依赖扩展可显式使用：npm run demo:deepseek -- --cdp-browser "你的指令"（独立 Chromium，不复用日常 Chrome 登录状态）。',
      );
    await dependencies.wait(Math.min(250, remaining));
  }
}
