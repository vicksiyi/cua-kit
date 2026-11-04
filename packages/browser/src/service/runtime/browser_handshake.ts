import { cdpTabCapabilityDefinition } from "../../capabilities/tab_cdp";
import { securityMode } from "../security/gate_policy";
import { environmentString } from "../capability_filter";
import { browserBackendDeadline } from "./browser_selection";
/** Original Bs. Unknown backend types stay unsupported. */
export function supportsFullCdp(runtime: any, type: string) {
  switch (type) {
    case "mcpapps":
      return false;
    case "extension":
    case "iab":
      return true;
    case "cdp":
      return (
        securityMode(runtime) === "gaas-browser-environment" &&
        environmentString(runtime, "BROWSER_USE_FULL_CDP_ACCESS_ENABLED") ===
          "1"
      );
  }
}
export async function addFullCdpCapability(
  runtime: any,
  info: any,
  options: { isFullCdpEnabled?: () => Promise<boolean> } = {},
) {
  if (
    !supportsFullCdp(runtime, info.type) ||
    options.isFullCdpEnabled == null ||
    !(await options.isFullCdpEnabled())
  )
    return info;
  const tabs = info.capabilities?.tab ?? [];
  return tabs.some(
    (capability: any) => capability.id === cdpTabCapabilityDefinition.id,
  )
    ? info
    : {
        ...info,
        capabilities: {
          ...info.capabilities,
          tab: [...tabs, cdpTabCapabilityDefinition.info],
        },
      };
}
export interface HandshakeDependencies {
  enrichProfile(info: any, runtime: any): Promise<any>;
  reportError(error: any): void;
  featureEnabled(
    runtime: any,
    name: string,
    options: { enabledByDefault: boolean },
  ): boolean;
  deploymentEnvironment(): string;
}
/** Original Vle/Hx. Backend getInfo failure is fatal; profile enrichment failure alone falls back. */
export function createBrowserHandshake(deps: HandshakeDependencies) {
  function applyAccessibility(runtime: any, info: any) {
    if (info.apiSupportOverrides?.["Tab.ax"] === false) return info;
    const setting =
      environmentString(runtime, "BROWSER_USE_TINYSKY_ENABLED")?.trim() ||
      undefined;
    let enabled = false;
    if (
      info.type === "cdp" &&
      (runtime.env.CUA_REPL_BROWSER_ENV === "cloud" ||
        runtime.env.CUA_REPL_BROWSER_ENV === "orbit")
    )
      enabled = true;
    else if (setting != null) enabled = setting === "1";
    else if (info.type === "cdp")
      enabled = runtime.env.BROWSER_USE_ENABLE_TINYSKY_ACCESSIBILITY === "1";
    else if (info.type === "iab")
      enabled = deps.featureEnabled(runtime, "codex-browser-use-tinysky", {
        enabledByDefault: false,
      });
    else if (info.type === "extension")
      enabled = deps.featureEnabled(runtime, "codex-browser-use-tinysky", {
        enabledByDefault: deps.deploymentEnvironment() !== "production",
      });
    return !enabled && info.apiSupportOverrides?.["Tab.ax"] !== true
      ? info
      : {
          ...info,
          apiSupportOverrides: {
            ...info.apiSupportOverrides,
            "Tab.ax": enabled,
            ...(enabled ? { "Tab.cua": false, "Tab.dom_cua": false } : {}),
          },
        };
  }
  async function readInfo(runtime: any, api: any, preferences?: any) {
    const original = await browserBackendDeadline(api.getInfo());
    const enriched = await deps
      .enrichProfile(original, runtime)
      .catch((error) => {
        deps.reportError(error);
        return original;
      });
    const info = await addFullCdpCapability(runtime, enriched, {
      isFullCdpEnabled:
        preferences == null ? undefined : () => preferences.isFullCdpEnabled(),
    });
    return applyAccessibility(runtime, info);
  }
  return { readInfo, applyAccessibility };
}
/** Original C6. Profile source remains host supplied until platform profile/extension storage is restored. */
export function createProfileEnrichment(
  readProfiles: (
    family: string,
    extensionId: string,
    platform: string,
  ) => Promise<any[]>,
) {
  return async function enrichProfile(info: any, runtime: any) {
    if (
      info.type !== "extension" ||
      !info.metadata?.extensionInstanceId ||
      !info.metadata.extensionId
    )
      return info;
    const profile = (
      await readProfiles(
        info.family ?? "chrome",
        info.metadata.extensionId,
        runtime.platform,
      )
    ).find(
      ({ instanceId }) => instanceId === info.metadata?.extensionInstanceId,
    );
    return profile
      ? {
          ...info,
          metadata: {
            ...info.metadata,
            profileName: profile.name,
            profileIsLastUsed: profile.isLastUsed.toString(),
            profileOrdering: profile.orderingIndex.toString(),
          },
        }
      : info;
  };
}
