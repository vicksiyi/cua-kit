export async function screenshot_bytes(url: string): Promise<Uint8Array> {
  if (url.startsWith("data:"))
    return Uint8Array.from(Buffer.from(url.split(",")[1] ?? "", "base64"));
  const fs = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  return fs.readFile(fileURLToPath(url));
}
