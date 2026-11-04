import { WebMcpListTools } from "../../commands/web_mcp";
import {
  toWebMcpToolDescriptor,
  type WebMcpToolRecord,
} from "../../capabilities/tab_web_mcp";
import { AuthorityGateError } from "../errors/authority_gate_error";
import { downloadSourceOrigin } from "../context/downloads";
import {
  assertWebMcpGeneration,
  ensureWebMcpState,
  fetchWebMcpTools,
} from "./host";
import { staleWebMcpRegistration } from "./frame_discovery";
import {
  ensureWebMcpCatalog,
  assertWebMcpPageEnabled,
  webMcpLimits,
  webMcpLimitsConfigName,
  webMcpDescriptorBytes,
  webMcpDescriptorIdentity,
  webMcpDisabledMessage,
  type WebMcpCatalogContext,
} from "./session_catalog";
export interface WebMcpDirectoryContext extends WebMcpCatalogContext {
  clientInfo: { type: string };
  runtime: { gaas?: unknown; [key: string]: any };
  security: WebMcpCatalogContext["security"] & {
    assertWebMcpOriginEnabled(origin: string): Promise<unknown>;
  };
}
export interface WebMcpDirectoryDependencies {
  assertSupported(
    command: string,
    context: WebMcpDirectoryContext,
  ): Promise<unknown>;
  ambientNetworkDisabled(runtime: WebMcpDirectoryContext["runtime"]): boolean;
  featureFlag(name: string, deadlineMs?: number): Promise<boolean>;
  config(name: string): Parameters<typeof webMcpLimits>[0];
  emit(
    runtime: WebMcpDirectoryContext["runtime"],
    event: string,
    reason: string,
    values: Record<string, number>,
  ): unknown;
}
/** Original Bh. Feature/config/telemetry bootstrap dependencies remain explicit until runtime assembly. */
export function createWebMcpToolDirectory(
  dependencies: WebMcpDirectoryDependencies,
) {
  return async function fetchDirectory(
    context: WebMcpDirectoryContext,
    tabId: number,
    deadlineMs?: number,
  ) {
    await dependencies.assertSupported(WebMcpListTools.commandType, context);
    const catalog = ensureWebMcpCatalog(context, tabId),
      state = ensureWebMcpState(context.cdp, tabId),
      initialGeneration = state.generation,
      pageUrl = await assertWebMcpPageEnabled(context, tabId),
      pageOrigin = downloadSourceOrigin(pageUrl),
      permissions = new Map<string, boolean>(),
      deniedOrigins = new Set<string>();
    const authorize = async (origin: string) => {
      let allowed = true;
      try {
        if (origin !== pageOrigin)
          await context.security.assertWebMcpOriginEnabled(origin);
      } catch (error) {
        if (
          !(error instanceof AuthorityGateError) ||
          error.gate !== "webMcpConfiguration"
        )
          throw error;
        allowed = false;
        deniedOrigins.add(origin);
      }
      permissions.set(origin, allowed);
      return allowed;
    };
    assertWebMcpGeneration(state, initialGeneration);
    if (catalog.disabled) throw new Error(webMcpDisabledMessage);
    let workaround = false;
    if (
      context.clientInfo.type === "cdp" &&
      context.runtime.gaas != null &&
      !dependencies.ambientNetworkDisabled(context.runtime)
    )
      workaround = await dependencies.featureFlag(
        "browser_use_cloud_webmcp_chromium_crash_workaround",
        deadlineMs,
      );
    assertWebMcpGeneration(state, initialGeneration);
    const result = await fetchWebMcpTools(
      context.cdp,
      tabId,
      pageUrl,
      authorize,
      workaround,
      deadlineMs,
    );
    if (catalog.disabled) throw new Error(webMcpDisabledMessage);
    assertWebMcpGeneration(state, result.generation);
    const limits = webMcpLimits(dependencies.config(webMcpLimitsConfigName));
    if (result.tools.length > limits.maxTools) {
      catalog.disabled = true;
      dependencies.emit(context.runtime, "webmcp_disabled", "tool_count", {
        tool_count: result.tools.length,
      });
      throw new Error(webMcpDisabledMessage);
    }
    const parsed = WebMcpListTools.ResultSchema.parse({ tools: result.tools })
      .tools as WebMcpToolRecord[];
    await Promise.all(
      [
        ...new Set(
          [...parsed, ...(catalog.snapshot?.tools ?? [])].flatMap(
            ({ origin }) => origin ?? [],
          ),
        ),
      ].map(authorize),
    );
    const tools = parsed.filter(
      ({ origin }) => origin != null && permissions.get(origin),
    );
    if ((await assertWebMcpPageEnabled(context, tabId)) !== pageUrl)
      throw new Error(staleWebMcpRegistration);
    if (catalog.disabled) throw new Error(webMcpDisabledMessage);
    assertWebMcpGeneration(state, result.generation);
    const bytes = webMcpDescriptorBytes(
      tools.map((tool) => ({
        ...toWebMcpToolDescriptor(tool),
        call_name: undefined,
      })),
    );
    if (bytes > limits.maxTotalDescriptorBytes) {
      catalog.disabled = true;
      dependencies.emit(
        context.runtime,
        "webmcp_disabled",
        "descriptor_bytes",
        { descriptor_bytes: bytes },
      );
      throw new Error(webMcpDisabledMessage);
    }
    const previous = catalog.snapshot;
    const identity = (entries: WebMcpToolRecord[]) =>
      webMcpDescriptorIdentity(
        entries.filter(
          ({ origin }) =>
            origin != null &&
            !deniedOrigins.has(origin) &&
            !previous?.deniedOrigins.has(origin),
        ),
      );
    if (
      previous != null &&
      identity(previous.tools) !== identity(tools) &&
      ++catalog.registrationChanges > limits.maxRegistrationChanges
    ) {
      catalog.disabled = true;
      dependencies.emit(
        context.runtime,
        "webmcp_disabled",
        "registration_changes",
        { registration_changes: catalog.registrationChanges },
      );
      throw new Error(webMcpDisabledMessage);
    }
    catalog.snapshot = { tools, deniedOrigins };
    return { generation: result.generation, tools };
  };
}
