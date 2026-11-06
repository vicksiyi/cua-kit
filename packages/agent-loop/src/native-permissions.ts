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
