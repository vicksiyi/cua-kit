import { defineCommand } from "./define_command";
import { positiveTabId } from "../tab_id";
import { inputTimeout } from "../input/input";
import {
  assertReadonlyScript,
  readonlyExpression,
} from "../readonly/expression";
import {
  evaluateReadonlyPage,
  evaluateReadonlySelector,
  readonlyResult,
  releaseReadonlyObjects,
  readonlyCleanupOptions,
} from "../readonly/runtime";
import type {
  ReadonlyRuntimeContext,
  PreparedReadonly,
} from "../readonly/runtime";
import type { PlaywrightService } from "../playwright/service";
export interface ReadonlyCommandContext extends ReadonlyRuntimeContext {
  playwright: ReadonlyRuntimeContext["playwright"] &
    Pick<PlaywrightService, "prepareReadonlyLocatorAll">;
  acquireAuthority(): {
    observeContent(url: unknown): { assert(): Promise<unknown> };
  };
  security: { currentTabUrl(tabId: number): Promise<unknown> };
}
/** Original AF. Authorization precedes script/selector validation and all execution. */
export const PlaywrightEvaluateCommand = defineCommand(
  "playwright_evaluate",
  async (
    payload: {
      tab_id: unknown;
      script: string;
      selector?: string;
      selector_mode?: string;
      timeout_ms?: number;
      max?: number;
    },
    context: ReadonlyCommandContext,
  ) => {
    const tabId = positiveTabId(payload.tab_id);
    await context
      .acquireAuthority()
      .observeContent(await context.security.currentTabUrl(tabId))
      .assert();
    const timeoutMs = inputTimeout(payload),
      deadlineMs = Date.now() + timeoutMs;
    assertReadonlyScript(payload.script);
    let prepared: PreparedReadonly | undefined;
    if (payload.selector_mode === "all") {
      if (payload.selector == null)
        throw new Error(
          "playwright.evaluate selector_mode=all requires a selector",
        );
      prepared = await context.playwright.prepareReadonlyLocatorAll(
        tabId,
        payload.selector,
        readonlyExpression(
          payload.script,
          undefined,
          "elements",
          "selectorScope?.root?.defaultView ?? globalThis",
        ),
        { deadlineMs, timeoutMs },
      );
    }
    const { evaluationTarget, runtimeResult } =
      payload.selector == null || prepared != null
        ? await evaluateReadonlyPage(
            context,
            tabId,
            payload.script,
            deadlineMs,
            timeoutMs,
            prepared,
          )
        : await evaluateReadonlySelector(
            context,
            tabId,
            payload.selector,
            payload.script,
            deadlineMs,
            timeoutMs,
          );
    try {
      return { value: readonlyResult(runtimeResult) };
    } finally {
      await releaseReadonlyObjects(
        context,
        evaluationTarget.target,
        [
          runtimeResult.result?.objectId,
          runtimeResult.exceptionDetails?.exception?.objectId,
        ],
        readonlyCleanupOptions(),
      );
    }
  },
);
