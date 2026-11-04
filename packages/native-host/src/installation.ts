/** Installation for the independent @core host; never rewrites the OpenAI host. */
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
export const HOST_NAME = "com.core.cua";
export interface NativeHostConfig {
  version: 1;
  extensionIds: string[];
}
export function validateHostConfig(value: unknown): NativeHostConfig {
  const config = value as NativeHostConfig | null;
  if (
    !config ||
    config.version !== 1 ||
    !Array.isArray(config.extensionIds) ||
    !config.extensionIds.length ||
    config.extensionIds.some(
      (id) => typeof id !== "string" || !/^[a-p]{32}$/.test(id),
    )
  )
    throw Error("Invalid @core native host configuration");
  return { version: 1, extensionIds: [...new Set(config.extensionIds)] };
}
export function validateExtensionOrigin(
  config: NativeHostConfig,
  origin: string | undefined,
) {
  if (
    !origin ||
    !config.extensionIds.some((id) => origin === `chrome-extension://${id}/`)
  )
    throw Error("Extension origin is not registered for @core native host");
}
export async function loadHostConfig(path: string) {
  return validateHostConfig(JSON.parse(await readFile(path, "utf8")));
}
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
export async function createNativeHostInstallation(options: {
  parentDirectory: string;
  nodePath: string;
  entryPath: string;
  extensionIds: string[];
}) {
  const config = validateHostConfig({
    version: 1,
    extensionIds: options.extensionIds,
  });
  if (
    ![options.parentDirectory, options.nodePath, options.entryPath].every(
      isAbsolute,
    )
  )
    throw Error("Native host installation paths must be absolute");
  await access(options.nodePath, constants.X_OK);
  await access(options.entryPath, constants.R_OK);
  await mkdir(options.parentDirectory, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(options.parentDirectory, "host-"));
  try {
    await chmod(directory, 0o700);
    const configPath = join(directory, "config.json"),
      launcherPath = join(directory, "launch-host");
    await writeFile(configPath, JSON.stringify(config), {
      mode: 0o600,
      flag: "wx",
    });
    await writeFile(
      launcherPath,
      `#!/bin/sh\nexec ${shellQuote(options.nodePath)} ${shellQuote(options.entryPath)} --config ${shellQuote(configPath)} "$@"\n`,
      { mode: 0o700, flag: "wx" },
    );
    const manifest = {
      name: HOST_NAME,
      description: "Core CUA native messaging host",
      path: launcherPath,
      type: "stdio",
      allowed_origins: config.extensionIds.map(
        (id) => `chrome-extension://${id}/`,
      ),
    };
    const manifestPath = join(directory, `${HOST_NAME}.json`);
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    return { directory, configPath, launcherPath, manifestPath, manifest };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
/** macOS Chrome registration. Exclusive creation preserves any existing installation. */
export async function registerChromeNativeHost(
  installation: Awaited<ReturnType<typeof createNativeHostInstallation>>,
  homeDirectory: string,
  platform: string = process.platform,
) {
  if (platform !== "darwin")
    throw Error(
      "Chrome native-host registration currently supports macOS only",
    );
  if (!isAbsolute(homeDirectory))
    throw Error("Expected absolute home directory");
  const path = join(
    homeDirectory,
    "Library/Application Support/Google/Chrome/NativeMessagingHosts",
    `${HOST_NAME}.json`,
  );
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(installation.manifest, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  return path;
}

/** Register in an explicit Chromium user-data directory (including isolated profiles).
 * Chromium DIR_USER_NATIVE_MESSAGING is DIR_USER_DATA/NativeMessagingHosts.
 */
export async function registerNativeHostForProfile(
  installation: Awaited<ReturnType<typeof createNativeHostInstallation>>,
  userDataDirectory: string,
) {
  if (!isAbsolute(userDataDirectory))
    throw Error("Expected absolute browser user-data directory");
  const path = join(
    userDataDirectory,
    "NativeMessagingHosts",
    `${HOST_NAME}.json`,
  );
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(installation.manifest, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  return path;
}
