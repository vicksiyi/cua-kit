import { attachCdpBrowser } from "./attached-browser";
/** Reuse @core authenticated local host framing, with a CDP provider instead of an extension. */
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { startNativeHost } from "@core/native-host";
import { BrowserRpcPeer } from "@core/core/browserRpcPeer";
import {
  NativePipeFrameDecoder,
  encodeNativePipeFrame,
} from "@core/browser/nativePipe";
import { startOwnedCdpBrowser } from "./owned-browser";
import { CdpProvider } from "./provider";
export async function startCdpHost(
  options: { headless?: boolean; endpoint?: string } = {},
) {
  const browser = options.endpoint
    ? await attachCdpBrowser(options.endpoint)
    : await startOwnedCdpBrowser(options);
  const directory = await realpath(await mkdtemp("/tmp/core-cdp-host-"));
  const incoming = new PassThrough(),
    outgoing = new PassThrough();
  const decoder = new NativePipeFrameDecoder(1024 * 1024);
  let callback: (message: any) => void = () => {};
  const peer = new BrowserRpcPeer({
    setMessageCallback(value) {
      callback = value;
    },
    sendMessage(message) {
      incoming.write(
        encodeNativePipeFrame(JSON.stringify(message), 1024 * 1024),
      );
    },
  });
  const provider = new CdpProvider(
    browser.connection,
    (method, params) => peer.sendNotification(method, params),
    browser.context,
    browser.ownership,
  );
  // Explicit table: private provider methods are not remotely callable.
  for (const method of [
    "nameSession",
    "finalizeTabs",
    "markTab",
    "turnEnded",
    "ping",
    "getInfo",
    "getTabs",
    "getUserTabs",
    "claimUserTab",
    "createTab",
    "attach",
    "attachBrowserUseNetworkPolicy",
    "executeCdp",
    "getCommittedTabUrl",
    "focusTab",
    "detach",
    "attachTarget",
    "detachTarget",
  ] as const)
    peer.registerRequestHandler(method, (request: any) =>
      (provider[method] as any).call(provider, request),
    );
  outgoing.on("data", (bytes) => {
    for (const frame of decoder.push(bytes)) callback(JSON.parse(frame));
  });
  let host: Awaited<ReturnType<typeof startNativeHost>>;
  try {
    await provider.installNetworkRouting();
    host = await startNativeHost(incoming, outgoing, {
      parentDirectory: directory,
    });
  } catch (error) {
    await provider.close().catch(() => {});
    await browser.close();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  let closing: Promise<void> | undefined;
  return {
    endpoint: host.endpoint,
    endpointFile: host.endpointFile,
    close: () =>
      (closing ??= (async () => {
        try {
          await provider.close();
        } finally {
          try {
            await host.close();
          } finally {
            incoming.destroy();
            outgoing.destroy();
            await browser.close();
            await rm(directory, { recursive: true, force: true });
          }
        }
      })()),
  };
}
