import { lstat, readdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

export async function assertPrivateEndpointDirectory(directory: string) {
  if (!isAbsolute(directory))
    throw Error("Endpoint directory must be absolute");
  const stat = await lstat(directory);
  if (
    !stat.isDirectory() ||
    (stat.mode & 0o077) !== 0 ||
    (process.getuid && stat.uid !== process.getuid())
  )
    throw Error(
      "Endpoint directory must be private and owned by the current user",
    );
}

/** Discover descriptors only inside the explicitly configured independent installation. */
export async function discoverEndpointFiles(directory: string) {
  await assertPrivateEndpointDirectory(directory);
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("core-cua-")) continue;
    const file = join(directory, entry.name, "endpoint.json");
    try {
      await lstat(file);
      files.push(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (!files.length)
    throw Error(
      "No independent browser host is running. Load the Core CUA extension in Chrome first.",
    );
  return files.sort();
}

/** Paths only. Descriptor secrets stay inside the trusted host process. */
export function parseEndpointFiles(value: string | undefined): string[] {
  let files: unknown;
  try {
    files = JSON.parse(value ?? "null");
  } catch {
    throw Error(
      "CORE_CUA_ENDPOINT_FILES must be a JSON array of endpoint file paths",
    );
  }
  if (
    !Array.isArray(files) ||
    files.length === 0 ||
    !files.every((file) => typeof file === "string" && file.length > 0)
  )
    throw Error(
      "CORE_CUA_ENDPOINT_FILES must be a nonempty JSON array of endpoint file paths",
    );
  return files;
}
