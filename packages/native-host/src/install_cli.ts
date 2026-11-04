/** Independent Chrome deployment. Existing registrations are never overwritten. */
import {
  appendFile,
  chmod,
  lstat,
  mkdir,
  readFile,
  rm,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { parseEnv } from "node:util";
import { assertPrivateEndpointDirectory } from "./endpoint_configuration";
import {
  chromeExtensionId,
  createNativeHostInstallation,
  HOST_NAME,
  loadHostConfig,
  registerChromeNativeHost,
  registerNativeHostForProfile,
} from "./installation";

async function main() {
  const args = process.argv.slice(2);
  let root = join(homedir(), ".core-cua");
  let profile: string | undefined;
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index],
      value = args[index + 1];
    if (!["--root", "--profile"].includes(flag) || !value || !isAbsolute(value))
      throw Error(
        "Usage: install [--root absolute-directory] [--profile absolute-Chromium-user-data-directory]",
      );
    if (flag === "--root") root = value;
    else profile = value;
  }
  if (!profile && process.platform !== "darwin")
    throw Error("Default Chrome installation currently supports macOS only");
  const extension = resolve("packages/browser-extension/dist/native-extension");
  const manifest = JSON.parse(
    await readFile(join(extension, "manifest.json"), "utf8"),
  );
  const extensionId = chromeExtensionId(manifest.key);
  const endpoints = join(root, "endpoints");
  await mkdir(root, { recursive: true, mode: 0o700 });
  await assertPrivateEndpointDirectory(root);
  await mkdir(endpoints, { recursive: true, mode: 0o700 });
  await assertPrivateEndpointDirectory(endpoints);
  const registration = profile
    ? join(profile, "NativeMessagingHosts", `${HOST_NAME}.json`)
    : join(
        homedir(),
        "Library/Application Support/Google/Chrome/NativeMessagingHosts",
        `${HOST_NAME}.json`,
      );
  let existing: any;
  try {
    existing = JSON.parse(await readFile(registration, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (existing) {
    if (
      existing.name !== HOST_NAME ||
      existing.type !== "stdio" ||
      typeof existing.path !== "string" ||
      !existing.path.startsWith(root + sep) ||
      JSON.stringify(existing.allowed_origins) !==
        JSON.stringify([`chrome-extension://${extensionId}/`])
    )
      throw Error(
        "An incompatible native host registration exists; it was not changed",
      );
    const config = await loadHostConfig(
      join(dirname(existing.path), "config.json"),
    );
    if (
      config.endpointParentDirectory !== endpoints ||
      JSON.stringify(config.extensionIds) !== JSON.stringify([extensionId])
    )
      throw Error(
        "Existing native host configuration does not match this installation",
      );
  } else {
    const installation = await createNativeHostInstallation({
      parentDirectory: root,
      nodePath: process.execPath,
      entryPath: resolve("packages/native-host/dist/main.mjs"),
      extensionIds: [extensionId],
      endpointParentDirectory: endpoints,
    });
    try {
      if (profile) await registerNativeHostForProfile(installation, profile);
      else await registerChromeNativeHost(installation, homedir());
    } catch (error) {
      await rm(installation.directory, { recursive: true, force: true });
      throw error;
    }
  }
  if (!profile) {
    const file = resolve(".env");
    execFileSync("git", ["check-ignore", "-q", file]);
    let contents = "";
    try {
      const stat = await lstat(file);
      if (!stat.isFile() || (process.getuid && stat.uid !== process.getuid()))
        throw Error(".env must be a regular file owned by the current user");
      contents = await readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const env = parseEnv(contents);
    if (
      env.CORE_CUA_ENDPOINT_FILES ||
      (env.CORE_CUA_HOST_DIRECTORY && env.CORE_CUA_HOST_DIRECTORY !== endpoints)
    )
      throw Error(
        "Native host registered, but existing .env browser configuration conflicts; .env was not changed",
      );
    if (!env.CORE_CUA_HOST_DIRECTORY)
      await appendFile(
        file,
        `\nCORE_CUA_HOST_DIRECTORY=${JSON.stringify(endpoints)}\n`,
        { mode: 0o600 },
      );
    await chmod(file, 0o600);
  }
  console.log(
    `Native host registration: ${registration}\nExtension ID: ${extensionId}\nLoad unpacked extension: ${extension}\nEndpoint directory: ${endpoints}`,
  );
  console.log(
    profile
      ? "Isolated profile installation; project .env was not changed."
      : 'Project .env configured. In chrome://extensions enable Developer mode and Load unpacked using the directory above. Then run npm run demo:deepseek -- "your prompt".',
  );
}
await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
