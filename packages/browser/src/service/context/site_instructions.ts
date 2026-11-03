export interface InstructionResponse {
  frameId: string;
  request: { url: string };
  responseHeaders?: Array<{ name: string; value: string }>;
}
/** Original mg/WF. Header consumption mutates the response even when proxy use is disabled. */
export class SiteInstructions {
  proxyEnabled: boolean;
  instructions = new Map<
    number,
    { instruction: string; url: string; frameId: string }
  >();
  constructor(proxyEnabled: boolean) {
    this.proxyEnabled = proxyEnabled;
  }
  capture(tabId: number, response: InstructionResponse) {
    this.clearFrame(tabId, response.frameId);
    const value = response.responseHeaders?.find(
      (header) => header.name.toLowerCase() === "x-openai-site-instruction",
    )?.value;
    if (value != null) {
      response.responseHeaders = response.responseHeaders?.filter(
        (header) => header.name.toLowerCase() !== "x-openai-site-instruction",
      );
      if (this.proxyEnabled)
        try {
          const url = new URL(response.request.url),
            hostname = url.hostname.replace(/\.$/, "");
          if (
            !["http:", "https:"].includes(url.protocol) ||
            hostname === "localhost" ||
            hostname === "loopback" ||
            hostname.endsWith(".localhost") ||
            hostname === "[::1]" ||
            hostname.startsWith("127.") ||
            hostname.startsWith("169.254.") ||
            /^\[fe[89ab][0-9a-f]:/.test(hostname) ||
            /^\[::ffff:(7f[0-9a-f]{2}|a9fe):/.test(hostname) ||
            hostname === "terminal.local"
          )
            return;
          this.instructions.set(tabId, {
            instruction: decodeURIComponent(value),
            url: response.request.url,
            frameId: response.frameId,
          });
        } catch {
          this.instructions.delete(tabId);
        }
    }
  }
  peek(tabId: number, url: string) {
    const entry = this.instructions.get(tabId);
    if (!(entry == null || entry.url !== url.split("#", 1)[0]))
      return entry.instruction;
  }
  take(tabId: number, url: string) {
    const instruction = this.peek(tabId, url);
    this.instructions.delete(tabId);
    return instruction;
  }
  clearFrame(tabId: number, frameId: string) {
    if (this.instructions.get(tabId)?.frameId === frameId)
      this.instructions.delete(tabId);
  }
  clear(tabId: number) {
    this.instructions.delete(tabId);
  }
}
