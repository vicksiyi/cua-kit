export interface KernelFetchResponse {
  body: string | null;
  headers: [string, string][];
  status: number;
  statusText: string;
}
/** Original pg/ol/wl; standard browser base64 primitives preserve byte semantics. */
export function encodeKernelBytes(bytes: Uint8Array): string {
  const view = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let binary = "";
  for (let offset = 0; offset < view.length; offset += 32768) {
    binary += String.fromCharCode(...view.subarray(offset, offset + 32768));
  }
  return btoa(binary);
}
export async function serializeKernelResponse(
  response: Response,
): Promise<KernelFetchResponse> {
  return {
    body:
      response.body == null
        ? null
        : encodeKernelBytes(new Uint8Array(await response.arrayBuffer())),
    headers: [...response.headers],
    status: response.status,
    statusText: response.statusText,
  };
}
export interface KernelFetchScope {
  signal: AbortSignal;
  disposalSignal: AbortSignal;
  chatApi: {
    request(
      path: string,
      init: RequestInit,
      options: { readResponse: typeof serializeKernelResponse },
    ): Promise<KernelFetchResponse>;
  };
}
/** Ds fetch/abortFetch/dispose. The authenticated site-status route needs an active scope. */
export function createKernelFetchController(
  scopeId: string,
  host: {
    siteStatusUrl: URL;
    getScope(id: string): KernelFetchScope;
    fetch: typeof globalThis.fetch;
  },
) {
  const fetches = new Map<unknown, AbortController>();
  return {
    fetches,
    async fetch({
      id,
      url,
      init,
    }: {
      id: unknown;
      url: string;
      init: Omit<RequestInit, "body"> & { body?: string | null };
    }) {
      const controller = new AbortController();
      fetches.set(id, controller);
      try {
        let parsed: URL | null;
        try {
          parsed = new URL(url);
        } catch {
          parsed = null;
        }
        const body =
          init.body == null
            ? null
            : Uint8Array.from(atob(init.body), (char) => char.charCodeAt(0));
        if (
          parsed != null &&
          !parsed.username &&
          !parsed.password &&
          parsed.origin === host.siteStatusUrl.origin &&
          parsed.pathname === host.siteStatusUrl.pathname
        ) {
          const scope = host.getScope(scopeId);
          return await scope.chatApi.request(
            `/aura/site_status${parsed.search}`,
            {
              ...init,
              body,
              signal: AbortSignal.any([
                controller.signal,
                scope.signal,
                scope.disposalSignal,
              ]),
            },
            { readResponse: serializeKernelResponse },
          );
        }
        return await serializeKernelResponse(
          await host.fetch(url, { ...init, body, signal: controller.signal }),
        );
      } finally {
        fetches.delete(id);
      }
    },
    abortFetch(id: unknown) {
      fetches.get(id)?.abort();
    },
    dispose() {
      for (const controller of fetches.values()) controller.abort();
      fetches.clear();
    },
  };
}

/** Original ol. */
export function decodeKernelBytes(value: string) {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}
