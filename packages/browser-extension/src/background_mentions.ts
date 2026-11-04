import { sendTabMentionsInvalidated } from "./tab_mention_messages";

type MentionPeer = { sendBrowserTabMentionsInvalidated(): void };
/** Original dR local o/w: lazy observation captures the native peer once,
 * but consults the current kernel-peer map for every invalidation. */
export function createBackgroundMentionInvalidationStarter(host: {
  nativePeer(): MentionPeer | null;
  kernelPeers(): Iterable<{ browser: MentionPeer }>;
  runtime: Pick<typeof chrome.runtime, "sendMessage">;
  observeTabs(notify: () => void): unknown;
  subscribeProvider(notify: () => void): unknown;
}) {
  return () => {
    const peer = host.nativePeer();
    if (peer == null) return;
    const notify = () => {
      sendTabMentionsInvalidated(peer, host.runtime);
      for (const { browser } of host.kernelPeers())
        browser.sendBrowserTabMentionsInvalidated();
    };
    host.observeTabs(notify);
    host.subscribeProvider(notify);
  };
}
