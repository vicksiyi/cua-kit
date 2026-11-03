import { createBrowserContextClass } from "./browser_context";
import { Preferences } from "../preferences/preferences";
import { createCdpManagerClass } from "../cdp/manager";
import { BrowserClipboard } from "./browser_clipboard";
import { ServiceBrowserUser } from "./browser_user";
import { BrowserUi } from "./ui";
import { BrowserInput } from "../input/index";
import { BrowserDev } from "./dev";
import { ServiceTabs } from "./tabs";
import { TabLifecycle } from "./tab_lifecycle";
import { PlaywrightService } from "../playwright/service";
import { BrowserSecurity } from "../security/browser_security";
import { DocumentResponses } from "./document_responses";
import { Downloads } from "./downloads";
import { SiteInstructions } from "./site_instructions";
import { createPageAssetsClass } from "./page_assets";
import { AccessibilityCaptureManager } from "../accessibility/capture_manager";
import { createAxActionService } from "../accessibility/page_actions";
import { credentialObservationState } from "../security/credential_observation";
import { disabledApiMembers } from "../capability_filter";
import { clearWebMcpSessions } from "../webmcp/session_catalog";
/** Original Je: observations are disabled by any native-credential gate, not just this context. */
export function canObserveBrowserContext(context?: any) {
  return (
    !credentialObservationState.isUnavailable() &&
    !context?.credentialObservationGate?.usedNativeCredentials &&
    credentialObservationState
      .allGates()
      .every((gate) => !gate.usedNativeCredentials)
  );
}
export interface BrowserContextHost {
  injectedSource: string;
  reportError: Parameters<typeof createCdpManagerClass>[0];
  reportEvent: Parameters<typeof createPageAssetsClass>[0];
  createLocalizer(locale?: string): (...args: any[]) => any;
}
/** Connects restored services. Injected helper, localization and telemetry still come from the host. */
export function assembleBrowserContext(host: BrowserContextHost) {
  // Restored Playwright uses an explicit injected-source argument; adapt the original ig constructor order.
  class ContextPlaywright extends PlaywrightService {
    constructor(
      cdp: any,
      cua: any,
      performanceSpan: any,
      commandTiming: any,
      isIabBackend: boolean,
      executionPolicy: any,
    ) {
      super(
        cdp,
        host.injectedSource,
        commandTiming,
        performanceSpan,
        cua,
        isIabBackend,
        executionPolicy,
      );
    }
  }
  return createBrowserContextClass({
    Preferences,
    Cdp: createCdpManagerClass(host.reportError),
    Clipboard: BrowserClipboard,
    BrowserUser: ServiceBrowserUser,
    Ui: BrowserUi,
    Cua: BrowserInput,
    Dev: BrowserDev,
    Tabs: ServiceTabs,
    TabLifecycle,
    Playwright: ContextPlaywright,
    Security: BrowserSecurity,
    DocumentResponses,
    Downloads,
    SiteInstructions,
    PageAssets: createPageAssetsClass(host.reportEvent),
    Accessibility: AccessibilityCaptureManager,
    AccessibilityActions: createAxActionService(),
    credentialObservationGate: credentialObservationState.getGate,
    canObserve: canObserveBrowserContext,
    disabledCapabilities: disabledApiMembers,
    createLocalizer: host.createLocalizer,
    clearWebMcpSessions,
  });
}
