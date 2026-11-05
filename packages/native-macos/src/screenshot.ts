/** Validates the helper's PNG envelope before exposing it through Sky's data URL. */
import { CuaError } from "./errors";
export function screenshotDataUrl(value: unknown): string {
  const invalid = () => new CuaError("PROVIDER_DISCONNECTED", "Malformed native screenshot envelope");
  if (!value || typeof value !== "object") throw invalid();
  const raw = value as Record<string, unknown>;
  if (raw.mimeType !== "image/png" || raw.coordinateSpace !== "window-image-pixels" || typeof raw.data !== "string" || raw.data.length > 7 * 1024 * 1024) throw invalid();
  const bytes = Buffer.from(raw.data, "base64");
  if (bytes.length < 33 || bytes.length > 5 * 1024 * 1024 || bytes.toString("base64") !== raw.data || bytes.subarray(0,8).toString("hex") !== "89504e470d0a1a0a" || bytes.readUInt32BE(8) !== 13 || bytes.toString("ascii",12,16) !== "IHDR") throw invalid();
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > 8192 || height > 8192 || width * height > 32_000_000 || raw.pixelWidth !== width || raw.pixelHeight !== height) throw invalid();
  return `data:image/png;base64,${raw.data}`;
}
