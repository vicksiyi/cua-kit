import { randomUUID } from "node:crypto";
import { platform } from "node:os";
import { StatsigClient, StatsigMetadataProvider } from "@statsig/js-client";
import type { Client } from "../../types/window/index";
export type ComputerUseToolName = keyof Client;
type ApprovalResult = "accepted" | "canceled" | "declined";
const SDK_KEY = "client-br04gwIKFntB05BUONtNnF3NhWQsvmSI8R97Pigr7A5";
const API = "https://ab.chatgpt.com/v1";
/** Original module-lifetime state; factory permits isolated oracle tests. */
export function createComputerUseTelemetry(
  sdk = { StatsigClient, StatsigMetadataProvider },
) {
  let client: StatsigClient | undefined,
    launched = false;
  function runtime(): any {
    const host = (globalThis as any).nodeRepl;
    return host?.config == null || typeof host.fetch !== "function"
      ? undefined
      : host;
  }
  function disabled(host: any) {
    return (
      host.env?.NODE_REPL_DISABLE_ANALYTICS === "1" ||
      host.env?.BROWSER_USE_DISABLE_AMBIENT_NETWORK === "1"
    );
  }
  function text(value: unknown) {
    if (typeof value !== "string") return;
    return value.trim() || undefined;
  }
  function env(host: any, key: string) {
    return text(host.env?.[key]);
  }
  function custom(host: any, id: unknown) {
    return {
      auth_status: text(id) == null ? "unknown" : "logged_in",
      codexAppVersion: env(host, "BROWSER_USE_CODEX_APP_VERSION") ?? "unknown",
      platform: platform(),
    };
  }
  function tier(host: any) {
    switch (env(host, "BROWSER_USE_CODEX_APP_BUILD_FLAVOR")) {
      case "dev":
      case "agent":
        return "development";
      case "internal-alpha":
      case "nightly":
        return "staging";
      default:
        return "production";
    }
  }
  async function initialize(created: StatsigClient) {
    try {
      await created.initializeAsync();
      const host = runtime();
      if (host == null || disabled(host)) return;
      const response = await host.fetch("https://chatgpt.com/backend-api/me"),
        user = await response.json();
      if (user == null || typeof user !== "object") return;
      if (
        user.object === "user" &&
        typeof user.id === "string" &&
        typeof user.email === "string"
      )
        created.updateUserSync({
          email: user.email,
          userID: user.id,
          custom: custom(host, user.id),
        });
    } catch {
      return;
    }
  }
  function getClient() {
    const host = runtime();
    if (host == null || disabled(host)) return;
    if (client == null) {
      sdk.StatsigMetadataProvider.add({
        appIdentifier: "sky",
        appVersion: env(host, "BROWSER_USE_CODEX_APP_VERSION") ?? "unknown",
      });
      const id = env(host, "NODE_REPL_SENTRY_USER_ID");
      const created = new sdk.StatsigClient(
        SDK_KEY,
        { userID: id, custom: custom(host, id) },
        {
          environment: { tier: tier(host) },
          loggingEnabled: "always",
          networkConfig: {
            api: API,
            logEventUrl: "https://chatgpt.com/ces/v1/rgstr",
            networkOverrideFunc: (url, options) => host.fetch(url, options),
            sdkExceptionUrl: `${API}/sdk_exception`,
          },
        },
      );
      client = created;
      void initialize(created);
    }
    return client;
  }
  function emit(
    name: string,
    params: Record<string, unknown>,
    createdAt = new Date().toISOString(),
  ) {
    try {
      const sink = getClient();
      if (sink == null) return false;
      sink.logEvent({
        eventName: "__protobuf_structured_event__",
        metadata: {
          eventCreatedAt: createdAt,
          eventId: randomUUID(),
          eventParams: {
            "@type": `openai.buf.dev/openai/protobuf-analytics-events/protobuf_analytics_events.v1.${name}`,
            ...params,
            runtime: "CODEX_COMPUTER_USE_MCP_RUNTIME_NODE_REPL",
          },
          eventType: "client",
          // Original Sky sends structured protobuf metadata beyond the SDK string-map declaration.
        } as unknown as Record<string, string>,
      });
      return true;
    } catch {
      return false;
    }
  }
  function logComputerUseClientCreated() {
    if (!launched)
      launched = emit("CodexComputerUseMcpServerLaunched", {
        transport: "stdio",
      });
  }
  function logComputerUseApprovalRequested(args: {
    bundleIdentifier: string;
    eventCreatedAt: string;
    toolName: ComputerUseToolName;
  }) {
    emit(
      "CodexComputerUseMcpAppApprovalRequested",
      { bundleIdentifier: args.bundleIdentifier, toolName: args.toolName },
      args.eventCreatedAt,
    );
  }
  function logComputerUseApprovalResolved(args: {
    approvalPersistence?: "always" | "session";
    approvalResult: ApprovalResult;
    bundleIdentifier: string;
    toolName: ComputerUseToolName;
  }) {
    emit("CodexComputerUseMcpAppApprovalResolved", {
      approvalResult: args.approvalResult,
      bundleIdentifier: args.bundleIdentifier,
      toolName: args.toolName,
      ...(args.approvalPersistence == null
        ? {}
        : { approvalPersistence: args.approvalPersistence }),
    });
  }
  function turnMetadata() {
    let value = runtime()?.requestMeta?.["x-codex-turn-metadata"];
    if (typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch {
        return {};
      }
    }
    if (value == null || typeof value !== "object" || Array.isArray(value))
      return {};
    return {
      threadId:
        text(value.thread_id) ?? text(value.threadId) ?? text(value.session_id),
      turnId: text(value.turn_id),
      itemId: text(value.item_id) ?? text(value.itemId) ?? text(value.call_id),
      model: text(value.model),
      reasoningEffort:
        text(value.reasoning_effort) ??
        text(value.reasoningEffort) ??
        text(value.model_reasoning_effort),
    };
  }
  function logComputerUseToolCalled(args: {
    bundleIdentifier?: string;
    durationMs: number;
    terminalStatus: "cancelled" | "completed" | "failed";
    toolName: ComputerUseToolName;
  }) {
    const metadata = turnMetadata();
    emit("CodexComputerUseMcpToolCalled", {
      durationMs: args.durationMs,
      invocationSource: "code_mode",
      mcpErrorPresent: args.terminalStatus !== "completed",
      mcpServerName: "node_repl",
      pluginId: "computer-use@openai-bundled",
      terminalStatus: args.terminalStatus,
      toolName: args.toolName,
      transport: "native_pipe",
      ...(args.bundleIdentifier == null
        ? {}
        : { bundleIdentifier: args.bundleIdentifier }),
      ...Object.fromEntries(
        Object.entries(metadata).filter(([, value]) => value != null),
      ),
    });
  }
  return {
    logComputerUseClientCreated,
    logComputerUseApprovalRequested,
    logComputerUseApprovalResolved,
    logComputerUseToolCalled,
  };
}
export const {
  logComputerUseClientCreated,
  logComputerUseApprovalRequested,
  logComputerUseApprovalResolved,
  logComputerUseToolCalled,
} = createComputerUseTelemetry();
