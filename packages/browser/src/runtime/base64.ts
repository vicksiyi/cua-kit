/** Original dl, shared by browser screenshot and document-context consumers. */
export function decodeBase64(data: string): Uint8Array {
  const decoded = atob(data),
    bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1)
    bytes[index] = decoded.charCodeAt(index);
  return bytes;
}
