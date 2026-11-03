import {
  codexTurnMetadata,
  metadataSession,
} from "../preferences/request_context";
import { classifyAuthCredentialFields } from "./credential_fields";
import { allowsOrdinaryCredentialOption } from "./field_plan";
import { authSubmissionOrigin } from "./action_review";
import { inspectAuthFields } from "./field_inspection";
import { readAuthSubmissionOrigin } from "./submission_origin";
import { isCredentialDocumentContained } from "../credentials/containment";
import { nativeAuthSubmit } from "./native_submit";

/** Original Zee. Bind broker credential IDs to an inspected HTTPS form and session. */
export async function createAuthCredentialBinding(
  request: any,
  fields: any[],
  origin: string,
  frameOrigin: string | undefined,
  context: any,
) {
  const session = metadataSession(codexTurnMetadata(context.runtime));
  if (
    !session ||
    session.length > 256 ||
    request.qr_code === true ||
    frameOrigin == null ||
    origin !== frameOrigin ||
    new URL(origin).protocol !== "https:"
  )
    return;
  const classified = classifyAuthCredentialFields(
    fields,
    false,
    request.options,
  );
  const username = classified?.username,
    password = classified?.password;
  if (
    username == null ||
    password == null ||
    !allowsOrdinaryCredentialOption(
      request.options,
      fields,
      username.id,
      password.id,
      context.runtime.env.BROWSER_AUTH_BROKER_CREDENTIAL_OPTIONS_VERSION,
    )
  )
    return;
  const submissionOrigin = await authSubmissionOrigin(request, context, true);
  if (submissionOrigin === frameOrigin)
    return {
      fields: [
        { id: username.id, kind: "username" },
        { id: password.id, kind: "password" },
      ],
      session_id: session,
      submission_origin: submissionOrigin,
    };
}
export interface AuthPreflightTelemetry {
  logStatsigEvent(...args: any[]): any;
}
/** Original Jee. Lazy telemetry is required; rejection reporting never blocks preflight. */
export function createManualSavePreflight(
  loadTelemetry: () => AuthPreflightTelemetry | Promise<AuthPreflightTelemetry>,
) {
  return async function manualSavePreflight(
    request: any,
    fields: any[],
    challengeFields: any[],
    fixedAccount: boolean,
    origin: string,
    frameOrigin: string | undefined,
    context: any,
  ) {
    const ordinary =
      context.runtime.env.BROWSER_AUTH_BROKER_MANUAL_SAVE_BINDING_VERSION ===
      "10";
    const report = (reason: string) => {
      Promise.resolve()
        .then(loadTelemetry)
        .then(({ logStatsigEvent }) =>
          logStatsigEvent(
            context.runtime,
            "browser_auth_save_preflight",
            reason,
            { submission_mode: ordinary ? "ordinary" : "private" },
            context.clientInfo,
          ),
        )
        .catch(() => {});
    };
    const session = metadataSession(codexTurnMetadata(context.runtime));
    if (!session || session.length > 256) return report("session");
    if (!ordinary && fields.length !== 2) return report("field_count");
    if (!ordinary && fields.some(({ required }) => !required))
      return report("optional_fields");
    if (!ordinary && challengeFields.length !== 2)
      return report("challenge_field_count");
    if (!ordinary && challengeFields.some(({ required }) => !required))
      return report("optional_challenge_fields");
    if (!ordinary && request.options != null) return report("options");
    if (request.submit == null) return report("submit_missing");
    if (request.qr_code === true) return report("qr_code");
    if (
      frameOrigin == null ||
      origin !== frameOrigin ||
      new URL(origin).protocol !== "https:"
    )
      return report("origin");
    const passwordOnly =
      ordinary &&
      (fixedAccount ||
        context.runtime.env.BROWSER_AUTH_BROKER_PASSWORD_ONLY_VERSION === "1");
    const classified = classifyAuthCredentialFields(
      fields,
      passwordOnly,
      request.options,
    );
    const username = classified?.username,
      password = classified?.password;
    if (username == null && !passwordOnly) return report("username_field");
    if (password == null) return report("password_field");
    if (
      username == null &&
      (fields.length !== 1 ||
        challengeFields.length !== 1 ||
        request.options != null)
    )
      return report("field_count");
    if (
      (username != null &&
        (username.id === password.id ||
          !challengeFields.some(({ id }) => id === username.id))) ||
      !challengeFields.some(({ id }) => id === password.id)
    )
      return report("field_mapping");
    if (
      request.options != null &&
      !request.options.some(
        ({ field_ids }: any) =>
          (username == null || field_ids?.includes(username.id)) &&
          field_ids?.includes(password.id),
      )
    )
      return report("options");
    if (ordinary) {
      const inspected = await inspectAuthFields(request, context, true);
      if (inspected == null) return report("field_reinspection");
      const refreshed = classifyAuthCredentialFields(
        inspected,
        passwordOnly,
        request.options,
      );
      if (
        refreshed?.username?.id !== username?.id ||
        refreshed?.password.id !== password.id
      )
        return report("field_metadata_changed");
      if (
        await isCredentialDocumentContained(
          context.cdp,
          Number(request.tab_id),
          origin,
          report,
          true,
        )
      ) {
        report("fields_available");
        return {
          kind: "ordinary",
          fields: { username: username?.id, password: password.id },
          sessionId: session,
        };
      }
      return;
    }
    if (username == null) return report("username_field");
    const usernameName = username.labelMetadata.input_name,
      passwordName = password.labelMetadata.input_name;
    if (
      !usernameName ||
      !passwordName ||
      usernameName === passwordName ||
      usernameName.length > 256 ||
      passwordName.length > 256
    )
      return report("private_field_names");
    const target = await readAuthSubmissionOrigin(request, context, true);
    if (target == null || target.origin !== frameOrigin)
      return report("private_target");
    if (
      !(await isCredentialDocumentContained(
        context.cdp,
        Number(request.tab_id),
        target.origin,
        report,
      ))
    )
      return;
    const submission = {
      username: { selector: username.selector, name: usernameName },
      password: { selector: password.selector, name: passwordName },
      submit: request.submit,
      target,
    };
    try {
      if (
        !(await context.playwright.evaluateOnPlaywrightSelector(
          request.tab_id,
          username.selector,
          nativeAuthSubmit,
          {
            arg: submission,
            isolatedWorld: true,
            timeoutMs: request.timeout_ms,
          },
        ))
      )
        return report("private_submission");
    } catch {
      return report("private_submission");
    }
    report("fields_available");
    return {
      kind: "private",
      fields: { username: username.id, password: password.id },
      target,
      names: { username: usernameName, password: passwordName },
      sessionId: session,
      submission,
    };
  };
}
