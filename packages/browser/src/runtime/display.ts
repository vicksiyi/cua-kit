/** Original browser-client u/h/m. Formatting is separate from transport and host RPC. */
export type DisplayValue =
  | { type: "function"; value: undefined }
  | { type: "value"; value: null | undefined | string | boolean | number }
  | { type: "object" | "error"; value: string };
export interface DisplayBridge {
  displayImage(value: Uint8Array): unknown | Promise<unknown>;
  displayValue(value: DisplayValue): unknown | Promise<unknown>;
}

function truncate(value: string, maxChars?: number): string {
  if (!(Number.isInteger(maxChars) && maxChars! > 0)) return value;
  if (value.length <= maxChars!) return value;
  return `${value.slice(0, maxChars)}[truncated ${value.length - maxChars!} chars]`;
}

function primitiveValue(value: unknown) {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  if (value instanceof String || value instanceof Boolean)
    return value.valueOf();
  if (value instanceof Number) {
    const number = value.valueOf();
    return Number.isFinite(number) ? number : undefined;
  }
}

async function display(
  bridge: DisplayBridge,
  value: unknown,
  maxChars?: number,
) {
  // Destructure before try: failure to obtain bridge methods is not converted to output.
  const { displayImage, displayValue } = bridge;
  let formatted: DisplayValue | null = null;
  try {
    if (value instanceof Uint8Array) {
      await displayImage(value);
      return;
    }
    if (value === undefined) formatted = { type: "value", value: undefined };
    else if (typeof value === "function")
      formatted = { type: "function", value: undefined };
    else {
      const primitive = primitiveValue(value);
      if (primitive !== undefined)
        formatted = { type: "value", value: primitive };
    }
    if (formatted === null) {
      let serialized = JSON.stringify(value);
      if (serialized === undefined) serialized = String(value);
      formatted = { type: "object", value: serialized };
    }
  } catch (error) {
    formatted = { type: "error", value: String(error) };
  }
  if (formatted) {
    if (formatted.type !== "function" && typeof formatted.value === "string") {
      formatted = { ...formatted, value: truncate(formatted.value, maxChars) };
    }
    // Errors in displayValue intentionally propagate; image/serialization errors above
    // instead become an error value. This asymmetry matches the original.
    await displayValue(formatted);
  }
}

export function createDisplaySideEffect({
  displayBridge,
  displayTruncateMaxChars,
}: {
  displayBridge: DisplayBridge;
  displayTruncateMaxChars?: number;
}) {
  return (value: unknown) =>
    display(displayBridge, value, displayTruncateMaxChars);
}
