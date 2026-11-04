import {
  TunnelHttpServer,
  type HttpTunnelCommand,
  type TunnelHttpEnvironment,
} from "./tunnel_http_server";
import {
  KernelJsHandler,
  registerKernelSessionTools,
  shouldDeferKernelCommand,
  type KernelJsHandlerHost,
} from "./kernel_js_handler";
import type { TunnelUnauthorizedRecovery } from "./tunnel_response_delivery";
/** Composition of original p_ over d_. The real account/chat/PDF/kernel host
 * is required; this constructor neither invents credentials nor grants control. */
export class KernelHttpTunnel<Pdf> extends TunnelHttpServer {
  readonly kernel: KernelJsHandler<Pdf>;
  constructor(
    config: { tunnelId: string; baseUrl: string; apiKey: string },
    env: TunnelHttpEnvironment,
    kernelHost: Omit<KernelJsHandlerHost<Pdf>, "disposeTransport">,
    onPollingFailure?: (
      reason: "unauthorized" | "invalid_tunnel",
    ) => Promise<unknown>,
    onResponseUnauthorized?: TunnelUnauthorizedRecovery,
  ) {
    super(
      config,
      { name: "node-repl-work", version: "0.0.1" },
      env,
      onPollingFailure,
      onResponseUnauthorized,
    );
    this.kernel = new KernelJsHandler({
      ...kernelHost,
      disposeTransport: () => super.dispose(),
    });
    registerKernelSessionTools(this.kernel, this);
  }
  override shouldDeferCommand(command: HttpTunnelCommand) {
    return shouldDeferKernelCommand(command);
  }
  override onSessionTerminated(command: HttpTunnelCommand) {
    return this.kernel.onSessionTerminated(command);
  }
  suspend() {
    this.kernel.suspend();
  }
  override dispose() {
    this.kernel.dispose();
  }
}
