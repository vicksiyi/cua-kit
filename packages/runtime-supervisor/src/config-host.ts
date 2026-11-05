/** Independent read-only config adapter. No implicit ~/.codex access or empty-policy fallback. */
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { parse } from "smol-toml";
import type { Message } from "./session";

export interface ReadonlyConfigSources {
  /** TOML root returned as config; explicitly scoped to the listed worker cwd values. */
  configFile: string;
  requirementsFile: string;
  workingDirectories: readonly string[];
  /** Exact logical protocol path -> host file. No path concatenation or directory traversal. */
  tomlFiles: Readonly<Record<string, string>>;
}
const limit = 1024 * 1024;
function assertJsonValue(value: unknown): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) { value.forEach(assertJsonValue); return; }
  if (value && typeof value === "object" &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    Object.values(value).forEach(assertJsonValue); return;
  }
  throw Error("Configuration values must be JSON-compatible");
}
async function readTomlFile(path: string) {
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await file.stat();
    if (!info.isFile() || info.size > limit) throw Error();
    const bytes = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < bytes.length) {
      const read = await file.read(bytes, length, bytes.length - length, length);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    if (length > limit) throw Error();
    // Do not forward parser diagnostics: they can contain source lines/secrets.
    const parsed = parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length)));
    assertJsonValue(parsed);
    return JSON.parse(JSON.stringify(parsed));
  } catch {
    throw Error("Configured TOML source is unavailable, invalid, or exceeds its size limit");
  } finally {
    await file?.close();
  }
}
export function createReadonlyConfigHost(sources: ReadonlyConfigSources) {
  const configFile = sources.configFile, requirementsFile = sources.requirementsFile;
  const files = new Map(Object.entries(sources.tomlFiles));
  const directories = new Set(sources.workingDirectories);
  for (const path of [configFile, requirementsFile, ...files.values(), ...directories])
    if (typeof path !== "string" || !isAbsolute(path) || path.includes("\0"))
      throw Error("Configuration sources and working directories must be explicit absolute paths");
  return async (message: Readonly<Message>): Promise<Message> => {
    if (message.type !== "config_action") throw Error("Unsupported configuration host operation");
    if (message.action === "read_toml") {
      const file = files.get(message.path);
      if (!file) throw Error("Configuration path is not authorized");
      return { ok: true, value: await readTomlFile(file) };
    }
    if (message.action === "read_config_requirements")
      return { ok: true, value: { requirements: await readTomlFile(requirementsFile) } };
    if (message.action === "read_config") {
      if (!directories.has(message.cwd) || message.include_layers !== false)
        throw Error("Configuration scope or layer request is not supported");
      return { ok: true, value: { config: await readTomlFile(configFile) } };
    }
    throw Error("Configuration host is read-only; write operations are unsupported");
  };
}
