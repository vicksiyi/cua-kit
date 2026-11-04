/** Original us: reject unpaired UTF-16 surrogates. */
function wellFormed(value: string) {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 55296 && code <= 56319) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 56320 && next <= 57343)) return false;
      index++;
    } else if (code >= 56320 && code <= 57343) return false;
  }
  return true;
}
/** Original gc. Retain valid stored strings verbatim; do not trim or require UUID syntax. */
export function parseExtensionInstanceId(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    value.trim().length > 0 &&
    wellFormed(value)
    ? value
    : null;
}
/** Original Be/Kg: concurrent callers share a promise, failures clear it for retry. */
export function createExtensionInstanceIdReader(host: {
  chrome: Pick<typeof chrome, "storage">;
  crypto: Pick<Crypto, "randomUUID">;
}) {
  let pending: Promise<string> | undefined;
  async function load() {
    const { extensionInstanceId } = await host.chrome.storage.local.get(
      "extensionInstanceId",
    );
    const stored = parseExtensionInstanceId(extensionInstanceId);
    if (stored != null) return stored;
    await host.chrome.storage.session.remove("nodeReplTunnel");
    await host.chrome.storage.local.remove("browserUseTunnels");
    const generated = host.crypto.randomUUID();
    await host.chrome.storage.local.set({ extensionInstanceId: generated });
    return generated;
  }
  return function getExtensionInstanceId() {
    pending ??= load().catch((error) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
}
