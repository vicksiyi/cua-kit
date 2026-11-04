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
