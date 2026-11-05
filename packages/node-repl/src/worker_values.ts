import { Buffer } from "node:buffer";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { inspect, types } from "node:util";
import { isArrayBuffer } from "./realmChecks";

export function getErrorDataProperty(
  error: unknown,
  key: PropertyKey,
): unknown {
  while (
    error !== null &&
    (typeof error === "object" || typeof error === "function")
  ) {
    if (types.isProxy(error)) {
      return undefined;
    }
    const descriptor = Object.getOwnPropertyDescriptor(error, key);
    if (descriptor !== undefined) {
      return descriptor.value;
    }
    error = Object.getPrototypeOf(error);
  }
  return undefined;
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}

export function formatLog(args: unknown[]): string {
  return args
    .map((arg) =>
      typeof arg === "string" ? arg : inspect(arg, { depth: 4, colors: false }),
    )
    .join(" ");
}

export function toByteArray(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (isArrayBuffer(value)) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

export function encodeByteImage(bytes: Uint8Array, mimeType: unknown) {
  if (bytes.byteLength === 0) {
    throw new Error("nodeRepl.emitImage expected non-empty bytes");
  }
  if (typeof mimeType !== "string" || !mimeType) {
    throw new Error("nodeRepl.emitImage expected a non-empty mimeType");
  }
  return {
    image_url: `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`,
  };
}

export function sniffImageMimeType(bytes: Uint8Array): string {
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.byteLength >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  throw new Error(
    "nodeRepl.emitImage could not infer image MIME type from bytes; expected PNG, JPEG, or WebP data",
  );
}

export function normalizeEmitImageValue(value: unknown): { image_url: string } {
  if (typeof value === "string") {
    if (!value) {
      throw new Error("nodeRepl.emitImage expected a non-empty image_url");
    }
    if (/^file:/i.test(value)) {
      const bytes = fs.readFileSync(fileURLToPath(value));
      return encodeByteImage(bytes, sniffImageMimeType(bytes));
    }
    if (!/^data:/i.test(value)) {
      throw new Error("nodeRepl.emitImage only accepts data or file URLs");
    }
    return { image_url: value };
  }
  const inferredBytes = toByteArray(value);
  if (inferredBytes) {
    return encodeByteImage(inferredBytes, sniffImageMimeType(inferredBytes));
  }
  if (isPlainObject(value) && "bytes" in value) {
    if (
      Object.keys(value).some((key) => key !== "bytes" && key !== "mimeType")
    ) {
      throw Object.assign(
        new Error("nodeRepl.emitImage received an unsupported value"),
        { code: "NODE_REPL_IMAGE_UNSUPPORTED_KEYS" },
      );
    }
    const bytes = toByteArray(value.bytes);
    if (!bytes) {
      throw new Error(
        "nodeRepl.emitImage expected bytes to be Buffer, Uint8Array, ArrayBuffer, or ArrayBufferView",
      );
    }
    return encodeByteImage(bytes, value.mimeType);
  }
  throw new Error("nodeRepl.emitImage received an unsupported value");
}
