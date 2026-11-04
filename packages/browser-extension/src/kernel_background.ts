import type { BrowserRpcTransport } from "@core/core/browserRpcPeer";

export interface BackgroundKernelPeer {
  browser: unknown;
  control: { sendTurnEnded(metadata: unknown): Promise<unknown> };
  controlImpl: unknown;
}
export interface BackgroundKernelHost {
  peers: Map<string, BackgroundKernelPeer>;
  createControl(scopeId: string): unknown;
  createBrowserPeer(transport: BrowserRpcTransport): unknown;
  createControlPeer(transport: BrowserRpcTransport, implementation: unknown): BackgroundKernelPeer["control"];
  registerConnections(
    connected: (id: string, browser: BrowserRpcTransport, control: BrowserRpcTransport) => void,
    disconnected: (id: string) => void,
  ): void;
  registerTurnEnded(callback: (id: string, metadata: unknown) => Promise<void>): Promise<unknown>;
  turnEnded(metadata: unknown): Promise<unknown>;
  observeGate(callback: (enabled: boolean) => void, signal: AbortSignal): Promise<unknown>;
  reportGateError(error: unknown, stage: string): void;
  warn(message: string): void;
  reportTurnEndedError(error: unknown): void;
}
/** Original dR kernel-gate wiring. Activation is permanent and registers only once. */
export function registerBackgroundKernel(host: BackgroundKernelHost) {
  const subscription = new AbortController();
  const activate = () => {
    if (subscription.signal.aborted) return;
    subscription.abort();
    host.registerConnections((id, browser, control) => {
      const implementation = host.createControl(id);
      host.peers.set(id, {
        browser: host.createBrowserPeer(browser),
        control: host.createControlPeer(control, implementation),
        controlImpl: implementation,
      });
    }, (id) => { host.peers.delete(id); });
    host.registerTurnEnded(async (id, metadata) => {
      const peer = host.peers.get(id);
      if (peer == null) {
        await host.turnEnded(metadata);
        return;
      }
      try {
        await peer.control.sendTurnEnded(metadata);
      } catch (error) {
        await host.turnEnded(metadata);
        throw error;
      }
    }).catch(host.reportTurnEndedError);
  };
  host.observeGate((enabled) => { if (enabled) activate(); }, subscription.signal)
    .catch((error) => {
      host.reportGateError(error, "kernel-gate-subscription");
      host.warn("Failed to observe Chrome extension kernel gate.");
    });
}
