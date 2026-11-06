/** Read-only Core deployment check; no installation repair or browser launch. */
import { access, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import {
  HOST_NAME,
  loadHostConfig,
  validateExtensionOrigin,
} from "./installation";

export async function checkNativeHostInstallation(options: {
  manifestPath: string;
  extensionId: string;
  endpointDirectory: string;
}): Promise<void> {
  const manifest = JSON.parse(await readFile(options.manifestPath, "utf8"));
  const origin = `chrome-extension://${options.extensionId}/`;
  if (
    manifest.name !== HOST_NAME ||
    manifest.type !== "stdio" ||
    typeof manifest.path !== "string" ||
    !isAbsolute(manifest.path) ||
    !Array.isArray(manifest.allowed_origins) ||
    !manifest.allowed_origins.includes(origin)
  )
    throw Error(
      "Native host registration does not match the Core CUA extension",
    );
  if (!(await stat(manifest.path)).isFile())
    throw Error("Native host launcher is not a file");
  await access(manifest.path, constants.X_OK);
  const config = await loadHostConfig(
    join(dirname(manifest.path), "config.json"),
  );
  validateExtensionOrigin(config, origin);
  if (config.runtime?.kind === "rust")
    await access(config.runtime.executablePath, constants.X_OK);
  if (config.endpointParentDirectory !== options.endpointDirectory)
    throw Error(
      "Native host endpoint directory does not match the demo configuration",
    );
}
