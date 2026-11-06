/** Readable restoration of the installed Chrome plugin's installManifest.mjs
 * configuration builder/writer (J, v, Z). This JavaScript-origin deployment
 * logic stays TypeScript; native manifest selection remains a Rust task.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export interface AppServerRuntimePaths {
  codexCliPath: string;
  nodePath: string;
  nodeReplPath: string;
  browserClientPath?: string | null;
  channel?: string | null;
  proxyHost?: string;
  proxyPort?: number;
}
export interface AppServerHostConfiguration {
  schemaVersion: 1;
  codexCliPath: string;
  nodePath: string;
  nodeReplPath: string;
  browserClientPath?: string;
  channel?: string;
  proxyHost: string;
  proxyPort: number;
}
function required(value: string, field: string): string {
  if (typeof value !== "string" || value.trim() === "")
    throw Error(`Missing ${field}.`);
  return value;
}
export function createAppServerHostConfiguration({
  browserClientPath, channel, codexCliPath, nodePath, nodeReplPath,
  proxyHost = "127.0.0.1", proxyPort = 0,
}: AppServerRuntimePaths): AppServerHostConfiguration {
  if (typeof proxyPort !== "number" || !Number.isInteger(proxyPort) || proxyPort < 0 || proxyPort > 65535)
    throw Error("proxyPort must be a TCP port between 0 and 65535.");
  return {
    schemaVersion: 1,
    ...(channel == null ? {} : { channel: required(channel, "channel") }),
    ...(browserClientPath == null ? {} : { browserClientPath: required(browserClientPath, "browserClientPath") }),
    codexCliPath: required(codexCliPath, "codexCliPath"),
    nodePath: required(nodePath, "nodePath"),
    nodeReplPath: required(nodeReplPath, "nodeReplPath"),
    proxyHost: required(proxyHost, "proxyHost"),
    proxyPort,
  };
}
export function createPluginAppServerHostConfiguration(pluginRoot: string, options: AppServerRuntimePaths) {
  return createAppServerHostConfiguration({
    browserClientPath: resolve(pluginRoot, "scripts", "browser-client.mjs"),
    ...options,
  });
}
export async function writeAppServerHostConfiguration({
  appServerHostConfig, extensionHostPath,
}: {appServerHostConfig: AppServerHostConfiguration; extensionHostPath: string}) {
  const path = resolve(dirname(extensionHostPath), "extension-host-config.json");
  await mkdir(dirname(path), {recursive: true});
  await writeFile(path, `${JSON.stringify(appServerHostConfig, null, 2)}\n`, "utf8");
  return path;
}
