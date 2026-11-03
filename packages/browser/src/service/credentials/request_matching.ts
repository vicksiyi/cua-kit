export interface CredentialRequest {
  url: string;
  headers: Record<string, string>;
  postData?: string;
}
/** Original aJ: keep a non-exportable keyed digest, inspect URL/referrer transformations. */
export async function createUnsafeOrdinaryRequest(
  password: string | undefined,
) {
  if (password == null || password.length === 0)
    throw new Error("Browser credential submission is missing its password");
  const key = await crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const encoder = new TextEncoder();
  const digest = async (value: string) =>
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
    );
  const expected = await digest(password),
    length = password.length;
  const contains = async (value: string) => {
    if (value.length > 8192) return true;
    const variants = new Set([value]);
    for (const variant of variants) {
      if (variants.size > 128) return true;
      variants.add(variant.replace(/\+/g, " "));
      variants.add(
        variant.replace(/(?:%[\da-f]{2})+/gi, (encoded) => {
          try {
            return decodeURIComponent(encoded);
          } catch {
            return encoded;
          }
        }),
      );
      for (let start = 0; start + length <= variant.length; start += 64) {
        const hashes = await Promise.all(
          Array.from(
            { length: Math.min(64, variant.length - length - start + 1) },
            (_, offset) =>
              digest(variant.slice(start + offset, start + offset + length)),
          ),
        );
        if (
          hashes.some((hash) =>
            hash.every((byte, index) => byte === expected[index]),
          )
        )
          return true;
      }
    }
    return false;
  };
  return async (request: CredentialRequest) => {
    if (await contains(request.url)) return true;
    for (const [name, value] of Object.entries(request.headers))
      if (name.toLowerCase() === "referer" && (await contains(value)))
        return true;
    return false;
  };
}
/** Original uJ: exactly one string form value per expected field; compare keyed digests. */
export async function createCredentialRequestMatcher(
  fields: { name: string; value?: string }[],
) {
  if (fields.some(({ value }) => value == null))
    throw new Error(
      "Browser credential submission is missing a required value",
    );
  const key = await crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const encoder = new TextEncoder();
  const digest = async (value: string) =>
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
    );
  const expected = await Promise.all(
    fields.map(async ({ name, value }) => {
      if (value == null)
        throw new Error(
          "Browser credential submission is missing a required value",
        );
      return { name, hash: await digest(value) };
    }),
  );
  return async (request: CredentialRequest) => {
    if (request.postData == null || request.postData.length > 128 * 1024)
      return false;
    const contentType = Object.entries(request.headers).find(
      ([name]) => name.toLowerCase() === "content-type",
    )?.[1];
    if (typeof contentType !== "string") return false;
    const mime = contentType.split(";", 1)[0]?.trim().toLowerCase();
    let form: URLSearchParams | FormData;
    try {
      if (mime === "application/x-www-form-urlencoded")
        form = new URLSearchParams(request.postData);
      else if (mime === "multipart/form-data")
        form = await new Response(request.postData, {
          headers: { "Content-Type": contentType },
        }).formData();
      else return false;
      for (const entry of expected) {
        const values = form.getAll(entry.name),
          value = values[0];
        if (values.length !== 1 || typeof value !== "string") return false;
        const hash = await digest(value);
        if (hash.length !== entry.hash.length) return false;
        let difference = 0;
        for (const [index, byte] of entry.hash.entries())
          difference |= byte ^ (hash.at(index) ?? 0);
        if (difference !== 0) return false;
      }
      return true;
    } catch {
      return false;
    }
  };
}
