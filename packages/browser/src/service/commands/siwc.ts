import { SiwcDetect } from "../../commands/siwc";
import { defineCommand } from "./define_command";
import { positiveTabId } from "../tab_id";
import { observeSiwc } from "../siwc/observation";

async function assertObservationAuthority(
  payload: { tab_id: string },
  context: any,
) {
  await context
    .acquireAuthority()
    .observeContent(
      await context.security.currentTabUrl(positiveTabId(payload.tab_id)),
    )
    .assert();
}
/** Current yN/Ja: authorize both before and after observing the page. */
export const SiwcDetectCommand = defineCommand(
  SiwcDetect,
  async (payload: { tab_id: string }, context: any) => {
    if (!(await context.supportsTabCapability("siwc")))
      return { status: "unavailable", reason: "observation_unavailable" };
    await assertObservationAuthority(payload, context);
    const { siwc } = await observeSiwc(payload, context);
    await assertObservationAuthority(payload, context);
    return siwc;
  },
);

import {
  SiwcAuthenticate,
  type SiwcAuthenticateOptions,
} from "../../commands/siwc";
import {
  committedSiwcPage,
  isSiwcPageCurrent,
  isSiwcSnapshotCurrent,
} from "../siwc/observation";
import { isSameSiwcAccount, isSiwcControlReady } from "../siwc/readiness";
import { inputTimeout } from "../input/input";

/** Current gN: retain stage-specific failures and revalidate before grant, cookie and click. */
export const SiwcAuthenticateCommand = defineCommand(
  SiwcAuthenticate,
  async (
    payload: SiwcAuthenticateOptions & {
      tab_id: string;
      timeout_ms?: number;
      max?: number;
    },
    context: any,
  ) => {
    if (!(await context.supportsTabCapability("siwc")))
      return { status: "unsupported" };
    const tabId = positiveTabId(payload.tab_id);
    const url = await context.security.currentTabUrl(tabId);
    await context
      .acquireAuthority()
      .observeContent(url)
      .actInFrame(url)
      .assert();
    let failure = "page_changed";
    try {
      const page = await committedSiwcPage(tabId, context);
      failure = "target_unavailable";
      let target = payload.target;
      if (target == null) {
        const { siwc } = await observeSiwc(payload, context);
        if (siwc.status === "unavailable")
          return {
            status:
              siwc.reason === "page_changed"
                ? "page_changed"
                : "target_unavailable",
          };
        if (siwc.status === "no_deterministic_matches")
          return { status: "no_actionable_button" };
        const [first, second, ...rest] = siwc.candidates!;
        if (second != null)
          return {
            status: "multiple_actionable_buttons",
            candidates: [first, second, ...rest],
          };
        target = first.target;
      }
      let ref: string;
      if (target!.kind === "ax") {
        const node = context.ax.targetForSnapshot(
          tabId,
          target!.snapshotId,
          target!.elementIndex,
        );
        const { result } = await context.playwright.evaluateOnPlaywrightNode(
          { target: node.target, backendNodeId: node.backendNodeId },
          (element: any, injected: any) => injected.siwcRef(element),
          { timeoutMs: inputTimeout(payload) },
        );
        ref = result;
      } else {
        if (
          !(await isSiwcSnapshotCurrent(payload, context, target!.snapshotId))
        )
          return {
            status: (await isSiwcPageCurrent(tabId, page, context))
              ? "target_unavailable"
              : "page_changed",
          };
        ref = (target as { ref: string }).ref;
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(ref))
        return { status: "target_unavailable" };
      const selector = `aria-ref=${ref}`;
      return (
        (await context.playwright.withBoundPlaywrightSelector(
          payload.tab_id,
          selector,
          () => isSiwcPageCurrent(tabId, page, context),
          async (bound: any) => {
            const check = async (scroll: boolean) => {
              if (!(await isSiwcPageCurrent(tabId, page, context))) {
                failure = "page_changed";
                return false;
              }
              failure = "target_unavailable";
              return await bound.evaluateOnPlaywrightSelector(
                payload.tab_id,
                selector,
                isSiwcControlReady,
                {
                  retry: false,
                  timeoutMs: inputTimeout(payload),
                  arg: { automatic: payload.target == null, scroll },
                },
              );
            };
            if (!(await check(false))) return { status: failure };
            failure = "account_unavailable";
            const account = await context.getSiwcAccountContext(tabId);
            if (account.pageOrigin !== new URL(page.url).origin)
              return { status: "page_changed" };
            failure = "approval_failed";
            const permissionKey = {
              accountKey: account.accountKey,
              origin: account.pageOrigin,
            };
            const permission =
              await context.preferences.getSiwcPermission(permissionKey);
            if (permission?.decision === "deny")
              return { status: "approval_declined" };
            if (permission == null) {
              const response = await context.commandTiming.trackElicitation(
                context.runtime.createElicitation,
              )({
                message: `Allow Sign in with ChatGPT on ${account.pageOrigin} using your current ChatGPT account?`,
                requestedSchema: {
                  type: "object",
                  properties: {},
                  additionalProperties: false,
                },
                meta: {
                  codex_approval_kind: "mcp_tool_call",
                  codex_sensitive_action: true,
                  codex_requires_user_input: true,
                  codex_guardian_compatible: false,
                  connector_id: "browser-use",
                  connector_name:
                    context.elicitationDisplayName ?? "Browser use",
                  tool_name: "siwc_authenticate",
                  tool_title: "Sign in with ChatGPT",
                  tool_params: { origin: account.pageOrigin },
                  origin: account.pageOrigin,
                  persist:
                    (await context.preferences.isPersistentApprovalAllowed(
                      account.pageOrigin,
                    ))
                      ? ["session", "always"]
                      : "session",
                },
              });
              await context.preferences.handleSiwcPromptResult(
                permissionKey,
                response,
              );
              if (response.action === "decline")
                return { status: "approval_declined" };
              if (response.action === "cancel")
                return { status: "approval_cancelled" };
              if (response.action !== "accept")
                return { status: "approval_failed" };
            }
            if (!(await check(true))) return { status: failure };
            failure = "account_changed";
            if (
              !isSameSiwcAccount(
                account,
                await context.getSiwcAccountContext(tabId),
              )
            )
              return { status: "account_changed" };
            failure = "grant_failed";
            context.runtime.otel?.log("codex.browser_use.siwc_grant", {
              "browser_use.siwc.phase": "browser_client_request",
            });
            const grant = await context.issueSiwcBrowserGrant(tabId, account);
            if (!(await check(true))) return { status: failure };
            failure = "cookie_failed";
            await context.installSiwcBrowserGrantCookie(tabId, account, grant);
            failure = "click_failed";
            await context.followSessionTab(tabId);
            failure = "account_changed";
            if (
              !isSameSiwcAccount(
                account,
                await context.getSiwcAccountContext(tabId),
              )
            )
              return { status: "account_changed" };
            if (!(await check(true))) return { status: failure };
            failure = "click_failed";
            await bound.clickLocator({ tab_id: payload.tab_id, selector }, 1);
            return { status: "initiated" };
          },
          { timeoutMs: inputTimeout(payload) },
        )) ?? { status: "page_changed" }
      );
    } catch {
      return { status: failure };
    }
  },
);
