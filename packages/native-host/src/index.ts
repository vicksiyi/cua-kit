export type { NativeHostEndpoint } from "./protocol";
export { connectNativeHost } from "./client";
export {
  createNativeHostInstallation,
  chromeExtensionId,
  registerChromeNativeHost,
  validateHostConfig,
  validateExtensionOrigin,
} from "./installation";
export { createBrowserServiceConnector } from "./browser_connector";
export { registerNativeHostForProfile } from "./installation";
export {
  inspectChromeExtension,
  chromeProfileLaunchCommand,
} from "./chrome_profile";
export { checkNativeHostInstallation } from "./installation_check";

export {
  startRustNativeHost,
  resolveRustNativeHostExecutable,
} from "./native_process";
export {
  createAppServerHostConfiguration,
  createPluginAppServerHostConfiguration,
  writeAppServerHostConfiguration,
  type AppServerRuntimePaths,
  type AppServerHostConfiguration,
} from "./app_server_host_configuration";
