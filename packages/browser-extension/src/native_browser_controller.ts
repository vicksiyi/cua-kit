import {
  createExtensionBrowserFoundation,
  type ExtensionBrowserHost,
} from "./browser_foundation";
import { createNativeTransportClass } from "./native_transport";
import {
  ExtensionBrowserPeer,
  type ExtensionBrowserPeerOptions,
} from "./browser_peer";
import { createBackgroundMentionInvalidationStarter } from "./background_mentions";
import { extensionBuildChannel } from "./browser_platform";
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
  let nativePeer: ExtensionBrowserPeer | null = null;
  const startMentions = createBackgroundMentionInvalidationStarter({
    nativePeer: () => nativePeer,
    // Independent native deployment has no standalone kernel peers yet.
    kernelPeers: () => [],
    runtime: options.host.chrome.runtime,
    observeTabs: foundation.observeMentionInvalidations,
    subscribeProvider: (notify) => provider.subscribeInvalidations(notify),
  });
  const provider =
    options.handlerOptions?.browserTabMentionProvider ??
    new foundation.TabMentionProvider(
      options.handlerOptions?.buildChannel ?? extensionBuildChannel("prod"),
      foundation.tabFavicons.getInstance(),
      startMentions,
    );
  const handler = new Handler({
    ...options.handlerOptions,
    browserTabMentionProvider: provider,
  });
  const Transport = createNativeTransportClass(options.host);
  const transport = new Transport(options.hostName);
  const peer = new ExtensionBrowserPeer(
    transport,
    handler,
    options.peerOptions,
  );
  nativePeer = peer;
  return { foundation, handler, transport, peer };
}
