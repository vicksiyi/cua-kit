export type KernelOutput =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: "image/png" };
export interface KernelExecutionScope<Client, ChatApi, Pdf> {
  client: Client;
  chatApi: ChatApi;
  content: KernelOutput[];
  signal: AbortSignal;
  disposalSignal: AbortSignal;
  onPdfUploaded?: (pdf: Pdf) => void;
}
/** Original Dr/Hg/Le; one registry per background runtime, shared by execution/control. */
export function createKernelScopeRegistry<Client, ChatApi, Pdf = unknown>() {
  const active = new Map<string, KernelExecutionScope<Client, ChatApi, Pdf>>();
  function begin(
    scopeId: string,
    client: Client,
    signal: AbortSignal,
    chatApi: ChatApi,
    onPdfUploaded?: (pdf: Pdf) => void,
  ) {
    if (active.has(scopeId))
      throw new Error("JavaScript kernel is already executing");
    const disposal = new AbortController();
    const scope: KernelExecutionScope<Client, ChatApi, Pdf> = {
      client,
      content: [],
      chatApi,
      signal,
      disposalSignal: disposal.signal,
      onPdfUploaded,
    };
    active.set(scopeId, scope);
    return {
      content: scope.content,
      dispose() {
        disposal.abort(new Error("JavaScript kernel execution ended"));
        if (active.get(scopeId) === scope) active.delete(scopeId);
      },
    };
  }
  function get(scopeId: string) {
    const scope = active.get(scopeId);
    if (scope == null) throw new Error("JavaScript kernel is not executing");
    if (scope.signal.aborted) throw scope.signal.reason;
    return scope;
  }
  return { begin, get };
}
/** Ds output methods. Values are serialized before checking whether the scope is active. */
export function createKernelOutputWriter(
  scopeId: string,
  getScope: (id: string) => { content: KernelOutput[] },
) {
  return {
    displayValue(value: unknown) {
      const text =
        typeof value === "string"
          ? value
          : (JSON.stringify(value) ?? String(value));
      getScope(scopeId).content.push({ text, type: "text" });
    },
    displayImage(data: string) {
      getScope(scopeId).content.push({
        data,
        mimeType: "image/png",
        type: "image",
      });
    },
  };
}
