import {
  createExtensionBrowserFoundation,
  type ExtensionBrowserHost,
} from "./browser_foundation";
import { createNativeTransportClass } from "./native_transport";
import {
  ExtensionBrowserPeer,
  type ExtensionBrowserPeerOptions,
} from "./browser_peer";
import type { BrowserCommandOptions } from "./command_handler";
import type { BrowserSessionDependencies } from "./browser_session";

/** Native control portion of dR: one foundation/session handler shared by the
 * transport peer and kernel callers. Full dR lifecycle/UI registration is separate.
 * hostName is explicit so an independent deployment uses its own registered host.
 */
export function createNativeBrowserController(options: {
  host: ExtensionBrowserHost;
  navigator: { userAgent: string; [name: string]: unknown };
  hostName: string | string[];
  sessionDiagnostics: Pick<BrowserSessionDependencies, "metric" | "warn">;
  handlerOptions?: BrowserCommandOptions;
  peerOptions?: ExtensionBrowserPeerOptions;
}) {
  const foundation = createExtensionBrowserFoundation(options.host);
  const Handler = foundation.createHandlerClass(
    { navigator: options.navigator },
    options.sessionDiagnostics,
  );
  const handler = new Handler(options.handlerOptions);
  const Transport = createNativeTransportClass(options.host);
  const transport = new Transport(options.hostName);
  const peer = new ExtensionBrowserPeer(
    transport,
    handler,
    options.peerOptions,
  );
  return { foundation, handler, transport, peer };
}
