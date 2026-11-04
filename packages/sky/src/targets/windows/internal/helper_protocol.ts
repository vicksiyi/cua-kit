import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { APPROVED_APP_META_KEY } from "./codex_turn_metadata";
export const REQUEST_BUDGET_META_KEY = "x-oai-cua-request-budget-ms";
export const USER_STOPPED_MESSAGE =
  "Computer Use was stopped by the user with the physical Escape key. Stop your work, do not call further Computer Use tools in this turn, and send a final message noting that the user stopped Computer Use.";
export type TurnScope = {
  codexHome: string;
  conversationId: string;
  turnId: string;
};
export type ApprovalRequest = {
  allowPersistentApproval: boolean;
  app: string;
  displayName: string;
  riskLevel: "high" | "low" | undefined;
};
const INTERRUPT_DIRECTORY = path.join("cache", "computer-use", "interrupts");
export function addApprovedApp(metadata: unknown, app: string) {
  return metadata == null ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
    ? { [APPROVED_APP_META_KEY]: app }
    : { ...metadata, [APPROVED_APP_META_KEY]: app };
}
export function addRequestBudget(metadata: unknown, milliseconds: number) {
  return metadata == null ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
    ? { [REQUEST_BUDGET_META_KEY]: milliseconds }
    : { ...metadata, [REQUEST_BUDGET_META_KEY]: milliseconds };
}
export function parseApprovalRequest(value: unknown): ApprovalRequest | null {
  if (value == null || typeof value !== "object" || Array.isArray(value))
    return null;
  const raw = Reflect.get(value, "app");
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const app = raw.trim(),
    name = Reflect.get(value, "displayName"),
    risk = Reflect.get(value, "riskLevel");
  return {
    allowPersistentApproval:
      Reflect.get(value, "allowPersistentApproval") !== false,
    app,
    displayName:
      typeof name === "string" && name.trim() !== "" ? name.trim() : app,
    riskLevel: risk === "high" || risk === "low" ? risk : undefined,
  };
}
function alwaysPersisted(value: any) {
  if (value._meta?.persist === "always") return true;
  const content = value.content;
  if (content == null || typeof content !== "object") return false;
  if (Reflect.get(content, "persist") === "always") return true;
  return (
    Reflect.get(content, "source") === "computer-use-persisted-state" &&
    Reflect.get(content, "scope") === "global"
  );
}
export async function requestAppApproval(
  request: ApprovalRequest,
  metadata: unknown,
  createElicitation?: any,
) {
  const host = (globalThis as any).nodeRepl;
  const elicit =
    createElicitation ??
    (host?.config == null ? undefined : host)?.createElicitation;
  if (typeof elicit !== "function")
    throw new Error(
      "Computer Use requires app approval but elicitations are unavailable",
    );
  const audio = request.app === "computer-audio",
    persistent = request.allowPersistentApproval && !audio;
  const call =
    metadata != null && typeof metadata === "object"
      ? [Reflect.get(metadata, "call_id"), Reflect.get(metadata, "item_id")]
          .find((value) => typeof value === "string" && value.trim() !== "")
          ?.trim()
      : undefined;
  const response = await elicit({
    message: audio
      ? "Allow Computer Use to record computer audio?"
      : `Allow Codex to use ${request.displayName}?`,
    meta: {
      codex_approval_kind: "mcp_tool_call",
      ...(audio ? { codex_request_type: "approval_request" } : {}),
      connector_id: "computer-use",
      connector_name: "Computer Use",
      persist: persistent ? ["session", "always"] : ["session"],
      riskLevel: request.riskLevel ?? "low",
      ...(audio
        ? {
            ...(typeof call === "string" && call.length > 0
              ? { tool_call_id: call }
              : {}),
            tool_name: "start_audio_recording",
          }
        : {}),
      tool_params: { app: request.app },
      tool_params_display: [
        { name: "app", display_name: "App", value: request.displayName },
      ],
    },
  });
  if (
    response.action !== "accept" ||
    (!persistent && alwaysPersisted(response))
  )
    throw new Error(
      `Computer Use was not approved to use ${request.displayName}`,
    );
}
/** Original home/turn marker functions; injection keeps path/WSL tests isolated. */
export function createTurnScopeProtocol(
  deps = {
    process: () => globalThis.process,
    spawnSync,
    homedir,
    existsSync,
    mkdirSync,
    writeFileSync,
  },
) {
  const windowsPath = (value: string) => value.replace(/\//g, "\\");
  function resolveHome() {
    const current = deps.process(),
      configured = current.env.CODEX_HOME?.trim();
    if (configured) {
      if (
        /^[A-Za-z]:[\\/]/.test(configured) ||
        configured.startsWith("\\\\") ||
        configured.startsWith("//")
      )
        return windowsPath(configured);
      const segments = configured
        .replace(/\\/g, "/")
        .replace(/^\/+/, "")
        .split("/");
      if (
        segments[0]?.toLowerCase() === "mnt" &&
        segments[1]?.length === 1 &&
        /^[A-Za-z]$/.test(segments[1])
      ) {
        const drive = segments[1].toUpperCase(),
          rest = segments.slice(2).join("\\");
        return rest === "" ? `${drive}:\\` : `${drive}:\\${rest}`;
      }
      if (configured.startsWith("/")) {
        const distribution = process.env.WSL_DISTRO_NAME?.trim();
        const result = deps.spawnSync(
          "wsl.exe",
          distribution == null || distribution === ""
            ? ["wslpath", "-w", configured]
            : ["-d", distribution, "--", "wslpath", "-w", configured],
          { encoding: "utf8" },
        );
        if (result.status === 0) {
          const converted = result.stdout.trim();
          if (converted !== "") return windowsPath(converted);
        }
      }
      return configured;
    }
    const profile = current.env.USERPROFILE?.trim();
    return current.platform === "win32" && profile
      ? path.win32.join(profile, ".codex")
      : path.join(deps.homedir(), ".codex");
  }
  function readScope(metadata: unknown): TurnScope | null {
    if (metadata == null || typeof metadata !== "object") return null;
    const session = (metadata as any).session_id,
      turn = (metadata as any).turn_id;
    if (
      typeof session !== "string" ||
      session.trim() === "" ||
      typeof turn !== "string" ||
      turn.trim() === ""
    )
      return null;
    return { codexHome: resolveHome(), conversationId: session, turnId: turn };
  }
  function markerPath(scope: TurnScope) {
    return path.join(
      scope.codexHome,
      INTERRUPT_DIRECTORY,
      scope.conversationId.replace(/[^A-Za-z0-9._-]/g, "_"),
      scope.turnId.replace(/[^A-Za-z0-9._-]/g, "_"),
    );
  }
  function interrupted(scope: TurnScope) {
    return deps.existsSync(markerPath(scope));
  }
  function markInterrupted(scope: TurnScope | null) {
    if (scope == null) return;
    const file = markerPath(scope);
    try {
      deps.mkdirSync(path.dirname(file), { recursive: true });
      deps.writeFileSync(file, "", "utf8");
    } catch {}
  }
  return { resolveHome, readScope, markerPath, interrupted, markInterrupted };
}
export function scopeKey(scope: TurnScope | null) {
  return scope == null
    ? null
    : `${scope.codexHome}\0${scope.conversationId}\0${scope.turnId}`;
}
export const turnScopeProtocol = createTurnScopeProtocol();
