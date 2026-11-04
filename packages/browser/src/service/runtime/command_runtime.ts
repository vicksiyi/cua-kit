import { executeWithCommandContext as executeInCommandContext } from "./command_execution";
import { formatCommandError as normalizeCommandError } from "./command_errors";
import { classifyCommandError, securityErrorReason } from "../classify_error";
import { NavigationUrlPolicyError } from "../security/authority_builder";
import {
  assertCommandSupported as checkCommandSupported,
  securityCheckAttributes as mapSecurityCheck,
  reportCommandRecovery as emitCommandRecovery,
  browserClientRelease,
  createRuntimeDocumentation,
} from "./runtime_policies";
import type { DocumentationBundle } from "../context/documentation";
import { createCommandRecording } from "./command_recorders";
import {
  createResponseScreenshot,
  emitResponseMetadata as emitBrowserResponseMetadata,
} from "./response_metadata";
import { DocumentationController } from "./documentation_controller";
import { commandScheduling } from "./command_scheduler";
/** Reconstructed p6 runtime. Each factory owns the original module-level state.
 * Dependencies are explicit service boundaries; production assembly is tracked separately.
 * Dynamic host/provider values retain explicit any until their full contracts are recovered. */
export interface CommandRuntimeOptions {
  environment?: string;
  elicitationDisplayName?: string;
  undocumentedApiMembers?: unknown;
  excludedDocumentation?: unknown;
}
export interface CommandRuntimeDependencies {
  setExceptionReporter: (...args: any[]) => any;
  setSecurityCheckReporter: (...args: any[]) => any;
  securityCheckAttributes?: (...args: any[]) => any;
  configureRuntimeTelemetry: (...args: any[]) => any;
  emitEvent: (...args: any[]) => any;
  release?: string;
  createCommandRecorder?: (...args: any[]) => any;
  createNavigationRecorder?: (...args: any[]) => any;
  createInteractionRecorder?: (...args: any[]) => any;
  createResponseRecorder?: (...args: any[]) => any;
  collectNotifications: (...args: any[]) => any;
  reportNotificationError: (...args: any[]) => any;
  loadApiManifest: (...args: any[]) => any;
  loadDocumentManifest: (...args: any[]) => any;
  disabledApiMembers: (...args: any[]) => any;
  Documentation?: new (...args: any[]) => any;
  readDocumentation: (...args: any[]) => any;
  createBackendSessionReporter: (...args: any[]) => any;
  createCommandScheduler?: (...args: any[]) => any;
  readRequestMetadata: (...args: any[]) => any;
  managementCommands: Record<string, any>;
  surfaceForBackend: (...args: any[]) => any;
  shouldEmitResponseMetadata?: (...args: any[]) => any;
  emitResponseMetadata?: (...args: any[]) => any;
  isBrowserAlias: (...args: any[]) => any;
  assertSurfaceEnabled: (...args: any[]) => any;
  BrowserContext: new (...args: any[]) => any;
  configureBackendTelemetry: (...args: any[]) => any;
  configureTurnTelemetry: (...args: any[]) => any;
  assertCommandSupported?: (...args: any[]) => any;
  browserCommands: Array<any>;
  telemetryTurnIds: (...args: any[]) => any;
  browserTelemetryAttributes: (...args: any[]) => any;
  downloadCommand: { type: string };
  claimTabCommand: { type: string };
  getUserTabContextCommand: { type: string };
  webMcpCallCommand: { type: string };
  lookupWebMcpTool: (...args: any[]) => any;
  initializeAccessibility: (...args: any[]) => any;
  executeWithCommandContext?: (...args: any[]) => any;
  manualHandoffCommand: { type: string };
  classifyError?: (...args: any[]) => any;
  securityBlockReason?: (...args: any[]) => any;
  UrlPolicyError?: new (...args: any[]) => any;
  formatCommandError?: (...args: any[]) => any;
  canRecordCommand?: (...args: any[]) => any;
  trackRecordingContext: (...args: any[]) => any;
  reportCommandRecovery?: (...args: any[]) => any;
  getTabCommand: { type: string };
}
export function createCommandRuntimeFactory(
  dependencies: CommandRuntimeDependencies,
) {
  const recording = createCommandRecording({
    captureResponseScreenshot: createResponseScreenshot(
      dependencies.emitEvent,
      dependencies.canRecordCommand,
    ),
    emitResponseMetadata:
      dependencies.emitResponseMetadata ?? emitBrowserResponseMetadata,
    canObserve: dependencies.canRecordCommand,
    shouldEmitResponseMetadata: dependencies.shouldEmitResponseMetadata,
  });
  const {
    setExceptionReporter,
    setSecurityCheckReporter,
    securityCheckAttributes = mapSecurityCheck,
    configureRuntimeTelemetry,
    emitEvent,
    release = browserClientRelease,
    createCommandRecorder = recording.createCommandRecorder,
    createNavigationRecorder = recording.createNavigationRecorder,
    createInteractionRecorder = recording.createInteractionRecorder,
    createResponseRecorder = recording.createResponseRecorder,
    collectNotifications,
    reportNotificationError,
    loadApiManifest,
    loadDocumentManifest,
    disabledApiMembers,
    Documentation = DocumentationController,
    readDocumentation,
    createBackendSessionReporter,
    createCommandScheduler = commandScheduling.createCommandScheduler,
    readRequestMetadata,
    managementCommands,
    surfaceForBackend,
    shouldEmitResponseMetadata = commandScheduling.shouldEmitResponseMetadata,
    emitResponseMetadata = emitBrowserResponseMetadata,
    isBrowserAlias,
    assertSurfaceEnabled,
    BrowserContext,
    configureBackendTelemetry,
    configureTurnTelemetry,
    assertCommandSupported = checkCommandSupported,
    browserCommands,
    telemetryTurnIds,
    browserTelemetryAttributes,
    downloadCommand,
    claimTabCommand,
    getUserTabContextCommand,
    webMcpCallCommand,
    lookupWebMcpTool,
    initializeAccessibility,
    executeWithCommandContext = executeInCommandContext,
    manualHandoffCommand,
    classifyError = classifyCommandError,
    securityBlockReason = securityErrorReason,
    UrlPolicyError = NavigationUrlPolicyError,
    formatCommandError = normalizeCommandError,
    canRecordCommand = commandScheduling.canObserve,
    trackRecordingContext,
    reportCommandRecovery = emitCommandRecovery,
    getTabCommand,
  } = dependencies;
  const maxConfirmationPolicyBytes = 20_000;
  let disposeCurrentRuntime: (() => Promise<void>) | null = null;
  let sharedRecorder: any;
  const reportedSessions = new Set();
  let notificationHookRegistered = false;
  async function createRuntime(
    {
      environment,
      elicitationDisplayName: elicitationDisplayName = environment ===
        "cloud" || environment === "orbit"
        ? "Cloud browser"
        : "Browser use",
      undocumentedApiMembers,
      excludedDocumentation,
    }: CommandRuntimeOptions,
    runtime: any,
  ) {
    let {
      config,
      browserContext: browserDirectory,
      commandTiming,
      errorReporter,
      filesystem,
      performanceSpan,
    } = runtime;
    (setExceptionReporter(errorReporter.captureException.bind(errorReporter)),
      setSecurityCheckReporter((check: any) => {
        if (runtime.otel != null) {
          let completion: any = securityCheckAttributes(check);
          completion != null &&
            runtime.otel.log("codex.browser_use.security_check", completion);
        }
      }),
      configureRuntimeTelemetry(runtime, errorReporter),
      emitEvent(runtime, "browser_use_invocation_started", "multi", {
        backend: "multi",
        platform: runtime.platform,
        release,
      }));
    let contexts: any = new Map(),
      recorder: any = (sharedRecorder ??= createCommandRecorder(
        [
          createNavigationRecorder(),
          createInteractionRecorder(),
          createResponseRecorder(),
        ],
        runtime,
      ));
    (notificationHookRegistered ||
      (runtime.addAfterSubmittedCodeHook({
        timeoutMs: 12e3,
        run: async () => {
          try {
            await runtime.assertBrowserAccess?.();
          } catch {
            return;
          }
          try {
            let command: any = await performanceSpan.withSpan(
              "browser_use.response.notifications",
              {},
              collectNotifications,
            );
            command && runtime.emitContentItem(command);
          } catch (command: any) {
            reportNotificationError(command);
          }
        },
      }),
      (notificationHookRegistered = !0)),
      disposeCurrentRuntime && (await dispose()));
    let disposal: any;
    disposeCurrentRuntime = () => (
      (disposal ??= (async () => {
        (await Promise.all(
          [...contexts.values()].map((context: any) => context.dispose()),
        ),
          await browserDirectory.dispose());
      })()),
      disposal
    );
    let [apiManifest, documentManifest] = await Promise.all([
        loadApiManifest(filesystem, { environment: environment }),
        loadDocumentManifest(filesystem, { environment: environment }),
      ]),
      isOrbit: any =
        environment === "orbit" || runtime.env.CUA_REPL_BROWSER_ENV === "orbit",
      disabledMemberIds: any = disabledApiMembers(runtime),
      documentation: any = new Documentation({
        apiManifest,
        disabledMemberIds,
        documentManifest: isOrbit
          ? documentManifest.map((document: any) =>
              document.name === "confirmations"
                ? { mode: "model", name: document.name }
                : document,
            )
          : documentManifest,
        undocumentedApiMembers,
        excludedDocumentation,
        addendum: documentationAddendum(runtime),
        readDocumentation: async (command: any) => {
          if (command === "confirmations") {
            if (isOrbit) return "";
            let completion: any =
                runtime.requestMeta?.["openai/confirmation_policies"],
              metadata: any = isRecord(completion)
                ? completion.browser_use
                : void 0;
            if (
              typeof metadata == "string" &&
              metadata.trim() !== "" &&
              new TextEncoder().encode(metadata).byteLength <=
                maxConfirmationPolicyBytes
            )
              return metadata;
          }
          return readDocumentation(runtime, command, filesystem, {
            environment,
          });
        },
      }),
      reportBackendSession: any = createBackendSessionReporter(
        (command: any, completion: any, metadata: any) => {
          emitEvent(
            runtime,
            "browser_use_backend_session_started",
            command,
            { ...completion, platform: runtime.platform },
            metadata,
          );
        },
        reportedSessions,
      ),
      downloadSetup: any = new WeakMap(),
      dispatch: any = createCommandScheduler(
        async (command: any, completion: any) => {
          if (disposal != null) throw new Error("Browser runtime is disposed");
          let metadata: any = readRequestMetadata(runtime),
            requestMetadata: any = metadata == null ? void 0 : { ...metadata },
            { type: commandType, ...params } = command;
          documentation.assertRequiredDocumentationRead(commandType);
          let managementCommand: any = Object.values(managementCommands).find(
            (value: any) => value.type === commandType,
          );
          if (managementCommand) {
            let value: any = await performanceSpan.withCommandTelemetry(
                commandType,
                params,
                async () =>
                  managementCommand(
                    params,
                    browserDirectory,
                    runtime,
                    documentation,
                  ),
                requestMetadata,
              ),
              detail: any =
                ("browser_id" in params && typeof params.browser_id == "string"
                  ? params.browser_id
                  : void 0) ??
                (isRecord(value) && typeof value.id == "string"
                  ? value.id
                  : void 0);
            if (detail != null) {
              let item: any = await browserDirectory.get(detail),
                surface: any = surfaceForBackend(item.info.type);
              (reportBackendSession(surface, requestMetadata, item.info),
                (await shouldEmitResponseMetadata()) &&
                  emitResponseMetadata(runtime, surface, {
                    browserId: item.id,
                    browserFamily: item.info.family,
                  }));
            }
            return value;
          }
          if (!("browser_id" in params))
            throw new Error("Browser ID must be provided");
          if (isBrowserAlias(params.browser_id)) {
            let value: any = surfaceForBackend(params.browser_id);
            assertSurfaceEnabled(runtime, value);
          }
          let browser: any = await browserDirectory.get(params.browser_id);
          if (disposal != null) throw new Error("Browser runtime is disposed");
          let existingContext: any = contexts.get(browser.api);
          existingContext == null &&
            ((existingContext = new BrowserContext(
              browser.api,
              browser.id,
              browser.info,
              {
                commandTiming,
                config,
                elicitationDisplayName,
                environment,
                filesystem,
                performanceSpan,
                runtime,
                preferredWindowId: browserDirectory.preferredWindowIdFor(
                  browser.info,
                ),
              },
            )),
            contexts.set(browser.api, existingContext),
            browser.api.addCloseListener(() => {
              contexts.delete(browser.api);
            }));
          let context: any = existingContext,
            tabId: any = Number(params.tab_id),
            pendingDownloadSetup: any = downloadSetup
              .get(browser.api)
              ?.get(tabId);
          (pendingDownloadSetup != null && (await pendingDownloadSetup),
            completion != null &&
              (context = Object.create(context, {
                finishNativeCredentialModelCommand: { value: completion },
              })),
            configureBackendTelemetry(
              runtime,
              errorReporter,
              context.clientInfo.type,
            ),
            configureTurnTelemetry(runtime, errorReporter));
          let backend: any = surfaceForBackend(context.clientInfo.type);
          (reportBackendSession(backend, requestMetadata, context.clientInfo),
            assertCommandSupported({
              browserInfo: context.clientInfo,
              commandType,
            }));
          let browserCommand: any = browserCommands.find(
              (value: any) => value.type === commandType,
            ),
            { thread_id: threadId, turn_id: turnId } = telemetryTurnIds(
              backend,
              requestMetadata,
            ),
            telemetryAttributes: any = {
              ...browserTelemetryAttributes(context.clientInfo),
              browser_env:
                runtime.env.CUA_REPL_BROWSER_ENV ?? environment ?? "unknown",
              thread_id: threadId,
              turn_id: turnId,
            },
            errorCode: any = "unknown",
            timing: any = commandTiming.startCommand(
              commandType,
              (value: any, detail: any, item: any) =>
                emitEvent(runtime, value, detail, {
                  ...item,
                  ...telemetryAttributes,
                  ...(item?.outcome === "failure"
                    ? { error_code: errorCode }
                    : {}),
                }),
            ),
            succeeded: any = !1,
            result: any,
            webMcpTool: any,
            finishDownloadSetup: any;
          try {
            if (commandType === downloadCommand.type) {
              let value: any = downloadSetup.get(browser.api) ?? new Map();
              downloadSetup.set(browser.api, value);
              let { promise: detail, resolve: item } = Promise.withResolvers();
              (value.set(tabId, detail),
                (finishDownloadSetup = () => {
                  (value.get(tabId) === detail && value.delete(tabId),
                    item(void 0));
                }),
                (context = Object.create(context, {
                  finishDownloadSetup: { value: finishDownloadSetup },
                })));
            }
            return (
              (await shouldEmitResponseMetadata(context)) &&
                emitResponseMetadata(runtime, backend, {
                  browserId: context.browserId,
                  browserFamily: context.clientInfo.family,
                  params,
                }),
              (result = await timing.run(async () => {
                if (
                  (context.clientInfo.apiSupportOverrides?.["Browser.user"] ??
                    context.clientInfo.type === "extension") &&
                  commandType !== claimTabCommand.type &&
                  commandType !== getUserTabContextCommand.type &&
                  Number.isSafeInteger(tabId) &&
                  tabId > 0 &&
                  context.tabLifecycle.needsReclaim(tabId)
                ) {
                  let value: any = await performanceSpan.withSpan(
                    "browser_use.tab.reclaim",
                    {
                      "browser_use.command.type": commandType,
                      "browser_use.tab.id": tabId,
                    },
                    () => context.browserUser.claimTab(tabId),
                  );
                  context.tabLifecycle.recordAcquired(value.id);
                }
                return (
                  commandType === webMcpCallCommand.type &&
                    (webMcpTool = lookupWebMcpTool(
                      context,
                      tabId,
                      params.registration_id,
                    )),
                  (commandType === "tab_ax_get_state" ||
                    commandType === "tab_ax_action") &&
                    (await initializeAccessibility(
                      runtime.env.BROWSER_USE_ACCESSIBILITY_CORE_WASM_PATH?.trim() ||
                        void 0,
                      { env: runtime.env },
                    )),
                  browserCommand
                    ? await performanceSpan.withCommandTelemetry(
                        commandType,
                        params,
                        async () =>
                          await executeWithCommandContext(
                            context,
                            params,
                            (value: any, detail: any) =>
                              browserCommand(detail, value),
                          ),
                        requestMetadata,
                      )
                    : await performanceSpan.withCommandTelemetry(
                        commandType,
                        params,
                        async () =>
                          await context.executeUnhandledCommand({
                            type: commandType,
                            ...params,
                          }),
                        requestMetadata,
                      )
                );
              })),
              commandType === manualHandoffCommand.type &&
                (await context.followSessionTab(
                  Number(params.tab_id),
                  "handoff",
                )),
              (succeeded = !0),
              result
            );
          } catch (value: any) {
            try {
              errorCode = classifyError(value);
              let detail: any = securityBlockReason(value);
              detail != null &&
                emitEvent(runtime, "browser_use_security_blocked", detail, {
                  ...telemetryAttributes,
                  backend,
                  command_type: browserCommand?.type ?? "unhandled",
                  ...(value instanceof UrlPolicyError
                    ? {
                        url_policy_reason: value.urlPolicyReason,
                        url_scheme_category: value.urlSchemeCategory,
                      }
                    : {}),
                });
            } catch {}
            throw formatCommandError(value, context.clientInfo);
          } finally {
            if (
              (finishDownloadSetup?.(), succeeded && canRecordCommand(context))
            ) {
              let value: any;
              try {
                value = await commandCurrentUrl(context, command);
              } catch {
                value = void 0;
              }
              canRecordCommand(context) &&
                (trackRecordingContext(browser.api, context),
                recorder.recordCommand(commandType, {
                  backend,
                  commandSucceeded: succeeded,
                  context,
                  currentUrl: value,
                  params,
                  result,
                  runtime,
                  webMcpTool,
                }));
            }
            (succeeded &&
              commandType === manualHandoffCommand.type &&
              !canRecordCommand(context) &&
              recorder.recordCommand(commandType, {
                backend,
                commandSucceeded: succeeded,
                context,
                params,
                result: {},
                runtime,
              }),
              timing.finish(succeeded ? "success" : "failure"));
          }
        },
        async (command: any) => (await browserDirectory.get(command)).id,
        (command: any) => reportCommandRecovery(runtime, command),
      ),
      executeWithHandoffSpan: any = async (command: any) => {
        if (
          command.type !== "mark_tab" &&
          command.type !== "tab_manual_handoff_request"
        )
          return await dispatch(command);
        let completion: any = Number(command.tab_id);
        return await performanceSpan.withSpan(
          "browser_use.tab.handoff",
          {
            "browser_use.command.type": command.type,
            "browser_use.tab.id":
              Number.isSafeInteger(completion) && completion > 0
                ? completion
                : void 0,
            "browser_use.tab.mark_status":
              command.type === "tab_manual_handoff_request"
                ? "manual_handoff"
                : command.status === "handoff" ||
                    command.status === "deliverable"
                  ? command.status
                  : "invalid",
          },
          async () => await dispatch(command),
        );
      };
    return (
      emitEvent(runtime, "browser_use_setup", void 0, { backend: "multi" }),
      emitEvent(runtime, "browser_use_invocation_ready", "multi", {
        backend: "multi",
        platform: runtime.platform,
        release,
      }),
      {
        apiManifest,
        disabledMemberIds,
        async executeAgentCommand(command: any) {
          return (
            await runtime.assertBrowserAccess?.(),
            ((command.type === "get_browser" && command.id === "dot") ||
              ("browser_id" in command && command.browser_id === "dot")) &&
              assertSurfaceEnabled(runtime, "dot"),
            executeWithHandoffSpan(command)
          );
        },
      }
    );
  }
  async function dispose() {
    await disposeCurrentRuntime?.();
  }
  async function commandCurrentUrl(context: any, command: any) {
    if (!isRecord(command)) return;
    const tabId = command.tab_id;
    if (typeof tabId !== "string" && typeof tabId !== "number") return;
    const url = context.cdp.currentTopLevelUrl(tabId);
    return url != null ||
      command.type === getTabCommand.type ||
      !context.cdp.isTabAttached(tabId)
      ? url
      : await context.cdp.readCommittedTabUrl(tabId);
  }
  return { createRuntime, dispose };
}
function isRecord(value: any) {
  return typeof value === "object" && value != null && !Array.isArray(value);
}
function documentationAddendum(runtime: any) {
  if (!runtime.env.CUA_REPL_ENABLED_SURFACES?.split(",").includes("browser"))
    return;
  const value = runtime.env.CUA_REPL_BROWSER_DOCUMENTATION_ADDENDUM;
  return value?.trim() ? value : undefined;
}

/** Connect original j3/wf/oD/iD without guessing a production asset location. */
export function createDocumentedCommandRuntimeFactory(
  dependencies: Omit<
    CommandRuntimeDependencies,
    "loadApiManifest" | "loadDocumentManifest" | "readDocumentation"
  >,
  moduleUrl: string,
  bundle?: DocumentationBundle,
) {
  return createCommandRuntimeFactory({
    ...dependencies,
    ...createRuntimeDocumentation(moduleUrl, bundle),
  });
}
