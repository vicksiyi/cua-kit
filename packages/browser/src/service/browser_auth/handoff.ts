import { defineCommand } from "../commands/define_command";
import { TabBrowserAuthCommands as authCommands } from "../../commands/browser_auth";
const signInReason = "Sign in to continue";
const userTakeoverKey = "openai/user_took_over";
/** Original rN. Full control flow; assembly dependencies are explicit until host wiring is completed. */
export interface BrowserAuthHandoffDependencies {
  closeCredentialLease: (...args: any[]) => any;
  revalidatePage: (...args: any[]) => any;
  reviewSafety: (...args: any[]) => any;
  manualSavePreflight: (...args: any[]) => any;
  readPageBinding: (...args: any[]) => any;
  parseUrl: (...args: any[]) => any;
  turnMetadata: (...args: any[]) => any;
  authCapability: { id: string };
  validOptions: (...args: any[]) => any;
  revalidateLocators: (...args: any[]) => any;
  validIntermediateFrames: (...args: any[]) => any;
  hasNestedFrames: (...args: any[]) => any;
  readFormBinding: (...args: any[]) => any;
  backendApiUrl: (...args: any[]) => any;
  validObservationPredecessor: (
    challengeId: string,
    predecessor?: unknown,
  ) => boolean;
  isQrOnly: (...args: any[]) => any;
  completeChallenge: (...args: any[]) => any;
  startCredentialLease: (...args: any[]) => any;
  startQrMonitor: (...args: any[]) => any;
  captureScreenshot: (...args: any[]) => any;
  createCredentialBinding: (...args: any[]) => any;
  createFieldPlan: (...args: any[]) => any;
  unsupportedCapability: (...args: any[]) => any;
  currentReviewHost: (...args: any[]) => any;
  readActionTargets: (...args: any[]) => any;
  createSafetyPrecheck: (...args: any[]) => any;
  isElicitationUnavailable: (...args: any[]) => any;
  readOptionBindings: (...args: any[]) => any;
  backendFetch: (...args: any[]) => any;
  allowsOrdinaryOption: (...args: any[]) => any;
  browserName: (...args: any[]) => any;
  firstInvisibleField: (...args: any[]) => any;
  validLocatorLayout: (...args: any[]) => any;
  mapOptions: (...args: any[]) => any;
  submitValues: (...args: any[]) => any;
  sameSite: (...args: any[]) => any;
  decodeQr: (...args: any[]) => any;
  metadataSession: (...args: any[]) => any;
  Checkpoint: new (...args: any[]) => any;
  inspectFields: (...args: any[]) => any;
  httpOrigin: (...args: any[]) => any;
  initializeTelemetry: (...args: any[]) => any;
  telemetry: { logStatsigEvent(...args: any[]): any };
}
export function createBrowserAuthHandoff(
  dependencies: BrowserAuthHandoffDependencies,
) {
  const {
    closeCredentialLease,
    revalidatePage,
    reviewSafety,
    manualSavePreflight,
    readPageBinding,
    parseUrl,
    turnMetadata,
    authCapability,
    validOptions,
    revalidateLocators,
    validIntermediateFrames,
    hasNestedFrames,
    readFormBinding,
    backendApiUrl,
    validObservationPredecessor,
    isQrOnly,
    completeChallenge,
    startCredentialLease,
    startQrMonitor,
    captureScreenshot,
    createCredentialBinding,
    createFieldPlan,
    unsupportedCapability,
    currentReviewHost,
    readActionTargets,
    createSafetyPrecheck,
    isElicitationUnavailable,
    readOptionBindings,
    backendFetch,
    allowsOrdinaryOption,
    browserName,
    firstInvisibleField,
    validLocatorLayout,
    mapOptions,
    submitValues,
    sameSite,
    decodeQr,
    metadataSession,
    Checkpoint,
    inspectFields,
    httpOrigin,
    initializeTelemetry,
    telemetry,
  } = dependencies;
  return defineCommand(
    authCommands.Handoff,
    async (request: any, context: any) => {
      if (
        (await context
          .acquireAuthority()
          .actInFrame(
            await context.security.currentTabUrl(Number(request.tab_id)),
          )
          .assert(),
        !(
          context.clientInfo.capabilities?.tab?.some(
            (ee: any) => ee.id === authCapability.id,
          ) === true
        ))
      )
        throw unsupportedCapability(context.clientInfo.name, {
          type: authCommands.Handoff.commandType,
        });
      if (!validLocatorLayout(request)) return { status: "locator_invalid" };
      let pageBinding: any = await readPageBinding(
        request.tab_id,
        request.origin,
        context,
      );
      if (typeof pageBinding == "string") return { status: pageBinding };
      let origin: any = httpOrigin(pageBinding.securityOrigin);
      if (origin == null) return { status: "origin_changed" };
      let invisibleField: any = await firstInvisibleField(request, context);
      if (invisibleField != null)
        return {
          status: "locator_invalid",
          locator_error: {
            field_id: invisibleField,
            reason: "not_user_visible",
          },
        };
      let safetyPrecheck: any = createSafetyPrecheck(
          context.runtime,
          context.commandTiming,
          {
            browserBackend: context.clientInfo.type,
            elicitationDisplayName: context.elicitationDisplayName,
          },
        ),
        qrOnly: any = isQrOnly(request),
        inspection: any;
      if (qrOnly)
        if (safetyPrecheck == null) inspection = { validatedFields: [] };
        else {
          let ee: any = await readActionTargets(request, context);
          if (ee == null) return { status: "locator_invalid" };
          inspection = {
            validatedFields: [],
            safetyReview: {
              actionTargets: ee,
              createAutomatedSafetyPrecheck: safetyPrecheck,
            },
          };
        }
      else if (safetyPrecheck == null) {
        let ee: any = await inspectFields(request, context);
        if (ee == null || !(await validOptions(request, context)))
          return { status: "locator_invalid" };
        let fe: any = await readFormBinding(request, context);
        if (fe == null) return { status: "locator_invalid" };
        inspection = { validatedFields: ee, formBinding: fe };
      } else {
        if (hasNestedFrames(request)) return { status: "locator_invalid" };
        let ee: any = await inspectFields(request, context, true, true);
        if (ee == null) return { status: "locator_invalid" };
        let fe: any = readFormBinding(request, context);
        if (request.fields.length === 0 && (await fe) == null)
          return { status: "locator_invalid" };
        let [rt, Fe]: any = await Promise.all([
          fe,
          readActionTargets(request, context),
        ]);
        if (rt == null || Fe == null) return { status: "locator_invalid" };
        inspection = {
          validatedFields: ee,
          formBinding: rt,
          safetyReview: {
            createAutomatedSafetyPrecheck: safetyPrecheck,
            actionTargets: Fe,
          },
        };
      }
      let {
          validatedFields: validatedFields,
          formBinding: formBinding,
          safetyReview: safetyReview,
        }: any = inspection,
        optionBindings: any = await readOptionBindings(request, context);
      if (
        optionBindings == null ||
        safetyReview?.actionTargets.options.some(
          ({ id: ee, origin: fe }: any) =>
            optionBindings.get(ee)?.origin !== fe,
        ) === true
      )
        return { status: "locator_invalid" };
      let crossOriginFrame: any =
        formBinding == null || sameSite(pageBinding, formBinding)
          ? undefined
          : { origin: formBinding.origin };
      if (
        formBinding != null &&
        ((crossOriginFrame != null &&
          (!pageBinding.domainAndRegistry || !formBinding.domainAndRegistry)) ||
          !(await validIntermediateFrames(
            pageBinding,
            formBinding,
            request,
            context,
          )))
      )
        return { status: "locator_invalid" };
      let b: any = await revalidatePage(
        request.tab_id,
        request.origin,
        pageBinding,
        context,
      );
      if (b != null) return { status: b };
      let fieldPlan: any = createFieldPlan(validatedFields),
        otpSession: any =
          request.otpHandle == null
            ? undefined
            : metadataSession(turnMetadata(context.runtime));
      if (
        request.otpHandle != null &&
        (otpSession == null ||
          context.credentialObservationGate == null ||
          request.options != null ||
          request.qr_code === true ||
          formBinding?.origin !== origin ||
          !origin.startsWith("https://") ||
          fieldPlan.promptFields.length !== 1 ||
          !fieldPlan.promptFields[0]?.required ||
          validatedFields.some(({ type: ee }: any) => ee === "password"))
      )
        return { status: "unavailable" };
      let promptOptions: any = mapOptions(request.options, fieldPlan);
      if (promptOptions === null) return { status: "locator_invalid" };
      let checkpoint: any = new Checkpoint(
          request,
          context,
          pageBinding,
          formBinding,
          optionBindings,
          fieldPlan,
          safetyReview?.actionTargets,
        ),
        displayName: any = browserName({
          elicitationDisplayName: context.elicitationDisplayName,
        }),
        accountUsername: any =
          Object.hasOwn(
            context.runtime.env,
            "BROWSER_AUTH_BROKER_FIXED_ACCOUNT_VERSION",
          ) &&
          context.runtime.env.BROWSER_AUTH_BROKER_FIXED_ACCOUNT_VERSION ===
            "1" &&
          formBinding?.origin === origin &&
          origin.startsWith("https://")
            ? request.account_identifier
            : undefined,
        brokerPrompt: any = {
          connector_id: "browser-use",
          connector_name: displayName,
          ...(crossOriginFrame == null
            ? {}
            : { cross_origin_iframe: crossOriginFrame }),
          account_username: accountUsername,
          fields: fieldPlan.promptFields.map((ee: any) => ({
            ...ee,
            label_metadata: {
              accessible_name: ee.label_metadata.accessible_name,
              autocomplete: ee.label_metadata.autocomplete,
              input_type: ee.label_metadata.input_type,
              input_name: ee.label_metadata.input_name,
            },
          })),
          frame_origin: formBinding?.origin ?? origin,
          origin: origin,
          ...(request.qr_code === true ? { qr_code: true } : {}),
          reason: signInReason,
          ...(promptOptions == null
            ? {}
            : {
                options: promptOptions.map(
                  ({ id: ee, label: fe, field_ids: rt }: any) => ({
                    id: ee,
                    label: fe,
                    field_ids: rt ?? [],
                  }),
                ),
              }),
        },
        createElicitation: any = context.runtime.createElicitation;
      if (
        (safetyReview != null &&
          (createElicitation =
            currentReviewHost()?.createElicitation ?? createElicitation),
        typeof createElicitation != "function")
      )
        return { status: "unavailable" };
      let elicit: any =
          context.commandTiming.trackElicitation(createElicitation),
        screenshot: any;
      if (safetyReview != null) {
        let { actionTargets: ee, createAutomatedSafetyPrecheck: fe }: any =
            safetyReview,
          rt: any = formBinding?.frameId ?? pageBinding.frameId,
          { frame_origin: Fe, ...Ye }: any = brokerPrompt,
          be: any = await reviewSafety({
            actionTargets: ee,
            captureScreenshotAndValidateLocators: async () => {
              let [_e, ht]: any = await Promise.all([
                captureScreenshot(request, context),
                revalidateLocators(request, context),
              ]);
              return (
                (screenshot = _e),
                ht != null ? revalidateLocators(request, context) : null
              );
            },
            checkpoint: checkpoint,
            credentialFieldMetadata: fieldPlan.credentialFieldMetadata,
            credentialFrameId: rt,
            credentialFrameOrigin: Fe,
            createAutomatedSafetyPrecheck: fe,
            ctx: context,
            params: request,
            proposedUserPrompt: {
              message: signInReason,
              ...Ye,
              fields: Ye.fields.map((_e: any) => {
                let {
                  id: ht,
                  label: he,
                  type: Qe,
                  autocomplete: Xe,
                  required: Wr,
                }: any = _e;
                return {
                  id: ht,
                  label: he,
                  type: Qe,
                  autocomplete: Xe,
                  required: Wr,
                };
              }),
            },
          });
        if (be != null) return { status: be };
      } else screenshot = await captureScreenshot(request, context);
      let qrCode: any =
        request.qr_code === true && screenshot != null
          ? await decodeQr(screenshot.url, request, context)
          : undefined;
      if (request.qr_code === true && qrCode == null)
        return { status: "unavailable" };
      let qrUrl: any;
      if (qrCode != null) {
        let ee: any = parseUrl(qrCode.payload);
        ee != null &&
          ee.protocol === "https:" &&
          ee.hostname.length > 0 &&
          ee.username.length === 0 &&
          ee.password.length === 0 &&
          (qrUrl = qrCode.payload);
      }
      let challenge: any,
        optionFieldIds: any = new Set(
          (promptOptions ?? []).flatMap(({ field_ids: ee }: any) => ee ?? []),
        ),
        challengeFields: any = brokerPrompt.fields
          .filter(
            ({ id: ee }: any) =>
              promptOptions == null || optionFieldIds.has(ee),
          )
          .map(({ id: ee, required: fe }: any) => ({
            id: ee,
            required: promptOptions == null ? fe : false,
          })),
        getChallenge: any = context.runtime.gaas?.getBrowserAuthBrokerChallenge;
      if (getChallenge == null)
        throw new Error("Browser auth broker is unavailable");
      let bindingVersion: any =
          context.runtime.env.BROWSER_AUTH_BROKER_CREDENTIAL_BINDING_VERSION,
        credentialBinding: any =
          bindingVersion === "1" || bindingVersion === "2"
            ? await createCredentialBinding(
                request,
                validatedFields,
                origin,
                formBinding?.origin,
                context,
              )
            : undefined,
        saveBinding: any =
          (request.account_identifier == null ||
            (accountUsername != null && bindingVersion === "2")) &&
          Object.hasOwn(
            context.runtime.env,
            "BROWSER_AUTH_BROKER_MANUAL_SAVE_BINDING_VERSION",
          ) &&
          ["8", "10"].includes(
            context.runtime.env
              .BROWSER_AUTH_BROKER_MANUAL_SAVE_BINDING_VERSION ?? "",
          )
            ? await manualSavePreflight(
                request,
                validatedFields,
                challengeFields,
                accountUsername != null,
                origin,
                formBinding?.origin,
                context,
              )
            : undefined;
      bindingVersion === "2" &&
        saveBinding?.kind === "ordinary" &&
        allowsOrdinaryOption(
          request.options,
          validatedFields,
          saveBinding.fields.username,
          saveBinding.fields.password,
          context.runtime.env.BROWSER_AUTH_BROKER_CREDENTIAL_OPTIONS_VERSION,
        ) &&
        formBinding != null &&
        (credentialBinding = {
          fields:
            saveBinding.fields.username == null
              ? [{ id: saveBinding.fields.password, kind: "password" }]
              : [
                  { id: saveBinding.fields.username, kind: "username" },
                  { id: saveBinding.fields.password, kind: "password" },
                ],
          session_id: saveBinding.sessionId,
          submission_origin: formBinding.origin,
          submission: "ordinary",
        });
      try {
        challenge = await context.performanceSpan.withSpan(
          "browser_use.auth.broker",
          { "browser_use.auth.stage": "broker" },
          () =>
            getChallenge(
              challengeFields,
              promptOptions?.map(({ id: ee, field_ids: fe }: any) => ({
                id: ee,
                field_ids: fe ?? [],
              })),
              {
                qrCode: request.qr_code === true,
                origins: {
                  origin: brokerPrompt.origin,
                  frame_origin: brokerPrompt.frame_origin,
                },
                accountUsername: accountUsername,
                manualSaveFields: saveBinding?.fields,
                manualSaveSessionId: saveBinding?.sessionId,
                credentialBinding: credentialBinding,
                emailOtpSessionId: otpSession,
              },
            ),
        );
      } catch {
        return { status: "unavailable" };
      }
      let qrMonitor: any =
          qrCode != null && challenge.publishQrCodePayload != null
            ? startQrMonitor({
                ctx: context,
                initialQrCode: qrCode,
                pageBindingStatus: async () =>
                  await checkpoint.revalidateBeforeAction(),
                params: request,
                completeWhenQrCodeDisappears: qrOnly,
                publishPayload: (ee: any, fe: any) =>
                  challenge.publishQrCodePayload?.(ee, fe),
              })
            : undefined,
        finalStatus: any = null,
        selectedOption: any,
        diagnostics: any,
        submissionTask: any = (async () => {
          let lease: any;
          try {
            let delivery: any = await challenge.waitForSubmission();
            if ("status" in delivery)
              return ((finalStatus = delivery.status), delivery.status);
            let emailGate: any =
              delivery.email_otp_delivery === true
                ? context.credentialObservationGate
                : undefined;
            if (
              delivery.email_otp_delivery === true &&
              (otpSession == null || emailGate == null)
            )
              throw new Error("Email OTP delivery is unavailable");
            checkpoint.nativeDelivery =
              delivery.native_credential_delivery === true;
            let ordinaryDelivery: any =
                delivery.ordinary_credential_delivery === true,
              manualSave: any = delivery.manual_credential_save === true;
            if (manualSave && (saveBinding == null || formBinding == null))
              throw new Error("Manual credential saving is unavailable");
            if (
              (ordinaryDelivery &&
                (manualSave ||
                  checkpoint.nativeDelivery ||
                  credentialBinding?.submission !== "ordinary" ||
                  saveBinding?.kind !== "ordinary")) ||
              (checkpoint.nativeDelivery &&
                credentialBinding?.submission === "ordinary")
            )
              throw new Error("Credential delivery mode is unavailable");
            let protectedSubmission: any = manualSave || ordinaryDelivery,
              validPredecessor: any =
                (protectedSubmission ||
                  checkpoint.nativeDelivery ||
                  emailGate != null) &&
                validObservationPredecessor(
                  challenge.id,
                  delivery.native_observation_predecessor,
                ),
              privateProtection: any;
            emailGate != null &&
              ((privateProtection = await emailGate.protect(
                Number(request.tab_id),
                context.finishNativeCredentialModelCommand,
              )),
              context.cdp.protectBrowserAuthCredentialDiagnostics(
                Number(request.tab_id),
              ));
            let privateBinding: any =
              saveBinding?.kind === "private" ? saveBinding : undefined;
            if (
              ((checkpoint.manualCredentialSave =
                manualSave && privateBinding != null),
              (checkpoint.nativeDelivery ||
                (protectedSubmission && saveBinding?.kind === "ordinary")) &&
                (checkpoint.credentialSubmissionFields = validatedFields),
              protectedSubmission &&
                (saveBinding == null ||
                  formBinding == null ||
                  context.credentialObservationGate == null))
            )
              throw new Error(
                "Credential submission protection is unavailable",
              );
            let tabId: any = Number(request.tab_id),
              ordinaryProtection: any;
            if (protectedSubmission) {
              checkpoint.manualSubmission = privateBinding?.submission;
              let it: any =
                await context.credentialObservationGate.protectManualSaving(
                  tabId,
                  context.finishNativeCredentialModelCommand,
                  privateBinding == null ? "ordinary" : "private",
                );
              saveBinding?.kind === "ordinary"
                ? ((ordinaryProtection = it),
                  (checkpoint.ordinaryCredentialFields = saveBinding.fields))
                : ((privateProtection = it),
                  context.cdp.protectBrowserAuthCredentialDiagnostics(tabId));
            }
            if (
              ((lease =
                protectedSubmission &&
                saveBinding != null &&
                formBinding != null
                  ? await startCredentialLease({
                      cdp: context.cdp,
                      requests: context.documentResponses,
                      tabId: tabId,
                      frameId:
                        privateBinding == null
                          ? pageBinding.frameId
                          : formBinding.frameId,
                      ...(privateBinding == null
                        ? {
                            ordinary: {
                              origin: formBinding.origin,
                              password:
                                delivery.fields[saveBinding.fields.password],
                            },
                          }
                        : {
                            target: privateBinding.target,
                            credentialFields: [
                              {
                                name: privateBinding.names.username,
                                value:
                                  delivery.fields[
                                    privateBinding.fields.username
                                  ],
                              },
                              {
                                name: privateBinding.names.password,
                                value:
                                  delivery.fields[
                                    privateBinding.fields.password
                                  ],
                              },
                            ],
                          }),
                    })
                  : undefined),
              lease != null &&
                ((checkpoint.manualSavingRejection =
                  lease.currentRejection.bind(lease)),
                ordinaryProtection != null &&
                  ((checkpoint.ordinaryAttempt = lease),
                  lease.recordAttempt({ kind: "prompt_completed" }))),
              !protectedSubmission &&
                !checkpoint.nativeDelivery &&
                (await closeCredentialLease(context.documentResponses, tabId)),
              checkpoint.nativeDelivery)
            ) {
              if (
                credentialBinding == null ||
                context.credentialObservationGate == null
              )
                throw new Error(
                  "Native credential observation protection is unavailable",
                );
              privateProtection =
                await context.credentialObservationGate.protect(
                  tabId,
                  context.finishNativeCredentialModelCommand,
                );
            }
            let fillAndSubmit: any = context.performanceSpan.withSpan(
                "browser_use.auth.fill_and_submit",
                {
                  "browser_use.auth.submission.request_id":
                    lease?.diagnostics().request_id,
                },
                () =>
                  submitValues(
                    delivery.fields,
                    delivery.selected_option,
                    promptOptions,
                    checkpoint,
                    challengeFields,
                  ),
                {
                  resultAttrs: (it: any) => ({
                    "browser_use.auth.outcome": it,
                  }),
                },
              ),
              outcome: any,
              submitted: any = false;
            try {
              ((outcome =
                lease == null || privateBinding == null
                  ? await fillAndSubmit
                  : await Promise.race([fillAndSubmit, lease.whenRejected()])),
                outcome === "submitted" &&
                  lease != null &&
                  (outcome =
                    privateBinding == null
                      ? await lease.ordinaryResult()
                      : await lease.result(request.timeout_ms ?? 5e3)),
                (submitted = outcome === "submitted"));
            } finally {
              (ordinaryProtection != null &&
                (await Promise.allSettled([fillAndSubmit])),
                privateBinding == null &&
                  (await lease?.waitForOrdinaryDocumentCleanup()),
                ordinaryProtection != null &&
                  (context.credentialObservationGate.allowOrdinaryInteraction(
                    tabId,
                    ordinaryProtection,
                    submitted && validPredecessor,
                  ),
                  lease?.settleOrdinarySubmission()),
                (diagnostics = lease?.diagnostics()));
            }
            if (
              (outcome === "submitted" &&
                promptOptions != null &&
                (selectedOption = delivery.selected_option),
              (finalStatus = outcome),
              outcome === "submitted" && privateProtection != null)
            ) {
              await lease?.close();
              let it: any =
                emailGate != null
                  ? otpSession
                  : checkpoint.nativeDelivery
                    ? credentialBinding?.session_id
                    : saveBinding?.sessionId;
              it != null &&
                it === metadataSession(turnMetadata(context.runtime)) &&
                context.credentialObservationGate.allowPrivateInteraction(
                  tabId,
                  origin,
                  privateProtection,
                );
            }
            if (
              protectedSubmission &&
              (outcome === "origin_changed" ||
                (outcome === "submission_failed" &&
                  diagnostics?.terminal_rejection != null))
            ) {
              let it: any = diagnostics?.first_rejection,
                xn: any = diagnostics?.terminal_rejection;
              Promise.resolve()
                .then(() => (initializeTelemetry(), telemetry))
                .then(({ logStatsigEvent: logEvent }: any) =>
                  logEvent(
                    context.runtime,
                    outcome === "origin_changed"
                      ? "browser_auth_submission_rejected"
                      : "browser_auth_submission_failed",
                    xn?.reason ?? it?.reason ?? "unattributed",
                    {
                      submission_mode:
                        privateBinding == null ? "ordinary" : "private",
                      request_id: diagnostics?.request_id ?? "unattributed",
                      first_outcome: it?.outcome ?? "none",
                      first_reason: it?.reason ?? "none",
                      first_request_class: it?.request_class ?? "none",
                      first_submission_phase: it?.submission_phase ?? "none",
                      terminal_outcome: xn?.outcome ?? "none",
                      terminal_reason: xn?.reason ?? "none",
                      terminal_request_class: xn?.request_class ?? "none",
                      terminal_submission_phase: xn?.submission_phase ?? "none",
                    },
                    context.clientInfo,
                  ),
                )
                .catch(() => {});
            }
            return await challenge.complete(
              outcome,
              fieldPlan.promptFields.some(
                (it: any) =>
                  it.type === "password" &&
                  ![it.autocomplete, it.label_metadata.autocomplete].some(
                    (xn: any) =>
                      xn?.toLowerCase().split(/\s+/).includes("one-time-code"),
                  ) &&
                  Object.hasOwn(delivery.fields, it.id),
              ),
            );
          } catch {
            return (
              (diagnostics = lease?.diagnostics()),
              (finalStatus ??= "unavailable"),
              await completeChallenge(challenge, finalStatus)
            );
          } finally {
            if (checkpoint.ordinaryAttempt != null) {
              (checkpoint.ordinaryAttempt.completeOrdinaryAttempt(
                finalStatus === "submitted" ||
                  finalStatus === "origin_changed" ||
                  finalStatus === "page_changed" ||
                  finalStatus === "locator_invalid" ||
                  finalStatus === "submission_failed"
                  ? finalStatus
                  : "unavailable",
              ),
                (diagnostics = checkpoint.ordinaryAttempt.diagnostics()));
              let attemptDiagnostics: any = diagnostics;
              Promise.resolve()
                .then(() => (initializeTelemetry(), telemetry))
                .then(({ logStatsigEvent: logEvent }: any) => {
                  for (let attemptEvent of attemptDiagnostics.attempt_events ??
                    [])
                    logEvent(
                      context.runtime,
                      "browser_auth_attempt",
                      attemptEvent.kind,
                      {
                        request_id: attemptDiagnostics.request_id,
                        submission_mode: attemptDiagnostics.submission_mode,
                        sequence: String(attemptEvent.sequence),
                        phase: attemptEvent.phase,
                        field_index: String(attemptEvent.field_index ?? "none"),
                        reinspection: String(
                          attemptEvent.reinspection ?? "none",
                        ),
                        outcome: attemptEvent.outcome ?? "none",
                        request_class: attemptEvent.request_class ?? "none",
                        method: attemptEvent.method ?? "none",
                        origin_relation: attemptEvent.origin_relation ?? "none",
                        dropped_attempt_events: String(
                          attemptDiagnostics.dropped_attempt_events ?? 0,
                        ),
                      },
                      context.clientInfo,
                    );
                })
                .catch(() => {});
            }
          }
        })(),
        elicitationResult: any;
      try {
        if (request.otpHandle != null) {
          let ee: any = false;
          try {
            ee = await context.preferences.isEmailOtpAlwaysAllowed();
          } catch {}
          let fe: any;
          try {
            if (ee) {
              let Fe: any = await backendFetch(
                  context.runtime,
                  `${backendApiUrl(context.runtime)}/flora/browser/redeem-otp`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      conversation_id: otpSession,
                      challenge_id: challenge.id,
                      otp_handle: request.otpHandle,
                      origin: origin,
                    }),
                  },
                ),
                Ye: any = Fe.ok || Fe.status === 403 ? await Fe.json() : null;
              Fe.status === 403 &&
              Ye != null &&
              typeof Ye == "object" &&
              "detail" in Ye &&
              Ye.detail === "email_otp_approval_required"
                ? (ee = false)
                : Fe.ok &&
                  Ye != null &&
                  typeof Ye == "object" &&
                  "status" in Ye &&
                  typeof Ye.status == "string" &&
                  (fe = {
                    action: "accept",
                    content: { approved: true, email_otp_status: Ye.status },
                  });
            }
            ee ||
              (fe = await elicit({
                message: `Allow ChatGPT to fill this verification code? A verification code from your connected email will be sent privately to ${origin}. ChatGPT cannot see the code. You can also enter it yourself.`,
                requestedSchema: {
                  type: "object",
                  properties: { approved: { type: "boolean" } },
                  required: ["approved"],
                  additionalProperties: true,
                },
                meta: {
                  codex_approval_kind: "browser_email_otp",
                  persist: "always",
                  codex_requires_user_input: true,
                  codex_guardian_compatible: false,
                  connector_id: "browser-use",
                  connector_name: displayName,
                  browser_auth_challenge_id: challenge.id,
                  otp_handle: request.otpHandle,
                  origin: origin,
                  frame_origin: origin,
                },
              }));
          } catch {}
          if (challenge.hasSubmission) {
            let Fe: any = await submissionTask;
            return (challenge.close(), { status: Fe });
          }
          let rt: any =
            fe?.content != null &&
            typeof fe.content == "object" &&
            !Array.isArray(fe.content)
              ? fe.content
              : undefined;
          if (
            fe?.action !== "decline" &&
            !(
              fe?.action === "accept" &&
              rt?.approved === true &&
              rt.email_otp_status === "unavailable" &&
              rt.retire_challenge === undefined
            )
          ) {
            let Fe: any = await completeChallenge(
              challenge,
              fe?.action === "cancel" ? "cancelled" : "unavailable",
            );
            return (await submissionTask, challenge.close(), { status: Fe });
          }
          if (fe?.action === "accept")
            throw new Error("Email OTP autofill failed.");
        }
        elicitationResult = await elicit({
          message: signInReason,
          requestedSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          meta: {
            codex_approval_kind: "browser_auth",
            codex_requires_user_input: true,
            codex_guardian_compatible: false,
            browser_auth_challenge_id: challenge.id,
            ...brokerPrompt,
            ...(qrCode == null
              ? {}
              : { qr_code_payload: qrCode.payload, qr_code_only: qrOnly }),
            ...(qrUrl == null ? {} : { qr_code_url: qrUrl }),
            ...(screenshot == null ? {} : { screenshot: screenshot }),
          },
        });
      } catch (ee: any) {
        if (
          ((finalStatus = await completeChallenge(challenge, "unavailable")),
          await submissionTask,
          qrMonitor?.stop(),
          challenge.close(),
          isElicitationUnavailable(ee))
        )
          return { status: "unavailable" };
        throw ee;
      }
      if (finalStatus == null && challenge.hasSubmission)
        finalStatus = await submissionTask;
      else if (finalStatus == null) {
        let ee: any =
          elicitationResult.action === "decline"
            ? "declined"
            : elicitationResult.action === "cancel"
              ? "cancelled"
              : "unavailable";
        finalStatus = await completeChallenge(challenge, ee);
      }
      if (
        (await submissionTask,
        qrMonitor?.stop(),
        challenge.close(),
        elicitationResult.action === "decline" &&
          finalStatus === "declined" &&
          elicitationResult._meta?.["openai/client_unsupported"] === true)
      )
        throw new Error(
          "This ChatGPT client does not support secure browser authentication. Tell the user to update the ChatGPT app to the latest version before trying again.",
        );
      if (
        elicitationResult.action === "decline" &&
        finalStatus === "declined" &&
        elicitationResult._meta?.["openai/client_is_mobile"] === true &&
        qrOnly
      )
        throw qrUrl != null
          ? new Error(`This ChatGPT mobile client requires a QR-code sign-in link. Show the user this secure HTTPS sign-in URL exactly: ${new URL(qrUrl).href}
Ask the user to open the link, complete sign-in, and report back when done. Do not say that the user declined or dismissed the request.`)
          : new Error(
              "This QR-code sign-in flow probably cannot be completed on a mobile device. Explain that the website requires a QR code the mobile app cannot use.",
            );
      let Ze: any = elicitationResult._meta?.[userTakeoverKey] === true;
      return elicitationResult.action === "decline" &&
        finalStatus === "declined" &&
        Ze
        ? { status: "declined", reason: "user_took_over" }
        : {
            status: finalStatus,
            ...(selectedOption == null
              ? {}
              : { selected_option: selectedOption }),
            submission_diagnostics:
              finalStatus === "submitted" ? undefined : diagnostics,
          };
    },
  );
}
