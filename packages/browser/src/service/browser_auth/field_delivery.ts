import { pressLocator } from "../commands/locator_press";
import { authFieldPage } from "./field_page";
import { readAuthSubmissionOrigin } from "./submission_origin";
import {
  otpPromptId,
  type AuthField,
  type createAuthFieldPlan,
} from "./field_plan";
interface DeliveryCheckpoint {
  credentialPlan: ReturnType<typeof createAuthFieldPlan>;
  params: {
    tab_id: string;
    timeout_ms?: number;
    submit?: { selector: string } | null;
  };
  ctx: any;
  nativeDelivery: boolean;
  ordinaryAttempt?: {
    beginOrdinaryFill(index: number, last: boolean, url?: string): unknown;
    completeOrdinaryFill(index: number): unknown;
    recordAttempt(event: { kind: string; field_index: number }): unknown;
    verifiedOrdinarySiteSubmission(timeout: number): Promise<boolean>;
  };
  completeOrdinaryField(id: string): unknown;
  reinspectOrdinary(status: string): Promise<boolean>;
  revalidateBeforeAction(
    option?: unknown,
    field?: AuthField,
  ): Promise<string | null>;
}
/** Original pte/mte. Default dependencies are actual restored implementations; override only for isolated differential tests. */
export function createAuthFieldDelivery(
  dependencies = {
    press: pressLocator,
    submissionOrigin: readAuthSubmissionOrigin,
  },
) {
  async function fillField(
    field: AuthField,
    value: string,
    digitKey: boolean,
    index: number,
    last: boolean,
    checkpoint: DeliveryCheckpoint,
    option?: unknown,
  ) {
    const { params, ctx } = checkpoint;
    const nativeSubmitSelector = checkpoint.nativeDelivery
      ? params.submit?.selector
          .split(" >> internal:control=enter-frame >> ")
          .at(-1)
      : undefined;
    if (checkpoint.nativeDelivery && nativeSubmitSelector == null)
      return { status: "locator_invalid", actionStarted: false };
    let status: string | null = null,
      actionStarted = false;
    try {
      await ctx.playwright.withBoundPlaywrightSelector(
        params.tab_id,
        field.selector,
        async () => {
          status = await checkpoint.revalidateBeforeAction(option, field);
          return status == null;
        },
        async (bound: any) => {
          const url =
            checkpoint.ordinaryAttempt != null && last
              ? (await dependencies.submissionOrigin(params, ctx, true))?.url
              : undefined;
          actionStarted = true;
          checkpoint.ordinaryAttempt?.beginOrdinaryFill(index, last, url);
          if (digitKey) {
            const scoped = Object.create(ctx, { playwright: { value: bound } });
            await dependencies.press(
              {
                tab_id: params.tab_id,
                selector: field.selector,
                value,
                timeout_ms: params.timeout_ms,
              },
              scoped,
            );
            return;
          }
          await bound.evaluateOnPlaywrightSelectorWithTarget(
            params.tab_id,
            field.selector,
            authFieldPage,
            {
              arg: {
                operation: "browser-auth-fill",
                value,
                nativeSubmitSelector,
              },
              isolatedWorld: checkpoint.nativeDelivery,
              timeoutMs: params.timeout_ms,
            },
          );
        },
        {
          isolatedWorld: checkpoint.nativeDelivery,
          timeoutMs: params.timeout_ms,
        },
      );
    } catch {
      return {
        status:
          (await checkpoint.revalidateBeforeAction(option, field)) ??
          "submission_failed",
        actionStarted,
      };
    }
    return { status, actionStarted };
  }
  async function fillPlan(
    values: Record<string, string | null | undefined>,
    checkpoint: DeliveryCheckpoint,
    option?: unknown,
  ) {
    const total = checkpoint.credentialPlan.fillFields.reduce(
      (count, group) =>
        count + (values[group.promptId] == null ? 0 : group.fields.length),
      0,
    );
    let index = 0;
    for (const group of checkpoint.credentialPlan.fillFields) {
      const value = values[group.promptId];
      if (value == null) continue;
      const characters =
        group.fields.length === 1
          ? [value]
          : Array.from(value.trim().replace(/[\s-]+/g, ""));
      if (characters.length !== group.fields.length) return "submission_failed";
      const digitKey =
        group.promptId === otpPromptId &&
        characters.every((character) => /^[0-9]$/.test(character));
      for (const [offset, field] of group.fields.entries()) {
        for (;;) {
          const { status, actionStarted } = await fillField(
            field,
            characters[offset] ?? "",
            digitKey,
            index,
            index === total - 1,
            checkpoint,
            option,
          );
          if (status == null) {
            checkpoint.completeOrdinaryField(field.id);
            checkpoint.ordinaryAttempt?.completeOrdinaryFill(index);
            break;
          }
          if (actionStarted)
            checkpoint.ordinaryAttempt?.recordAttempt({
              kind: "field_fill_uncertain",
              field_index: Math.min(index, 63),
            });
          if (
            await checkpoint.ordinaryAttempt?.verifiedOrdinarySiteSubmission(
              checkpoint.params.timeout_ms ?? 5000,
            )
          )
            return "submitted";
          if (actionStarted || !(await checkpoint.reinspectOrdinary(status)))
            return status;
        }
        index++;
      }
    }
    return null;
  }
  return { fillField, fillPlan };
}
export const authFieldDelivery = createAuthFieldDelivery();
