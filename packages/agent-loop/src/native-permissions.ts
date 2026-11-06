/** Standalone demo readiness facts; permission prompts are never requested here. */
import { execFile } from "node:child_process";
export interface NativePermissions { accessibility: boolean; screenRecording: boolean }
export function parseNativePermissions(text: string): NativePermissions {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)
    || typeof (value as any).accessibility !== "boolean"
    || typeof (value as any).screenRecording !== "boolean"
    || (value as any).requested !== false)
    throw Error("Native permission probe returned invalid readiness evidence");
  return {accessibility:(value as any).accessibility,screenRecording:(value as any).screenRecording};
}
export async function readNativePermissions(helper: string): Promise<NativePermissions> {
  const output = await new Promise<string>((resolve,reject)=>{
    execFile(helper,["--permissions"],{timeout:10000,maxBuffer:16384},(error,stdout)=>{
      // The native helper returns 2 for a successful probe with missing permissions.
      if(error && (error.code !== 2 || error.killed || error.signal)) reject(error);
      else resolve(stdout);
    });
  });
  return parseNativePermissions(output);
}
export function nativePermissionsContext(status: NativePermissions): string {
  const ready=status.accessibility && status.screenRecording;
  return `Native helper permission probe: accessibility=${status.accessibility}, screenRecording=${status.screenRecording}. ` + (ready
    ? "These grants do not establish app-policy approval or successful UI actions. Verify each requested action from observed state."
    : "Native App UI observation/input is unavailable with the current grants. App inventory may still work. Do not attempt native window observation/input or report an app-operation success; explain the missing macOS permissions if the user requests those actions. Browser extension operations are a separate capability and may remain available. Do not substitute a website for the requested local app.");
}

export function nativeAppPolicyContext(policy: Record<string, {decision?: string}>): string {
  const allowed = Object.entries(policy).filter(([,rule]) => rule?.decision === "allowed").map(([id]) => id);
  return `This standalone demo uses local CORE_CUA_APP_POLICY configuration. Unlisted apps are denied by default. Configured allowed bundle IDs: ${JSON.stringify(allowed)}. `
    + "Local policy allowance, macOS Accessibility permission, macOS Screen Recording permission, and interactive App approval are separate, jointly required prerequisites for this demo's native UI observation. Fixing only one missing prerequisite is insufficient. A source error mentioning organization policy is generic wording; it does not prove this Mac is managed by an organization or that an administrator blocked the app. Explain the actual local configuration, do not invent an organization administrator. Do not attempt native operations for apps not allowed by this configuration; ask the user to configure their intended App policy explicitly. Never edit the policy or switch access paths to retry a denied action.";
}

/** Host-only clarification; preserve the restored policy decision and message. */
export function standaloneAppPolicyDenialHint(text: string): string | undefined {
  const match = /Computer Use is blocked from using the app '([^'\r\n]+)' by your organization's policy\./.exec(text);
  if (!match) return undefined;
  return `本独立 demo 使用本地 CORE_CUA_APP_POLICY；上述 organization policy 是通用错误文案，不证明设备受组织管理。应用 ${match[1]} 的策略结果为 denied（未配置的应用也默认拒绝）。请由配置所有者检查该应用规则；自动审核参数不会覆盖此拒绝。尚未执行本次受阻的应用操作。`;
}

/** The app-server provider supplies effective policy; no local allow-list is inferred. */
export function nativeAppServerPolicyContext(): string {
  return "Native application policy comes from the selected app-server provider. Effective access combines management requirements and local configuration, followed by forbidden-target classification. Do not infer a default allow or deny rule or an approved application list before querying policy. A policy allowance is separate from interactive App approval and macOS Accessibility/Screen Recording grants. Preserve denied/forbidden results; do not edit policy or switch access paths to retry a denied action. Generic organization-policy wording alone does not identify which policy layer denied access.";
}
