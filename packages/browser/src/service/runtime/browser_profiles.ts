import { homedir, tmpdir } from "node:os";
import { posix, win32, resolve } from "node:path";
import { readFile, cp, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { browserFamilies } from "../browser_family";
import { createProfileEnrichment } from "./browser_handshake";
/** Original x6. Path roots use process environment, not the browser runtime environment. */
export function browserProfileDirectory(
  family: string,
  platform: string,
  environment: Record<string, string | undefined> = process.env,
  home?: string,
) {
  const info = browserFamilies[family as keyof typeof browserFamilies];
  switch (platform) {
    case "darwin":
      return posix.resolve(
        home ?? homedir(),
        ...info.macos.userDataDirectorySegments,
      );
    case "linux":
      return posix.resolve(
        environment.CHROME_CONFIG_HOME ||
          environment.XDG_CONFIG_HOME ||
          posix.resolve(home ?? homedir(), ".config"),
        info.linux.installations[0].userDataDirName,
      );
    case "win32":
      return win32.resolve(
        environment.LOCALAPPDATA ||
          win32.resolve(home ?? homedir(), "AppData", "Local"),
        ...info.windows.userDataDirectorySegments,
      );
    default:
      throw new Error(`Unsupported browser profile platform: ${platform}`);
  }
}
export interface ProfileDatabase {
  open(): Promise<unknown>;
  get(key: string): Promise<any>;
  close(): Promise<unknown>;
}
export interface BrowserProfileDependencies {
  loadClassicLevel?(): Promise<{
    ClassicLevel?: new (path: string, options: any) => ProfileDatabase;
  } | null>;
  reportError(error: any): void;
  directory?: (family: string, platform: string) => string;
  temporaryDirectory?: () => string;
  readText?: (path: string) => Promise<string>;
  exists?: (path: string) => boolean;
  copy?: typeof cp;
  makeTemporary?: typeof mkdtemp;
  remove?: typeof rm;
}
/** Original gle: preserve the privileged runtime's tmpDir whenever nodeRepl is truthy. */
export function profileTemporaryDirectory() {
  return "nodeRepl" in globalThis && (globalThis as any).nodeRepl
    ? (globalThis as any).nodeRepl.tmpDir
    : tmpdir();
}
/** Load the upstream dependency lazily, matching the original optional dynamic import.
 * The reader catches import failures and preserves the original null result.
 */
export function loadClassicLevel() {
  return import("classic-level");
}
/** Original T6/wle/_le, composed with restored C6 and upstream ClassicLevel. */
export function createBrowserProfileReader(deps: BrowserProfileDependencies) {
  const directory = deps.directory ?? browserProfileDirectory,
    readText = deps.readText ?? ((path: string) => readFile(path, "utf8")),
    exists = deps.exists ?? existsSync,
    copy = deps.copy ?? cp,
    makeTemporary = deps.makeTemporary ?? mkdtemp,
    remove = deps.remove ?? rm;
  async function readInstanceId(
    root: string,
    profileId: string,
    extensionId: string,
  ) {
    const source = resolve(
      root,
      profileId,
      "Local Extension Settings",
      extensionId,
    );
    if (!exists(source)) return null;
    const Database = (
      await (deps.loadClassicLevel ?? loadClassicLevel)().catch(() => null)
    )?.ClassicLevel;
    if (Database == null) return null;
    const temporary = await makeTemporary(
      resolve(
        (deps.temporaryDirectory ?? profileTemporaryDirectory)(),
        "codex",
      ),
    );
    await copy(source, temporary, { recursive: true });
    await remove(resolve(temporary, "LOCK"));
    const database = new Database(temporary, {
      createIfMissing: false,
      keyEncoding: "utf8",
      valueEncoding: "utf8",
    });
    try {
      await database.open();
      const raw = await database.get("extensionInstanceId");
      if (!raw) return null;
      const value = JSON.parse(raw);
      return typeof value !== "string" ? null : value;
    } finally {
      await database.close();
      await remove(temporary, { force: true, recursive: true });
    }
  }
  async function readProfileList(root: string) {
    const state = JSON.parse(await readText(resolve(root, "Local State")));
    return state.profile.profiles_order
      .map((id: string, orderingIndex: number) => {
        const info = state.profile.info_cache[id];
        return info
          ? {
              id,
              name: info.name,
              isLastUsed: state.profile.last_used === id,
              orderingIndex,
              avatarUrl: info.avatar_icon,
            }
          : null;
      })
      .filter((profile: any) => profile != null);
  }
  async function readProfiles(
    family: string,
    extensionId: string,
    platform: string,
  ) {
    const root = directory(family, platform),
      profiles = await readProfileList(root);
    return Promise.all(
      profiles.map(async (profile: any) => ({
        ...profile,
        instanceId: await readInstanceId(root, profile.id, extensionId).catch(
          (error) => {
            deps.reportError(error);
            return null;
          },
        ),
      })),
    );
  }
  return {
    readInstanceId,
    readProfileList,
    readProfiles,
    enrichProfile: createProfileEnrichment(readProfiles),
  };
}
