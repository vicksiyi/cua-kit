import { readFile } from "node:fs/promises";
export async function from_filepath(
  filepath: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = await readFile(filepath);
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
export function to_base64(bytes: Uint8Array) {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(
    "base64",
  );
}
export function to_data_url(bytes: Uint8Array, mime_type: string) {
  return `data:${mime_type};base64,${to_base64(bytes)}`;
}
