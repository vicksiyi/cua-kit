import type { createChatApiClass } from "./chat_api";
import {
  createKernelHostRegistry,
  type KernelHostServices,
} from "./kernel_host";
import { createKernelScopeRegistry } from "./kernel_scope";
import { KernelHttpTunnel } from "./kernel_http_tunnel";
import type { KernelJsClient, KernelJsHandlerHost } from "./kernel_js_handler";
import type { TunnelHttpEnvironment } from "./tunnel_http_server";
import type { TunnelConfiguration } from "./tunnel_polling";
import type { TunnelUnauthorizedRecovery } from "./tunnel_response_delivery";

type ChatApi = InstanceType<ReturnType<typeof createChatApiClass>>;
export interface KernelLibraryFile {
  libraryFileId: string;
  fileId: string;
}
/** Original Fn: delete a captured Library file, consuming no JSON response. */
export async function deleteKernelLibraryFile(
  chatApi: Pick<ChatApi, "request">,
  file: KernelLibraryFile,
) {
  await chatApi.request(
    `/files/library/files/${encodeURIComponent(file.libraryFileId)}?file_id=${encodeURIComponent(file.fileId)}`,
    { method: "DELETE" },
    {
      readResponse: async (response) => {
        await response.body?.cancel();
      },
    },
  );
}
/** Bind p_ to actual restored Yc, shared Dr/Hg/Le and Yg/El. This factory
 * creates no tunnel or credentials until a validated configuration is provided.
 * The returned getScope is shared with background KernelControlHost. */
export function createKernelTunnelRuntime(options: {
  ChatApi: ReturnType<typeof createChatApiClass>;
  kernelHost: KernelHostServices;
  storage: KernelJsHandlerHost<KernelLibraryFile>["storage"];
  browserShortDisplayName(): string;
  randomUUID(): string;
  warn(message: string): void;
}) {
  const scopes = createKernelScopeRegistry<
    KernelJsClient,
    ChatApi,
    KernelLibraryFile
  >();
  const kernels = createKernelHostRegistry(options.kernelHost);
  return {
    getScope: scopes.get,
    async ensureOffscreen() {
      await kernels.ensureOffscreen();
    },
    createTunnel(
      config: TunnelConfiguration,
      env: TunnelHttpEnvironment,
      onTurnEnded: KernelJsHandlerHost<KernelLibraryFile>["onTurnEnded"],
      activity?: KernelJsHandlerHost<KernelLibraryFile>["activity"],
      onPollingFailure?: (
        reason: "unauthorized" | "invalid_tunnel",
      ) => Promise<unknown>,
      onResponseUnauthorized?: TunnelUnauthorizedRecovery,
    ) {
      const chatApi = new options.ChatApi(config.apiKey, config.account);
      return new KernelHttpTunnel<KernelLibraryFile>(
        config,
        env,
        {
          chatApi,
          randomUUID: options.randomUUID,
          storage: options.storage,
          browserShortDisplayName: options.browserShortDisplayName,
          warn: options.warn,
          activity,
          onTurnEnded,
          beginScope: (id, client, signal, _api, onPdf) =>
            scopes.begin(id, client, signal, chatApi, onPdf),
          getKernel: kernels.get,
          resetKernel: kernels.reset,
          deletePdf: (pdf) => deleteKernelLibraryFile(chatApi, pdf),
        },
        onPollingFailure,
        onResponseUnauthorized,
      );
    },
  };
}
