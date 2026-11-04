import {
  NativePipeTransport,
  type NativePipeOptions,
  type NativePipeSocket,
} from "./native_pipe";
export function nativePipeMessage(value: any) {
  if (value == null || typeof value !== "object" || Array.isArray(value))
    throw Error("invalid native pipe transport message");
  return value;
}
export function privilegedNativePipe() {
  const bridge = (globalThis as any).nodeRepl?.nativePipe;
  return bridge == null || typeof bridge.createConnection !== "function"
    ? null
    : bridge;
}
export function nativePipeUnavailableMessage(environment: string) {
  const message =
    "privileged native pipe bridge is not available; browser-client is not trusted";
  return environment === "production"
    ? message
    : `${message}. Browser Use loaded stale or overwritten bundled plugins. Another ChatGPT desktop app may have overwritten them. Ask the user to use Debug Menu > Plugins > Reload bundled plugins, then retry.`;
}
/** Original ub/Vo. Connection creation requires the privileged bridge; no raw socket fallback. */
export function createBrowserPipeClass(
  environment: () => string,
  getBridge = privilegedNativePipe,
) {
  async function connect(
    path: string,
    options: NativePipeOptions,
    message?: string,
  ) {
    const bridge = getBridge();
    if (bridge == null)
      throw Error(message ?? nativePipeUnavailableMessage(environment()));
    return new NativePipeTransport(
      await bridge.createConnection(path),
      options,
    );
  }
  class BrowserPipe extends NativePipeTransport {
    constructor(socket: NativePipeSocket) {
      super(socket, { decodeMessage: nativePipeMessage });
    }
    static async create(path: string) {
      return await connect(path, { decodeMessage: nativePipeMessage });
    }
  }
  return { BrowserPipe, connect };
}
