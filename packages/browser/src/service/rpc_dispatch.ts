import type { ApiManifest } from "../runtime/api_view";
import { BrowserCredentialRecoveryError } from "./errors/credential_recovery_error";
export interface ServiceSetupOptions {
  environment: string;
  undocumentedApiMembers?: unknown;
  excludedDocumentation?: unknown;
}
export interface BrowserServiceRuntime {
  apiManifest: ApiManifest;
  disabledMemberIds: Iterable<string>;
  executeAgentCommand(command: unknown): unknown | Promise<unknown>;
}
/** Original mH / p6 / mn boundaries, supplied by service assembly.
 * The dispatcher preserves the host protocol and does not create a replacement backend.
 */
export interface ServiceDispatcherDependencies<Host> {
  createHostRuntime(): Host | Promise<Host>;
  initializeRuntime(
    options: ServiceSetupOptions,
    host: Host,
  ): BrowserServiceRuntime | Promise<BrowserServiceRuntime>;
  withSpan<T>(
    name: string,
    attributes: Record<string, unknown>,
    run: () => Promise<T>,
  ): Promise<T>;
}
/** Original iy/hH/Gut closure. Each production module instance must create this closure only once. */
export function createServiceRpcDispatcher<Host>({
  createHostRuntime,
  initializeRuntime,
  withSpan,
}: ServiceDispatcherDependencies<Host>) {
  let runtime: Promise<BrowserServiceRuntime> | undefined;
  const handlers = {
    async setup({
      environment,
      undocumentedApiMembers,
      excludedDocumentation,
    }: ServiceSetupOptions) {
      if (
        environment !== "codex-app" &&
        environment !== "training" &&
        environment !== "cloud" &&
        environment !== "orbit"
      )
        throw new Error("Invalid browser service environment");
      runtime = withSpan(
        "browser_use.runtime.setup",
        { "browser_use.environment": environment },
        async () =>
          initializeRuntime(
            { environment, undocumentedApiMembers, excludedDocumentation },
            await createHostRuntime(),
          ),
      );
      const { apiManifest, disabledMemberIds } = await runtime;
      return {
        apiManifest,
        disabledMemberIds: [...disabledMemberIds],
        credentialRecoveryErrorVersion: 1,
      };
    },
    async execute(command: unknown) {
      if (runtime == null)
        throw new Error("Browser runtime has not been initialized");
      return await (await runtime).executeAgentCommand(command);
    },
    async executeWithRecovery(command: unknown) {
      try {
        return { ok: true, value: await handlers.execute(command) };
      } catch (error) {
        if (!(error instanceof BrowserCredentialRecoveryError)) throw error;
        return { ok: false, error: error.details };
      }
    },
  };
  return async function handleRpc(request: {
    method: string;
    params: unknown;
  }) {
    const handler = Object.getOwnPropertyDescriptor(
      handlers,
      request.method,
    )?.value;
    if (typeof handler !== "function")
      throw new Error("Unsupported browser service request");
    return await handler(request.params);
  };
}
