import { browserTelemetry } from "../runtime/browser_telemetry";
import { createPackagedAuthQrFlow } from "./qr";
import { createBrowserAuthHandoff } from "./handoff";
import * as binding from "./bindings";
import * as inspection from "./field_inspection";
import * as plan from "./field_plan";
import { createAuthCheckpointClass } from "./checkpoint";
import { createAuthSubmission } from "./submission";
import {
  createAuthCredentialBinding,
  createManualSavePreflight,
  type AuthPreflightTelemetry,
} from "./broker_binding";
import { readAuthActionTargets } from "./action_review";
import {
  automatedReviewHosts,
  createAutomatedAuthPrecheck,
} from "./automated_review";
import { captureAuthScreenshot } from "./screenshot";
import { credentialLeases } from "../credentials/index";
import { credentialObservationState } from "../security/credential_observation";
import { httpOrigin } from "../security/authority_builder";
import { siteStatusBackend, fetchSiteStatus } from "../security/site_status";
import {
  codexTurnMetadata,
  metadataSession,
} from "../preferences/request_context";
import { browserDisplayName } from "../security/approval";
import { browserAuthTabCapabilityDefinition } from "../../capabilities/tab_browser_auth";
/** Safety review needs documentation context; telemetry and QR have restored defaults. */
export function assembleBrowserAuthHandoff(host: {
  reviewSafety: (input: any) => Promise<any>;
  qr?: { decode: (...args: any[]) => Promise<any>; start: (input: any) => any };
  telemetry?: AuthPreflightTelemetry;
}) {
  const qr = host.qr ?? createPackagedAuthQrFlow();
  const telemetry = host.telemetry ?? {
    logStatsigEvent: browserTelemetry.emitEvent,
  };
  return createBrowserAuthHandoff({
    closeCredentialLease: credentialLeases.close,
    revalidatePage: binding.revalidateAuthPage,
    reviewSafety: host.reviewSafety,
    manualSavePreflight: createManualSavePreflight(() => telemetry),
    readPageBinding: binding.readAuthPageBinding,
    parseUrl(value: string) {
      try {
        return new URL(value);
      } catch {
        return null;
      }
    },
    turnMetadata: codexTurnMetadata,
    authCapability: browserAuthTabCapabilityDefinition,
    validOptions: inspection.validAuthOptions,
    revalidateLocators: inspection.revalidateAuthLocators,
    validIntermediateFrames: binding.validAuthIntermediateFrames,
    hasNestedFrames: binding.hasNestedAuthFrames,
    readFormBinding: binding.readAuthFormBinding,
    backendApiUrl: siteStatusBackend,
    validObservationPredecessor: credentialObservationState.resume,
    isQrOnly: plan.isQrOnlyAuth,
    completeChallenge: plan.completeAuthChallenge,
    startCredentialLease: credentialLeases.start,
    startQrMonitor: qr.start,
    captureScreenshot: captureAuthScreenshot,
    createCredentialBinding: createAuthCredentialBinding,
    createFieldPlan: plan.createAuthFieldPlan,
    unsupportedCapability(name: string, command: any) {
      return new Error(`${name} does not support command "${command.type}".`);
    },
    currentReviewHost: automatedReviewHosts.current,
    readActionTargets: readAuthActionTargets,
    createSafetyPrecheck: createAutomatedAuthPrecheck,
    isElicitationUnavailable(error: any) {
      if (error == null || typeof error !== "object") return false;
      try {
        return (
          "message" in error &&
          error.message ===
            "nodeRepl.createElicitation is unavailable because the MCP client does not support form elicitation"
        );
      } catch {
        return false;
      }
    },
    readOptionBindings: binding.readAuthOptionBindings,
    backendFetch: fetchSiteStatus,
    allowsOrdinaryOption: plan.allowsOrdinaryCredentialOption,
    browserName: browserDisplayName,
    firstInvisibleField: inspection.firstInvisibleAuthField,
    validLocatorLayout: plan.validAuthLocatorLayout,
    mapOptions: plan.mapAuthOptions,
    submitValues: createAuthSubmission(),
    sameSite: binding.sameAuthSite,
    decodeQr: qr.decode,
    metadataSession,
    Checkpoint: createAuthCheckpointClass(),
    inspectFields: inspection.inspectAuthFields,
    httpOrigin,
    // Original jn initializes the telemetry module; the ESM import above already did so.
    initializeTelemetry() {},
    telemetry,
  });
}
