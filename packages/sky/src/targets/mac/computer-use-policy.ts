import * as telemetry from "./computer-use-telemetry";
import type { ComputerUseToolName } from "./computer-use-telemetry";
import { SkyComputerUseError, ServerErrorCode } from "./errors";
import { getClient } from "./lazy-client";
import type { MacAppPolicyResult } from "./client";
type AppInput = { app: string };
export function createComputerUsePolicy(
  deps = {
    getClient,
    logComputerUseToolCalled: telemetry.logComputerUseToolCalled,
    logComputerUseApprovalRequested: telemetry.logComputerUseApprovalRequested,
    logComputerUseApprovalResolved: telemetry.logComputerUseApprovalResolved,
  },
) {
  function startSpan(name: string, attrs: Record<string, string>) {
    try { return (globalThis as any).nodeRepl?.telemetry?.startSpan(name, attrs); }
    catch { return undefined; }
  }
  function endSpan(span: any, value: { attrs: Record<string, string>; status: string }) {
    try { span?.end(value); } catch { }
  }
  async function waitForApproval<T extends { action?: string }>(kind: string, operation: () => Promise<T>): Promise<T> {
    const span = startSpan("computer_use.elicitation.wait", { "computer_use.approval.kind": kind });
    try {
      const response = await operation();
      const outcome = ["accept", "decline", "cancel"].includes(response.action ?? "") ? response.action! : "invalid_response";
      endSpan(span, { attrs: { "computer_use.approval.outcome": outcome }, status: outcome === "invalid_response" ? "error" : "ok" });
      return response;
    } catch (error) {
      const outcome = error instanceof Error && error.name === "TimeoutError" ? "timed_out"
        : error instanceof Error && error.name === "AbortError" ? "cancel" : "invalid_response";
      endSpan(span, { attrs: { "computer_use.approval.outcome": outcome }, status: outcome === "cancel" ? "ok" : "error" });
      throw error;
    }
  }
  function setComputerUseResponseMeta(bundleIdentifier: string | null) {
    const host = (globalThis as any).nodeRepl;
    host?.setResponseMeta?.({
      "codex/toolSurface": {
        app:
          bundleIdentifier == null
            ? null
            : { appId: bundleIdentifier, kind: "appId" },
        kind: "computerUse",
      },
      ...(bundleIdentifier === "com.google.Chrome"
        ? { "codex/computerUseChrome": true }
        : {}),
    });
  }
  function toolCallId() {
    let metadata = (globalThis as any).nodeRepl?.requestMeta?.[
      "x-codex-turn-metadata"
    ];
    if (typeof metadata === "string") {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        return;
      }
    }
    if (
      metadata != null &&
      typeof metadata === "object" &&
      !Array.isArray(metadata)
    )
      for (const key of ["call_id", "item_id"]) {
        const value = metadata[key];
        if (typeof value === "string" && value.trim() !== "")
          return value.trim();
      }
  }
  function elicitation() {
    const fn = (globalThis as any).nodeRepl?.createElicitation;
    if (typeof fn !== "function")
      throw new Error("Computer Use requires nodeRepl.createElicitation");
    return fn;
  }
  function snapshot<Input extends AppInput>(
    input: Input,
    approvedPath?: string,
  ): Readonly<Input> {
    if (typeof input !== "object" || input == null)
      throw new Error("Computer Use app approval requires an object input");
    const descriptors = Object.getOwnPropertyDescriptors(input),
      app = descriptors.app;
    if (app == null || !("value" in app))
      throw new Error(
        "Computer Use app approval requires app to be a plain data property",
      );
    const name = app.value;
    if (typeof name !== "string" || name.trim() === "")
      throw new Error("Computer Use app approval requires a non-empty app");
    const copy: any = {};
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!("value" in descriptor))
        throw new Error(
          `Computer Use app approval requires ${key} to be a plain data property`,
        );
      Object.defineProperty(copy, key, {
        configurable: false,
        enumerable: descriptor.enumerable,
        value: key === "app" ? (approvedPath ?? name) : descriptor.value,
        writable: false,
      });
    }
    return Object.freeze(copy);
  }
  async function approve(
    create: any,
    policy: MacAppPolicyResult,
    toolName: ComputerUseToolName,
  ) {
    const target = policy.target,
      context = { bundleIdentifier: target.bundleIdentifier, toolName },
      eventCreatedAt = new Date().toISOString();
    const requested = () =>
      deps.logComputerUseApprovalRequested({ ...context, eventCreatedAt });
    const callId = toolCallId();
    let response: any;
    try {
      response = await waitForApproval("app", () => create({
        message: `Allow Computer Use to use "${target.displayName}"?`,
        meta: {
          codex_approval_kind: "mcp_tool_call",
          connector_id: "computer-use",
          connector_name: "Computer Use",
          persist: policy.allowPersistentApproval
            ? ["session", "always"]
            : ["session"],
          riskLevel: target.risk,
          ...(target.warningSubtitle == null
            ? {}
            : { subtitle: target.warningSubtitle }),
          ...(callId == null ? {} : { tool_call_id: callId }),
          tool_name: toolName,
          tool_params: { app: target.bundleIdentifier },
          tool_params_display: [
            { name: "app", display_name: "App", value: target.displayName },
          ],
        },
      }));
    } catch (error) {
      requested();
      throw error;
    }
    if (!(
      response.content != null &&
      typeof response.content === "object" &&
      response.content.source === "computer-use-persisted-state"
    )) {
      requested();
      const approvalResult =
        response.action === "accept"
          ? "accepted"
          : response.action === "cancel"
            ? "canceled"
            : response.action === "decline"
              ? "declined"
              : undefined;
      if (approvalResult != null)
        deps.logComputerUseApprovalResolved({
          ...context,
          approvalResult,
          ...(approvalResult === "accepted"
            ? {
                approvalPersistence:
                  response._meta?.persist === "always"
                    ? ("always" as const)
                    : ("session" as const),
              }
            : {}),
        });
    }
    if (response.action !== "accept")
      throw new Error(
        `Computer Use was not approved to use ${target.displayName}`,
      );
  }
  async function withComputerUsePolicy<Input extends AppInput, Result>(
    toolName: ComputerUseToolName,
    input: Input,
    operation: (input: Readonly<Input>) => Promise<Result>,
  ): Promise<Result> {
    setComputerUseResponseMeta(null);
    const copy = snapshot(input), create = elicitation();
    const span = startSpan("computer_use.policy", { "computer_use.target": "mac" });
    let policy: MacAppPolicyResult | undefined;
    let target: MacAppPolicyResult["target"] | undefined;
    try {
      const client = await deps.getClient();
      policy = await client.getAppPolicy(copy.app);
      setComputerUseResponseMeta(policy.target.bundleIdentifier);
      switch (policy.decision) {
        case "allowed": target = policy.target; break;
        case "denied": throw new Error(`Computer Use is blocked from using the app '${policy.target.bundleIdentifier}' by your organization's policy.`);
        case "forbidden": throw new Error(`Computer Use is not allowed to use the app '${policy.target.bundleIdentifier}' for safety reasons.`);
      }
      endSpan(span, { attrs: { "computer_use.policy.result": "allowed" }, status: "ok" });
    } catch (error) {
      const blocked = policy != null && (policy.decision === "denied" || policy.decision === "forbidden");
      endSpan(span, { attrs: { "computer_use.policy.result": blocked ? "blocked" : "error" }, status: blocked ? "ok" : "error" });
      throw error;
    }
    await approve(create, policy!, toolName);
    const approved = snapshot(copy, target!.appPath);
    return withComputerUseToolTelemetry(
      toolName,
      target!.bundleIdentifier,
      () => operation(approved),
    );
  }
  async function requestComputerAudioApproval() {
    const create = elicitation(),
      callId = toolCallId();
    const response = await waitForApproval("audio", () => create({
      message: "Allow Computer Use to record computer audio?",
      meta: {
        codex_approval_kind: "mcp_tool_call",
        codex_request_type: "approval_request",
        connector_id: "computer-use",
        connector_name: "Computer Use",
        persist: ["session"],
        riskLevel: "high",
        ...(callId == null ? {} : { tool_call_id: callId }),
        tool_name: "start_audio_recording",
        tool_params: {},
        tool_params_display: [],
      },
    }));
    if (response.action !== "accept")
      throw new Error("Computer Use was not approved to record computer audio");
  }
  async function withComputerUseToolTelemetry<Result>(
    toolName: ComputerUseToolName,
    bundleIdentifier: string | undefined,
    operation: () => Promise<Result>,
  ): Promise<Result> {
    const start = performance.now();
    const span = startSpan("computer_use.native.execute", { "computer_use.target": "mac" });
    let terminalStatus: "completed" | "cancelled" | "failed" = "completed";
    try {
      return await operation();
    } catch (error) {
      terminalStatus =
        error instanceof SkyComputerUseError &&
        (error.code === ServerErrorCode.userStoppedSession ||
          error.code === ServerErrorCode.userIntervened)
          ? "cancelled"
          : "failed";
      throw error;
    } finally {
      endSpan(span, { attrs: { "computer_use.terminal_status": terminalStatus }, status: terminalStatus === "failed" ? "error" : "ok" });
      deps.logComputerUseToolCalled({
        bundleIdentifier,
        durationMs: Math.min(
          2147483647,
          Math.max(0, Math.round(performance.now() - start)),
        ),
        terminalStatus,
        toolName,
      });
    }
  }
  return {
    withComputerUsePolicy,
    requestComputerAudioApproval,
    withComputerUseToolTelemetry,
    setComputerUseResponseMeta,
  };
}
export const {
  withComputerUsePolicy,
  requestComputerAudioApproval,
  withComputerUseToolTelemetry,
  setComputerUseResponseMeta,
} = createComputerUsePolicy();
