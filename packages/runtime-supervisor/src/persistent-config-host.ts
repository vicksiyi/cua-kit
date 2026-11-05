/** Independent opt-in preference persistence; no authority to change config or requirements. */
import { constants } from "node:fs";
import { lstat, open, realpath, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { stringify } from "smol-toml";
import { assertJsonValue, createReadonlyConfigHost, type ReadonlyConfigSources } from "./config-host";
import type { Message } from "./session";

export async function createPersistentConfigHost(sources: ReadonlyConfigSources,
  writablePaths: readonly string[]) {
  const read = createReadonlyConfigHost(sources);
  const protectedFiles = await Promise.all([sources.configFile, sources.requirementsFile].map(async path => {
    const resolved = await realpath(path); return { path: resolved, info: await lstat(resolved) };
  }));
  const files = new Map<string, { path: string; parent: string; dev: number; ino: number }>();
  for (const key of writablePaths) {
    const selected = sources.tomlFiles[key];
    if (!Object.hasOwn(sources.tomlFiles, key) || !selected || key.toLowerCase() === "config.toml")
      throw Error("Writable preference path must be explicitly mapped");
    const info = await lstat(selected), path = await realpath(selected), parent = dirname(path), directory = await lstat(parent);
    if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1 ||
        protectedFiles.some(file => file.path === path || (file.info.dev === info.dev && file.info.ino === info.ino)))
      throw Error("Preference writes cannot target symlinks, hardlinks, config or requirements");
    if (!directory.isDirectory() || (directory.mode & 0o077) !== 0 || directory.uid !== process.getuid?.())
      throw Error("Preference directory must be private and owned by the current user");
    files.set(key, { path, parent, dev: directory.dev, ino: directory.ino });
  }
  const queues = new Map<string, Promise<unknown>>();
  return async (message: Readonly<Message>, context?: { signal?: AbortSignal }): Promise<Message> => {
    if (message.type !== "config_action" || message.action !== "write_toml") return read(message);
    const file = files.get(message.path);
    if (!file) throw Error("Preference write path is not authorized");
    const value = message.value;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Preference value must be a TOML table");
    let text: string;
    try { assertJsonValue(value); text = stringify(value); } catch { throw Error("Preference value cannot be serialized as TOML"); }
    if (Buffer.byteLength(text) > 1024 * 1024) throw Error("Preference write exceeds size limit");
    const previous = queues.get(file.path) ?? Promise.resolve();
    const pending = previous.catch(() => {}).then(async () => {
      context?.signal?.throwIfAborted();
      const parent = await lstat(file.parent);
      if (parent.dev !== file.dev || parent.ino !== file.ino || !parent.isDirectory() || (parent.mode & 0o077) !== 0)
        throw Error("Preference directory changed after registration");
      // Existing corrupt/missing files are not silently replaced with a permission grant.
      await read({ type: "config_action", action: "read_toml", path: message.path });
      const current = await lstat(file.path);
      if (!current.isFile() || current.nlink !== 1) throw Error("Preference file is not an ordinary unlinked file");
      const temp = join(file.parent, `.core-config-${randomUUID()}.tmp`);
      let handle;
      try {
        handle = await open(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
        await handle.writeFile(text); await handle.sync(); await handle.close(); handle = undefined;
        context?.signal?.throwIfAborted();
        await rename(temp, file.path);
        return { ok: true, value: {} };
      } finally { await handle?.close(); await rm(temp, { force: true }); }
    });
    queues.set(file.path, pending);
    try { return await pending; }
    finally { if (queues.get(file.path) === pending) queues.delete(file.path); }
  };
}
