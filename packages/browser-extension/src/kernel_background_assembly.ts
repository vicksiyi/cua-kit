import { ExtensionBrowserPeer, type ExtensionBrowserHandler, type ExtensionBrowserPeerOptions } from "./browser_peer";
import { createKernelControlClass, KernelControlPeer, type KernelControlHost } from "./kernel_control";
import { registerKernelConnections } from "./kernel_transport";
import { registerBackgroundKernel, type BackgroundKernelHost } from "./kernel_background";

/** dR composition: kernel connections share the same browser handler as the native peer. */
export function registerAssembledBackgroundKernel<Pdf>(host: {
  runtime: Parameters<typeof registerKernelConnections>[0];
  handler: ExtensionBrowserHandler & { turnEnded(metadata: unknown): Promise<unknown> };
  controlHost: KernelControlHost<Pdf>;
  browserPeerOptions?: ExtensionBrowserPeerOptions;
  observeGate: BackgroundKernelHost["observeGate"];
  registerTurnEnded: BackgroundKernelHost["registerTurnEnded"];
  reportGateError: BackgroundKernelHost["reportGateError"];
  reportTurnEndedError: BackgroundKernelHost["reportTurnEndedError"];
  warn: BackgroundKernelHost["warn"];
}) {
  const Control = createKernelControlClass(host.controlHost);
  type ControlInstance = InstanceType<typeof Control>;
  const peers = new Map<string, {
    browser: ExtensionBrowserPeer;
    control: KernelControlPeer;
    controlImpl: ControlInstance;
  }>();
  registerBackgroundKernel({
    ...host,
    peers,
    createControl: (id) => new Control(id),
    createBrowserPeer: (transport) => new ExtensionBrowserPeer(transport, host.handler, host.browserPeerOptions),
    createControlPeer: (transport, control) => new KernelControlPeer(transport, control as ControlInstance),
    registerConnections: (connected, disconnected) => registerKernelConnections(host.runtime, connected, disconnected),
    turnEnded: (metadata) => host.handler.turnEnded(metadata),
  });
  return peers;
}
