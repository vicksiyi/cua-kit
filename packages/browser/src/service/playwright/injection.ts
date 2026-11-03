import {
  PlaywrightNodeExecution,
  playwrightEvaluationError,
  playwrightEvaluationValue,
} from "./node_execution";
import { assertSelectorDeadline, executionTargetKey } from "./execution_state";
import type { ExecutionCdp, ExecutionOptions } from "./execution_state";
import type { CdpTarget } from "../cdp/dispatch_helpers";
import { positiveTabId } from "../tab_id";
import {
  credentialFieldPolicy,
  isCredentialField,
} from "../clipboard/page_execution";
export const missingPlaywrightHelper =
  "Browser Use Playwright injected helper is missing";
/** Original vF/SF/Pne. */
export function isMissingPlaywrightHelper(error: unknown) {
  const message = String(error instanceof Error ? error.message : error);
  return (
    message.includes(missingPlaywrightHelper) ||
    /Cannot read properties of (?:undefined|null) \(reading ['"]incrementalAriaSnapshot['"]\)/.test(
      message,
    )
  );
}
export function isDestroyedExecutionContext(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /Cannot find context|Execution context was destroyed|context.*destroyed|context.*not found/i.test(
    message,
  );
}
export function remainingExecutionOptions(options: ExecutionOptions) {
  assertSelectorDeadline(options);
  if (options.deadlineMs == null) return options;
  const remaining = options.deadlineMs - Date.now();
  return {
    ...options,
    timeoutMs: Math.max(1, Math.min(options.timeoutMs ?? remaining, remaining)),
  };
}
/** Original vne/eg template. The full hF source must be supplied, not replaced with a compatibility helper. */
export function playwrightInstallation(source: string) {
  return {
    awaitPromise: true,
    expression: `(() => {
  if (!window.__codexPlaywrightInjected) {
    ${source}
    window.__codexPlaywrightInjected = new PlaywrightInjected.InjectedScript(window, {
      isUnderTest: false,
      sdkLanguage: "javascript",
      testIdAttributeName: "data-testid",
      stableRafCount: 1,
      browserName: "chromium",
      customEngines: [],
    });
  }
  window.__codexPlaywrightInjected.isProtectedCredentialField = (element) =>
    (${isCredentialField.toString()})(element, ${JSON.stringify(credentialFieldPolicy)});
})()`,
    returnByValue: true,
  };
}
/** Original ig injection/recovery methods, over restored node/context execution. */
export class PlaywrightInjection extends PlaywrightNodeExecution {
  readonly installation: ReturnType<typeof playwrightInstallation>;
  constructor(cdp: ExecutionCdp, injectedSource: string) {
    super(cdp);
    this.installation = playwrightInstallation(injectedSource);
  }
  async ensurePlaywrightInjected(
    tabId: unknown,
    options: ExecutionOptions = {},
  ) {
    const id = Number(tabId);
    if (!Number.isFinite(id))
      throw new Error("ensurePlaywrightInjected requires numeric tab_id");
    await this.ensurePlaywrightInjectedInTarget({ tabId: id }, options);
  }
  async ensurePlaywrightInjectedInTarget(
    target: CdpTarget,
    options: ExecutionOptions = {},
    frameId?: string,
  ) {
    const key = executionTargetKey(target, frameId),
      label = (options.telemetryAttrs as any)?.[
        "browser_use.playwright.operation"
      ],
      operation = typeof label === "string" ? label : "unknown";
    if (!this.playwrightInjectedTargets.has(key)) {
      assertSelectorDeadline(options);
      playwrightEvaluationValue(
        await this.callRuntimeEvaluateInExecutionTarget(
          { frameId, target },
          this.installation,
          {
            timeoutMs: options.timeoutMs,
            ...(options.deadlineMs == null
              ? {}
              : { deadlineMs: options.deadlineMs }),
            telemetryAttrs: {
              "browser_use.playwright.operation": operation,
              "browser_use.playwright.phase": "inject_install",
            },
          },
          "playwright-injected",
        ),
      );
      this.playwrightInjectedTargets.add(key);
    }
  }
  async evaluateWithPlaywrightInjected(
    tabId: unknown,
    expression: string,
    options?: ExecutionOptions,
  ) {
    return await this.evaluateWithPlaywrightInjectedInTarget(
      { tabId: positiveTabId(tabId) },
      expression,
      options,
    );
  }
  async evaluateWithPlaywrightInjectedInTarget(
    target: CdpTarget,
    expression: string,
    options: ExecutionOptions = {},
    frameId?: string,
  ) {
    return playwrightEvaluationValue(
      await this.callRuntimeEvaluateWithPlaywrightInjectedInTarget(
        target,
        { expression, returnByValue: true, awaitPromise: true },
        options,
        frameId,
      ),
    );
  }
  async callRuntimeEvaluateWithPlaywrightInjectedInTarget(
    target: CdpTarget,
    params: { expression: string; timeout?: number; [name: string]: unknown },
    options: ExecutionOptions = {},
    frameId?: string,
  ) {
    assertSelectorDeadline(options);
    await this.ensurePlaywrightInjectedInTarget(target, options, frameId);
    const evaluate = async () => {
      const effective = remainingExecutionOptions(options),
        request = {
          ...params,
          expression: `(() => {
          if (!window.${PlaywrightInjection.injectedConstant}) {
            throw new Error(${JSON.stringify(missingPlaywrightHelper)});
          }
          return (${params.expression});
        })()`,
        };
      delete request.timeout;
      if (effective.timeoutMs != null && effective.timeoutMs > 0)
        request.timeout = effective.timeoutMs;
      return {
        options: effective,
        result: await this.callRuntimeEvaluateInExecutionTarget(
          { frameId, target },
          request,
          effective,
        ),
      };
    };
    try {
      const first = await evaluate(),
        error = playwrightEvaluationError(first.result);
      if (error == null) return first.result;
      if (isMissingPlaywrightHelper(error)) {
        if (frameId == null) this.clearPlaywrightStateForTarget(target);
        else this.deletePlaywrightFrameWorld(target, frameId);
      } else {
        if (frameId == null || !isDestroyedExecutionContext(error))
          return first.result;
        this.deletePlaywrightFrameWorld(target, frameId);
      }
      await this.releaseRuntimeObjects(
        target,
        [
          first.result.result?.objectId,
          first.result.exceptionDetails?.exception?.objectId,
        ],
        first.options,
      );
    } catch (error) {
      if (isMissingPlaywrightHelper(error)) {
        if (frameId == null) this.clearPlaywrightStateForTarget(target);
        else this.deletePlaywrightFrameWorld(target, frameId);
      } else {
        if (frameId == null || !isDestroyedExecutionContext(error)) throw error;
        this.deletePlaywrightFrameWorld(target, frameId);
      }
    }
    assertSelectorDeadline(options);
    await this.ensurePlaywrightInjectedInTarget(target, options, frameId);
    assertSelectorDeadline(options);
    return (await evaluate()).result;
  }
}
