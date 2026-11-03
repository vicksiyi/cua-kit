import { nativeAuthSubmit } from "./native_submit";
import {
  validateAuthValues,
  findAuthOption,
  validAuthOptionValues,
  isQrOnlyAuth,
  otpPromptId,
} from "./field_plan";
import { authFieldDelivery } from "./field_delivery";
import { waitForAuthSubmission } from "./submission_status";
import { pressLocator } from "../commands/locator_press";

export interface AuthSubmissionDependencies {
  /** Original J_, defaulting to the restored self-contained page callback. */
  nativeSubmit?: (element: any, injected: any, arg: any) => any;
  deliverFields?: typeof authFieldDelivery.fillPlan;
  waitForSubmission?: typeof waitForAuthSubmission;
  press?: typeof pressLocator;
}
/** Original ute. Preserve validation/retry boundaries and avoid retry after a submit action starts. */
export function createAuthSubmission(
  supplied: AuthSubmissionDependencies = {},
) {
  const {
    nativeSubmit = nativeAuthSubmit,
    deliverFields = authFieldDelivery.fillPlan,
    waitForSubmission = waitForAuthSubmission,
    press = pressLocator,
  } = supplied;
  return async function submitAuthValues(
    values: any,
    optionId: any,
    promptOptions: any,
    checkpoint: any,
    promptFields: any,
  ) {
    const { credentialPlan, params, ctx: context } = checkpoint;
    const validated = validateAuthValues(values, promptFields);
    if (validated == null) return "submission_failed";
    const option = findAuthOption(optionId, params.options);
    const promptOption = findAuthOption(optionId, promptOptions);
    if (
      (promptOptions != null && (option == null || promptOption == null)) ||
      (promptOption != null &&
        !validAuthOptionValues(validated, promptOption, credentialPlan))
    )
      return "submission_failed";
    if (isQrOnlyAuth(params)) return "submitted";
    try {
      let status = await checkpoint.revalidateReviewedPresentation(
        option,
        promptOption,
      );
      while (status != null && (await checkpoint.reinspectOrdinary(status)))
        status = await checkpoint.revalidateReviewedPresentation(
          option,
          promptOption,
        );
      if (status != null) return status;
      if (checkpoint.manualCredentialSave) {
        const submission = checkpoint.manualSubmission;
        if (submission == null || params.submit == null)
          return "submission_failed";
        const usernameField = params.fields.find(
          (field: any) => field.selector === submission.username.selector,
        );
        const passwordField = params.fields.find(
          (field: any) => field.selector === submission.password.selector,
        );
        const username =
          usernameField == null ? undefined : validated[usernameField.id];
        const password =
          passwordField == null ? undefined : validated[passwordField.id];
        if (username == null || password == null) return "submission_failed";
        let outcome: any = null;
        await context.playwright.withBoundPlaywrightSelector(
          params.tab_id,
          submission.username.selector,
          async () => {
            outcome = await checkpoint.revalidateBeforeSubmit();
            return outcome == null;
          },
          async (bound: any) => {
            if (
              !(await bound.evaluateOnPlaywrightSelector(
                params.tab_id,
                submission.username.selector,
                nativeSubmit,
                {
                  arg: { ...submission, values: { username, password } },
                  isolatedWorld: true,
                  timeoutMs: params.timeout_ms,
                },
              ))
            )
              outcome = "submission_failed";
          },
          { isolatedWorld: true, timeoutMs: params.timeout_ms },
        );
        return outcome ?? "submitted";
      }
      if (option?.selector != null && (option.field_ids?.length ?? 0) === 0) {
        const selector = option.selector;
        let outcome: any = null;
        await context.playwright.withBoundPlaywrightSelector(
          params.tab_id,
          selector,
          async () => {
            outcome = await checkpoint.revalidateBeforeAction(option);
            return outcome == null;
          },
          async (bound: any) => {
            await bound.clickLocator(
              {
                tab_id: params.tab_id,
                selector,
                timeout_ms: params.timeout_ms,
              },
              1,
            );
          },
          { timeoutMs: params.timeout_ms },
        );
        return outcome ?? "submitted";
      }
      const delivery = await deliverFields(validated, checkpoint, option);
      if (delivery != null) return delivery;
      const submit = params.submit;
      if (submit == null) return "submitted";
      const locator = {
        browser_id: params.browser_id,
        tab_id: params.tab_id,
        selector: submit.selector,
        timeout_ms: params.timeout_ms,
      };
      const [firstFill] = credentialPlan.fillFields;
      if (
        firstFill?.promptId === otpPromptId &&
        firstFill.fields.length > 1 &&
        validated[otpPromptId] != null
      ) {
        const observed = await waitForSubmission(
          locator,
          params.origin,
          context,
          submit.action === "press_enter",
        );
        if (observed != null) return observed;
      }
      for (;;) {
        if (
          await checkpoint.ordinaryAttempt?.verifiedOrdinarySiteSubmission(
            params.timeout_ms ?? 5000,
          )
        )
          return "submitted";
        let outcome: any = null;
        let actionStarted = false;
        try {
          if (submit.action === "click")
            await context.playwright.evaluateOnPlaywrightSelector(
              params.tab_id,
              submit.selector,
              (element: any, injected: any) => {
                if (!injected.elementState(element, "enabled").matches)
                  throw new Error("Browser auth submit control is not enabled");
                return true;
              },
              { timeoutMs: params.timeout_ms },
            );
          await context.playwright.withBoundPlaywrightSelector(
            params.tab_id,
            submit.selector,
            async () => {
              outcome = await checkpoint.revalidateBeforeSubmit(option);
              return outcome == null;
            },
            async (bound: any) => {
              const scoped = Object.create(context, {
                playwright: { value: bound },
              });
              outcome = await checkpoint.revalidateCredentialSubmission(scoped);
              if (outcome == null) {
                actionStarted = true;
                checkpoint.ordinaryAttempt?.beginOrdinarySubmit();
                if (submit.action === "click")
                  await bound.clickLocator(locator, 1);
                else await press({ ...locator, value: "Enter" }, scoped);
              }
            },
            {
              isolatedWorld:
                checkpoint.nativeDelivery || checkpoint.manualCredentialSave,
              timeoutMs: params.timeout_ms,
            },
          );
        } catch (error) {
          if (checkpoint.ordinaryAttempt == null || actionStarted) throw error;
          outcome =
            (await checkpoint.revalidateBeforeSubmit(option)) ??
            "submission_failed";
        }
        if (
          outcome == null ||
          (await checkpoint.ordinaryAttempt?.verifiedOrdinarySiteSubmission(
            params.timeout_ms ?? 5000,
          ))
        )
          return "submitted";
        if (!(await checkpoint.reinspectOrdinary(outcome))) return outcome;
      }
    } catch {
      return "submission_failed";
    }
  };
}
