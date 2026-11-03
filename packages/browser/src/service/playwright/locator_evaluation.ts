import { PlaywrightLocatorBinding } from "./locator_binding";
import { rootSelectorScope, unavailableFrameTarget } from "./frame_routing";
import { inputTimeout } from "../input/input";
import { retryLocator, selectorDeadline } from "./retry";
import type { ExecutionOptions } from "./execution_state";
import { playwrightEvaluationValue } from "./node_execution";
import { missingPlaywrightHelper } from "./injection";
import { selectorScopeFunctions } from "./selector_scope";
export interface LocatorEvaluationOptions extends ExecutionOptions {
  arg?: unknown;
  retry?: boolean;
}
/** Original ig locator evaluation entry points; bound handles intentionally bypass selector retry. */
export class PlaywrightLocatorEvaluation extends PlaywrightLocatorBinding {
  async evaluateOnPlaywrightSelector(
    tabId: unknown,
    selector: string,
    callback: Function,
    options: LocatorEvaluationOptions = {},
  ) {
    return (
      await this.evaluateOnPlaywrightSelectorWithTarget(
        tabId,
        selector,
        callback,
        options,
      )
    ).result;
  }
  async evaluateOnPlaywrightSelectorWithTarget(
    tabId: unknown,
    selector: string,
    callback: Function,
    options: LocatorEvaluationOptions = {},
  ) {
    const binding = this.boundSelector;
    if (
      binding != null &&
      binding.selector === selector &&
      binding.target.tabId === Number(tabId)
    ) {
      if (options.strict === true)
        throw new Error("Strict evaluation cannot re-resolve a bound selector");
      if (options.isolatedWorld === true && binding.executionContextId == null)
        throw new Error("Bound selector is not in an isolated world");
      const response = await this.callCdpTarget(
        binding.target,
        "Runtime.callFunctionOn",
        {
          arguments: options.arg == null ? [] : [{ value: options.arg }],
          awaitPromise: true,
          functionDeclaration: `async function (arg) {
            const __name = (target) => target;
            const injected = window.${PlaywrightLocatorEvaluation.injectedConstant};
            if (!injected) throw new Error(${JSON.stringify(missingPlaywrightHelper)});
            if (!this.isConnected) throw new Error("Element is not connected");
            ${selectorScopeFunctions()}
            const frameChain = [];
            for (
              let frameWindow = this.ownerDocument?.defaultView;
              frameWindow?.frameElement;
              frameWindow = frameWindow.frameElement.ownerDocument?.defaultView
            ) {
              const frameElement = frameWindow.frameElement;
              frameChain.unshift({
                element: frameElement,
                injected: injectedForWindow(injected, frameElement.ownerDocument?.defaultView),
              });
            }
            return await (${callback.toString()})(this, injected, arg, {
              frameChain,
              prepareFrameChainForPointerAction: (point, scrollAlignment) =>
                prepareFrameChainForPointerAction(frameChain, point, scrollAlignment),
            });
          }`,
          objectId: binding.objectId,
          returnByValue: true,
        },
        { timeoutMs: options.timeoutMs },
      );
      return {
        executionContextId: binding.executionContextId,
        result: playwrightEvaluationValue(response),
        oopifFrameChain: binding.oopifFrameChain,
        target: binding.target,
      };
    }
    const timeoutMs = inputTimeout({ timeout_ms: options.timeoutMs }),
      startedAt = Date.now(),
      callbackSource = callback.toString(),
      retryOptions = selectorDeadline(options, startedAt, timeoutMs),
      scope = rootSelectorScope(tabId);
    if (options.isolatedWorld === true) {
      const { frameTree } = await this.callCdpTarget(
        scope.target,
        "Page.getFrameTree",
        undefined,
        retryOptions,
      );
      if (!frameTree.frame.id) throw new Error(unavailableFrameTarget);
      scope.frameId = frameTree.frame.id;
    }
    return await retryLocator(
      selector,
      () =>
        this.evaluateSingleSelectorWithTarget(
          scope,
          selector,
          callbackSource,
          retryOptions.arg,
          {
            ...(retryOptions.includeFrameIdentity == null
              ? {}
              : { includeFrameIdentity: retryOptions.includeFrameIdentity }),
            ...(retryOptions.isolatedWorld === true
              ? { isolatedWorld: true }
              : {}),
            ...(retryOptions.strict === true ? { strict: true } : {}),
            scrollFrameIntoView: retryOptions.scrollFrameIntoView,
            deadlineMs: retryOptions.deadlineMs,
            timeoutMs,
            telemetryAttrs: {
              "browser_use.playwright.operation":
                this.performanceSpan.currentPlaywrightOperation("locator"),
              "browser_use.playwright.phase": "selector_eval",
            },
          },
        ),
      {
        deadlineMs: retryOptions.deadlineMs,
        retry: retryOptions.retry,
        startedAt,
        timeoutMs,
      },
      this.commandTiming,
    );
  }
  async evaluateOnPlaywrightSelectorAll(
    tabId: unknown,
    selector: string,
    callback: Function,
    options: LocatorEvaluationOptions = {},
  ) {
    const timeoutMs = inputTimeout({ timeout_ms: options.timeoutMs }),
      startedAt = Date.now(),
      callbackSource = callback.toString(),
      retryOptions = selectorDeadline(options, startedAt, timeoutMs);
    return await retryLocator(
      selector,
      () =>
        this.evaluateSelectorAllInTarget(
          rootSelectorScope(tabId),
          selector,
          callbackSource,
          retryOptions.arg,
          {
            deadlineMs: retryOptions.deadlineMs,
            timeoutMs,
            telemetryAttrs: {
              "browser_use.playwright.operation":
                this.performanceSpan.currentPlaywrightOperation("locator"),
              "browser_use.playwright.phase": "selector_all_eval",
            },
          },
        ),
      {
        deadlineMs: retryOptions.deadlineMs,
        retry: retryOptions.retry,
        startedAt,
        timeoutMs,
      },
      this.commandTiming,
    );
  }
}
