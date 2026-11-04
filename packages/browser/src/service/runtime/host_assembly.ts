import {
  createBrowserHostFactory,
  privilegedNodeRepl,
  type BrowserHostDependencies,
} from "./host";
import {
  createBrowserPipeClass,
  privilegedNativePipe,
} from "./native_pipe_bridge";
import { createBrowserAccessVerifier } from "./browser_access";
import {
  createBrowserProfileReader,
  type BrowserProfileDependencies,
} from "./browser_profiles";
import {
  createBrowserHandshake,
  type HandshakeDependencies,
} from "./browser_handshake";
import {
  createBrowserDiscovery,
  type BrowserDiscoveryDependencies,
} from "./browser_discovery";
import {
  createBrowserDirectoryClass,
  createTurnEndedTrackerClass,
} from "./browser_directory";
import {
  browserSurfaceEnabled,
  assertBrowserSurfaceEnabled,
  surfaceForBackend,
  preferredBrowserExtension,
} from "./surface_policy";
import { codexTurnMetadata } from "../preferences/request_context";
import { Preferences } from "../preferences/preferences";
import { credentialObservationState } from "../security/credential_observation";
import { automatedReviewHosts } from "../browser_auth/automated_review";
import {
  createElicitationTelemetry,
  type ElicitationSpan,
} from "./elicitation_telemetry";
export interface BrowserHostAssemblyOptions {
  reportError(error: any): void;
  reportDiscoveryFailure: BrowserDiscoveryDependencies["reportDiscoveryFailure"];
  featureEnabled: HandshakeDependencies["featureEnabled"];
  span: BrowserDiscoveryDependencies["span"] & ElicitationSpan;
  commandTiming: any;
  performanceSpan: any;
  createErrorReporter: BrowserHostDependencies["createErrorReporter"];
  loadClassicLevel?: BrowserProfileDependencies["loadClassicLevel"];
  getNativeCredentialObservationStatus: BrowserHostDependencies["getNativeCredentialObservationStatus"];
  createBrowserAuthBrokerChallenge: BrowserHostDependencies["createBrowserAuthBrokerChallenge"];
  getPrivilegedRepl?: () => any;
  getNativePipeBridge?: () => any;
}
/** Assembles restored mH dependencies. ClassicLevel uses the upstream default; telemetry SDK and broker service remain host inputs. */
export function assembleBrowserHost(options: BrowserHostAssemblyOptions) {
  // Installed Po returns this literal. Keep it shared by handshake and bridge errors.
  const deploymentEnvironment = () => "production";
  const { BrowserPipe } = createBrowserPipeClass(
    deploymentEnvironment,
    options.getNativePipeBridge ?? privilegedNativePipe,
  );
  const connect = (path: string) => BrowserPipe.create(path);
  const access = createBrowserAccessVerifier({ connect });
  const profiles = createBrowserProfileReader({
    loadClassicLevel: options.loadClassicLevel,
    reportError: options.reportError,
  });
  const handshake = createBrowserHandshake({
    enrichProfile: profiles.enrichProfile,
    reportError: options.reportError,
    featureEnabled: options.featureEnabled,
    deploymentEnvironment,
  });
  const discovery = createBrowserDiscovery({
    connect,
    readInfo: handshake.readInfo,
    span: options.span,
    surfaceEnabled: browserSurfaceEnabled,
    surfaceForType: surfaceForBackend,
    reportError: options.reportError,
    reportDiscoveryFailure: options.reportDiscoveryFailure,
    ignoredHandshakeError: "MCP Apps browser belongs to another task.",
  });
  const BrowserDirectory = createBrowserDirectoryClass({
    TurnEndedTracker: createTurnEndedTrackerClass(options.reportError),
    discover: discovery.discover,
    turnMetadata: codexTurnMetadata,
    surfaceEnabled: browserSurfaceEnabled,
    assertSurfaceEnabled: assertBrowserSurfaceEnabled,
    connect,
    readInfo: handshake.readInfo,
  });
  return createBrowserHostFactory({
    getPrivilegedRepl: options.getPrivilegedRepl ?? privilegedNodeRepl,
    createAccessAssertion: access.createAssertion,
    registerAutomatedReviewHost: automatedReviewHosts.register,
    BrowserDirectory,
    extensionSelection: preferredBrowserExtension,
    Preferences,
    commandTiming: options.commandTiming,
    createErrorReporter: options.createErrorReporter,
    performanceSpan: options.performanceSpan,
    trackElicitation: createElicitationTelemetry(options.span),
    initializeCredentialObservation: credentialObservationState.initialize,
    getNativeCredentialObservationStatus:
      options.getNativeCredentialObservationStatus,
    createBrowserAuthBrokerChallenge: options.createBrowserAuthBrokerChallenge,
  });
}
