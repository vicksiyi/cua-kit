/** Independent media envelope conversion. No URL fetching beyond the data: scheme. */
import type {
  ImageContent,
  AudioContent,
} from "@modelcontextprotocol/sdk/types.js";
import type { Message } from "./session";
export async function decodeMediaMessage(
  message: Readonly<Message>,
): Promise<ImageContent | AudioContent> {
  const kind =
    message.type === "emit_image"
      ? "image"
      : message.type === "emit_audio"
        ? "audio"
        : undefined;
  if (!kind) throw Error("Unsupported media operation");
  const value = kind === "image" ? message.image_url : message.audio_url;
  if (
    typeof value !== "string" ||
    value.length > 8 * 1024 * 1024 ||
    !/^data:/i.test(value)
  )
    throw Error("Media requires a bounded data URL");
  const url = new URL(value);
  if (url.protocol !== "data:")
    throw Error("Only data media URLs are supported");
  // Node's built-in data URL decoder handles percent-encoded bytes and base64.
  // This URL has already been restricted to data:, so no network authority is used.
  const response = await fetch(url);
  const mimeType = (response.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (
    !mimeType.startsWith(kind + "/") ||
    !/^[a-z]+\/[a-z0-9.+-]+$/.test(mimeType)
  )
    throw Error("Media MIME type does not match operation");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 6 * 1024 * 1024)
    throw Error("Empty or oversized media payload");
  return { type: kind, data: bytes.toString("base64"), mimeType };
}
