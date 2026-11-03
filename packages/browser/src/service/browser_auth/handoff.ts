import { defineCommand } from "../commands/define_command";
import { TabBrowserAuthCommands as authCommands } from "../../commands/browser_auth";
const signInReason = "Sign in to continue";
const userTakeoverKey = "openai/user_took_over";
/** Original rN. Full control flow; assembly dependencies are explicit until host wiring is completed. */
export interface BrowserAuthHandoffDependencies {
  closeCredentialLease: any;
  revalidatePage: any;
  reviewSafety: any;
  manualSavePreflight: any;
  readPageBinding: any;
  parseUrl: any;
  turnMetadata: any;
  authCapability: any;
  validOptions: any;
  revalidateLocators: any;
  validIntermediateFrames: any;
  hasNestedFrames: any;
  readFormBinding: any;
  backendApiUrl: any;
  validObservationPredecessor: any;
  isQrOnly: any;
  completeChallenge: any;
  startCredentialLease: any;
  startQrMonitor: any;
  captureScreenshot: any;
  createCredentialBinding: any;
  createFieldPlan: any;
  unsupportedCapability: any;
  currentReviewHost: any;
  readActionTargets: any;
  createSafetyPrecheck: any;
  isElicitationUnavailable: any;
  readOptionBindings: any;
  backendFetch: any;
  allowsOrdinaryOption: any;
  browserName: any;
  firstInvisibleField: any;
  validLocatorLayout: any;
  mapOptions: any;
  submitValues: any;
  sameSite: any;
  decodeQr: any;
  metadataSession: any;
  Checkpoint: any;
  inspectFields: any;
  httpOrigin: any;
  initializeTelemetry: any;
  telemetry: any;
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
          let ee: any;
          try {
            let fe: any = await challenge.waitForSubmission();
            if ("status" in fe) return ((finalStatus = fe.status), fe.status);
            let rt: any =
              fe.email_otp_delivery === true
                ? context.credentialObservationGate
                : undefined;
            if (
              fe.email_otp_delivery === true &&
              (otpSession == null || rt == null)
            )
              throw new Error("Email OTP delivery is unavailable");
            checkpoint.nativeDelivery = fe.native_credential_delivery === true;
            let Fe: any = fe.ordinary_credential_delivery === true,
              Ye: any = fe.manual_credential_save === true;
            if (Ye && (saveBinding == null || formBinding == null))
              throw new Error("Manual credential saving is unavailable");
            if (
              (Fe &&
                (Ye ||
                  checkpoint.nativeDelivery ||
                  credentialBinding?.submission !== "ordinary" ||
                  saveBinding?.kind !== "ordinary")) ||
              (checkpoint.nativeDelivery &&
                credentialBinding?.submission === "ordinary")
            )
              throw new Error("Credential delivery mode is unavailable");
            let be: any = Ye || Fe,
              _e: any =
                (be || checkpoint.nativeDelivery || rt != null) &&
                validObservationPredecessor(
                  challenge.id,
                  fe.native_observation_predecessor,
                ),
              ht: any;
            rt != null &&
              ((ht = await rt.protect(
                Number(request.tab_id),
                context.finishNativeCredentialModelCommand,
              )),
              context.cdp.protectBrowserAuthCredentialDiagnostics(
                Number(request.tab_id),
              ));
            let he: any =
              saveBinding?.kind === "private" ? saveBinding : undefined;
            if (
              ((checkpoint.manualCredentialSave = Ye && he != null),
              (checkpoint.nativeDelivery ||
                (be && saveBinding?.kind === "ordinary")) &&
                (checkpoint.credentialSubmissionFields = validatedFields),
              be &&
                (saveBinding == null ||
                  formBinding == null ||
                  context.credentialObservationGate == null))
            )
              throw new Error(
                "Credential submission protection is unavailable",
              );
            let Qe: any = Number(request.tab_id),
              Xe: any;
            if (be) {
              checkpoint.manualSubmission = he?.submission;
              let it: any =
                await context.credentialObservationGate.protectManualSaving(
                  Qe,
                  context.finishNativeCredentialModelCommand,
                  he == null ? "ordinary" : "private",
                );
              saveBinding?.kind === "ordinary"
                ? ((Xe = it),
                  (checkpoint.ordinaryCredentialFields = saveBinding.fields))
                : ((ht = it),
                  context.cdp.protectBrowserAuthCredentialDiagnostics(Qe));
            }
            if (
              ((ee =
                be && saveBinding != null && formBinding != null
                  ? await startCredentialLease({
                      cdp: context.cdp,
                      requests: context.documentResponses,
                      tabId: Qe,
                      frameId:
                        he == null ? pageBinding.frameId : formBinding.frameId,
                      ...(he == null
                        ? {
                            ordinary: {
                              origin: formBinding.origin,
                              password: fe.fields[saveBinding.fields.password],
                            },
                          }
                        : {
                            target: he.target,
                            credentialFields: [
                              {
                                name: he.names.username,
                                value: fe.fields[he.fields.username],
                              },
                              {
                                name: he.names.password,
                                value: fe.fields[he.fields.password],
                              },
                            ],
                          }),
                    })
                  : undefined),
              ee != null &&
                ((checkpoint.manualSavingRejection =
                  ee.currentRejection.bind(ee)),
                Xe != null &&
                  ((checkpoint.ordinaryAttempt = ee),
                  ee.recordAttempt({ kind: "prompt_completed" }))),
              !be &&
                !checkpoint.nativeDelivery &&
                (await closeCredentialLease(context.documentResponses, Qe)),
              checkpoint.nativeDelivery)
            ) {
              if (
                credentialBinding == null ||
                context.credentialObservationGate == null
              )
                throw new Error(
                  "Native credential observation protection is unavailable",
                );
              ht = await context.credentialObservationGate.protect(
                Qe,
                context.finishNativeCredentialModelCommand,
              );
            }
            let Wr: any = context.performanceSpan.withSpan(
                "browser_use.auth.fill_and_submit",
                {
                  "browser_use.auth.submission.request_id":
                    ee?.diagnostics().request_id,
                },
                () =>
                  submitValues(
                    fe.fields,
                    fe.selected_option,
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
              Nt: any,
              ri: any = false;
            try {
              ((Nt =
                ee == null || he == null
                  ? await Wr
                  : await Promise.race([Wr, ee.whenRejected()])),
                Nt === "submitted" &&
                  ee != null &&
                  (Nt =
                    he == null
                      ? await ee.ordinaryResult()
                      : await ee.result(request.timeout_ms ?? 5e3)),
                (ri = Nt === "submitted"));
            } finally {
              (Xe != null && (await Promise.allSettled([Wr])),
                he == null && (await ee?.waitForOrdinaryDocumentCleanup()),
                Xe != null &&
                  (context.credentialObservationGate.allowOrdinaryInteraction(
                    Qe,
                    Xe,
                    ri && _e,
                  ),
                  ee?.settleOrdinarySubmission()),
                (diagnostics = ee?.diagnostics()));
            }
            if (
              (Nt === "submitted" &&
                promptOptions != null &&
                (selectedOption = fe.selected_option),
              (finalStatus = Nt),
              Nt === "submitted" && ht != null)
            ) {
              await ee?.close();
              let it: any =
                rt != null
                  ? otpSession
                  : checkpoint.nativeDelivery
                    ? credentialBinding?.session_id
                    : saveBinding?.sessionId;
              it != null &&
                it === metadataSession(turnMetadata(context.runtime)) &&
                context.credentialObservationGate.allowPrivateInteraction(
                  Qe,
                  origin,
                  ht,
                );
            }
            if (
              be &&
              (Nt === "origin_changed" ||
                (Nt === "submission_failed" &&
                  diagnostics?.terminal_rejection != null))
            ) {
              let it: any = diagnostics?.first_rejection,
                xn: any = diagnostics?.terminal_rejection;
              Promise.resolve()
                .then(() => (initializeTelemetry(), telemetry))
                .then(({ logStatsigEvent: sy }: any) =>
                  sy(
                    context.runtime,
                    Nt === "origin_changed"
                      ? "browser_auth_submission_rejected"
                      : "browser_auth_submission_failed",
                    xn?.reason ?? it?.reason ?? "unattributed",
                    {
                      submission_mode: he == null ? "ordinary" : "private",
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
              Nt,
              fieldPlan.promptFields.some(
                (it: any) =>
                  it.type === "password" &&
                  ![it.autocomplete, it.label_metadata.autocomplete].some(
                    (xn: any) =>
                      xn?.toLowerCase().split(/\s+/).includes("one-time-code"),
                  ) &&
                  Object.hasOwn(fe.fields, it.id),
              ),
            );
          } catch {
            return (
              (diagnostics = ee?.diagnostics()),
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
              let fe: any = diagnostics;
              Promise.resolve()
                .then(() => (initializeTelemetry(), telemetry))
                .then(({ logStatsigEvent: rt }: any) => {
                  for (let Fe of fe.attempt_events ?? [])
                    rt(
                      context.runtime,
                      "browser_auth_attempt",
                      Fe.kind,
                      {
                        request_id: fe.request_id,
                        submission_mode: fe.submission_mode,
                        sequence: String(Fe.sequence),
                        phase: Fe.phase,
                        field_index: String(Fe.field_index ?? "none"),
                        reinspection: String(Fe.reinspection ?? "none"),
                        outcome: Fe.outcome ?? "none",
                        request_class: Fe.request_class ?? "none",
                        method: Fe.method ?? "none",
                        origin_relation: Fe.origin_relation ?? "none",
                        dropped_attempt_events: String(
                          fe.dropped_attempt_events ?? 0,
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
