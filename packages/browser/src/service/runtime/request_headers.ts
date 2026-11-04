const sessionPlaceholder = "{{session_id}}";
const blockedHeaders = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "cookie2",
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
  "origin",
  "referer",
  "accept-encoding",
]);
function invalid(): never {
  throw new Error("Invalid request_headers policy.");
}
/** Original u5. Validation is performed after placeholder substitution and lowercasing names. */
export function resolveRequestHeaders(
  headers: Array<{ name: string; value: string }>,
  sessionId: string,
) {
  if (headers.length > 16) invalid();
  const names = new Set<string>();
  let length = 0;
  return headers.map((header) => {
    const substitute = (value: string) => {
      if (/[{}]/.test(value.replaceAll(sessionPlaceholder, ""))) invalid();
      return value.replaceAll(sessionPlaceholder, () => sessionId);
    };
    const name = substitute(header.name).toLowerCase(),
      value = substitute(header.value);
    length += name.length + value.length;
    if (
      name.length > 256 ||
      !/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(name) ||
      blockedHeaders.has(name) ||
      name.startsWith("sec-") ||
      name.startsWith("proxy-") ||
      names.has(name) ||
      value.length > 8192 ||
      /[^\x20-\x7e]/.test(value) ||
      length > 32768
    )
      invalid();
    names.add(name);
    return { name, value };
  });
}
/** Original VC validates normalized values, but returns the original template/name casing. */
export function validateRequestHeaders(
  input: any,
): Array<{ name: string; value: string }> {
  if (!Array.isArray(input) || input.length > 16) invalid();
  const headers = input.map((header) => {
    if (
      header == null ||
      typeof header !== "object" ||
      !("name" in header) ||
      typeof header.name !== "string" ||
      Object.keys(header).some((key) => key !== "name" && key !== "value") ||
      !("value" in header) ||
      typeof header.value !== "string"
    )
      invalid();
    return { name: header.name, value: header.value };
  });
  resolveRequestHeaders(headers, "session");
  return headers;
}
