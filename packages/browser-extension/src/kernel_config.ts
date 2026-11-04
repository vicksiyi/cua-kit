import type { KernelControlClient } from "./kernel_control_client";
const resources = { origins: "origin", downloads: "download", uploads: "upload", full_cdp: "full_cdp", webmcp: "webmcp" } as const;
const defaults = {
  approval_mode: "always_ask", history_approval_mode: "always_ask", iab_history_approval_mode: "always_ask",
  download_approval_mode: "always_ask", upload_approval_mode: "always_ask", disable_auto_review: false,
  full_cdp_access_enabled: false, webmcp_enabled: true, origins: {}, downloads: {}, uploads: {}, full_cdp: {}, webmcp: {},
};
export interface KernelBrowserSettings {
  revision: unknown;
  preferences: Record<string, unknown>;
  rules: Record<string, Record<string, unknown>>;
}
/** Original Ps. Non-allow rules are projected into denied, including unknown decisions. */
export function projectKernelBrowserSettings({ preferences, rules }: KernelBrowserSettings) {
  const result: Record<string, any> = {
    approval_mode: preferences.approval_mode, history_approval_mode: preferences.history_approval_mode,
    iab_history_approval_mode: preferences.iab_history_approval_mode, download_approval_mode: preferences.download_approval_mode,
    upload_approval_mode: preferences.upload_approval_mode, disable_auto_review: preferences.disable_auto_review,
    full_cdp_access_enabled: preferences.full_cdp_access_enabled, webmcp_enabled: preferences.webmcp_enabled,
  };
  for (const [key, resource] of Object.entries(resources)) {
    const allowed: string[] = [], denied: string[] = [];
    for (const [pattern, decision] of Object.entries(rules[resource])) (decision === "allow" ? allowed : denied).push(pattern);
    result[key] = { allowed, denied };
  }
  return result;
}
/** Original $U; denied entries win over duplicate allowed patterns. */
export function parseKernelPermissionRules(value: any) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error("Browser permission rules must be an object.");
  for (const key of Object.keys(value)) if (key !== "allowed" && key !== "denied") throw new Error("Unsupported browser permission rule.");
  const result = new Map<string, "allow" | "deny">();
  for (const key of ["allowed", "denied"]) {
    const patterns = value[key];
    if (patterns !== undefined) {
      if (!Array.isArray(patterns)) throw new Error("Browser permission rules must be arrays.");
      for (const pattern of patterns) {
        if (typeof pattern !== "string") throw new Error("Browser permission patterns must be strings.");
        result.set(pattern, key === "allowed" ? "allow" : "deny");
      }
    }
  }
  return result;
}
/** Original UU: revision-aware patch containing only changed preferences/rules. */
export function diffKernelBrowserSettings(current: KernelBrowserSettings, next: Record<string, unknown>) {
  const preferences: Record<string, unknown> = {};
  const rule_updates: { resource: string; pattern: string; decision: string | null }[] = [];
  for (const [key, value] of Object.entries({ ...defaults, ...next })) {
    switch (key) {
      case "disable_auto_review": case "full_cdp_access_enabled": case "webmcp_enabled":
        if (typeof value !== "boolean") throw new Error("Browser setting must be a boolean.");
        if (value !== current.preferences[key]) preferences[key] = value;
        break;
      case "approval_mode": case "download_approval_mode": case "upload_approval_mode":
        if (value !== "always_ask" && value !== "never_ask") throw new Error("Invalid browser approval mode.");
        if (value !== current.preferences[key]) preferences[key] = value;
        break;
      case "history_approval_mode": case "iab_history_approval_mode":
        if (value !== "always_ask" && value !== "never_ask" && value !== "disabled") throw new Error("Invalid browser history approval mode.");
        if (value !== current.preferences[key]) preferences[key] = value;
        break;
      case "origins": case "downloads": case "uploads": case "full_cdp": case "webmcp": {
        const resource = resources[key];
        const oldRules = new Map(Object.entries(current.rules[resource]));
        const newRules = parseKernelPermissionRules(value);
        for (const pattern of new Set([...oldRules.keys(), ...newRules.keys()])) {
          const decision = newRules.get(pattern);
          if (decision !== oldRules.get(pattern)) rule_updates.push({ resource, pattern, decision: decision ?? null });
        }
        break;
      }
      default: continue;
    }
  }
  return Object.keys(preferences).length === 0 && rule_updates.length === 0 ? null : { expected_revision: current.revision, preferences, rule_updates };
}
export interface KernelConfigLocks { request<T>(name: string, callback: () => Promise<T>): Promise<T> }
type SessionControl = Pick<KernelControlClient, "readSessionConfig" | "writeSessionConfig">;
type GlobalControl = Pick<KernelControlClient, "readBrowserSettings" | "patchBrowserSettings">;
/** Original NU/FU. Lock covers read, synchronous updater and write. */
export function createKernelSessionConfig(control: SessionControl, sessionId: string, locks: KernelConfigLocks) {
  const key = `browser-use-session-config:${sessionId}`;
  return {
    async get(name: string) { const snapshot = await control.readSessionConfig(sessionId); return Object.hasOwn(snapshot, name) ? snapshot[name] : undefined; },
    readSnapshot() { return control.readSessionConfig(sessionId); },
    set(name: string, value: unknown) { return this.update(() => ({ [name]: value })); },
    async update(updater: (snapshot: Record<string, unknown>) => Record<string, unknown>) {
      await locks.request(key, async () => {
        const snapshot = await control.readSessionConfig(sessionId);
        const patch = updater(snapshot);
        await control.writeSessionConfig({ sessionId, config: { ...snapshot, ...patch } });
      });
    },
  };
}
/** Original BU. Forced read under a global lock, then conditional revision-aware patch. */
export function createKernelGlobalConfig(control: GlobalControl, locks: KernelConfigLocks) {
  return {
    async get(name: string, options?: { refresh?: boolean }) {
      const snapshot = projectKernelBrowserSettings(await control.readBrowserSettings(options?.refresh ?? false));
      return Object.hasOwn(snapshot, name) ? snapshot[name] : undefined;
    },
    async readSnapshot(options?: { refresh?: boolean }) { return projectKernelBrowserSettings(await control.readBrowserSettings(options?.refresh ?? false)); },
    async set(name: string, value: unknown) { await this.update(() => ({ [name]: value })); },
    async update(updater: (snapshot: Record<string, any>) => Record<string, unknown>) {
      await locks.request("browser-use-global-config", async () => {
        const current = await control.readBrowserSettings(true);
        const snapshot = projectKernelBrowserSettings(current);
        const update = updater(snapshot);
        const patch = diffKernelBrowserSettings(current, { ...snapshot, ...update });
        if (patch != null) await control.patchBrowserSettings(patch);
      });
    },
  };
}
