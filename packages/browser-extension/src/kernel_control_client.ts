import { createBrowserRpcPeerClass, type BrowserRpcTransport } from "@core/core/browserRpcPeer";
import { encodeKernelBytes } from "./kernel_fetch";
const RpcPeer = createBrowserRpcPeerClass(false);
/** Original OU: bound control methods and Fetch-compatible body/response transport. */
export class KernelControlClient extends RpcPeer {
  constructor(transport: BrowserRpcTransport, handler: object) {
    super(transport);
    this.registerRequestHandlerObject(handler);
    for (const name of ["fetch", "getChatGptAccessPolicy", "isBrowserElicitationEnabled", "readRequirements", "captureTabPdfToLibrary", "readSessionConfig", "writeSessionConfig", "readBrowserSettings", "patchBrowserSettings", "createElicitation", "displayValue", "displayImage"] as const)
      (this as any)[name] = this[name].bind(this);
  }
  async fetch(url: string | URL, { signal, ...init }: RequestInit = {}): Promise<Response> {
    signal?.throwIfAborted();
    const bodyResponse = new Response(init.body, { headers: init.headers });
    const body = bodyResponse.body == null ? null : encodeKernelBytes(new Uint8Array(await bodyResponse.arrayBuffer()));
    signal?.throwIfAborted();
    const id = crypto.randomUUID();
    const onAbort = () => { this.sendRequest("abortFetch", id).catch(() => {}); };
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const response = await this.sendRequest("fetch", { id, url: String(url), init: { ...init, headers: [...bodyResponse.headers], body } });
      signal?.throwIfAborted();
      return response.status === 0 ? Response.error() : new Response(response.body == null ? null : Uint8Array.from(atob(response.body), char => char.charCodeAt(0)), response);
    } catch (error) { signal?.throwIfAborted(); throw error; }
    finally { signal?.removeEventListener("abort", onAbort); }
  }
  getChatGptAccessPolicy() { return this.sendRequest("getChatGptAccessPolicy"); }
  isBrowserElicitationEnabled() { return this.sendRequest("isBrowserElicitationEnabled"); }
  readRequirements() { return this.sendRequest("readRequirements"); }
  captureTabPdfToLibrary(params: unknown) { return this.sendRequest("captureTabPdfToLibrary", params); }
  readSessionConfig(sessionId: string) { return this.sendRequest("readSessionConfig", sessionId); }
  writeSessionConfig(params: unknown) { return this.sendRequest("writeSessionConfig", params); }
  readBrowserSettings(force?: boolean) { return this.sendRequest("readBrowserSettings", force); }
  patchBrowserSettings(params: unknown) { return this.sendRequest("patchBrowserSettings", params); }
  createElicitation(params: unknown) { return this.sendRequest("createElicitation", params); }
  displayValue(value: unknown) { return this.sendRequest("displayValue", value); }
  displayImage(value: string) { return this.sendRequest("displayImage", value); }
}
/** Original HU; shares the inspected Mt/Ql RPC implementation with the control client. */
export class KernelAgentPeer extends RpcPeer {
  constructor(transport: BrowserRpcTransport, handler: object) {
    super(transport);
    this.registerRequestHandlerObject(handler);
  }
}
