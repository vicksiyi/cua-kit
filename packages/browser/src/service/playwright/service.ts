import { PlaywrightClick } from "./click";
import { inputTimeout } from "../input/input";
import { rootSelectorScope } from "./frame_routing";
import {
  querySelectorWithVisibleFallbackSource,
  selectorScopeFunctions,
} from "./selector_scope";
import type { ExecutionOptions } from "./execution_state";
/** Assembled original ig methods. The full injected helper and CUA backend remain explicit dependencies. */
export class PlaywrightService extends PlaywrightClick {
  static selectorScopeFunctions() {
    return selectorScopeFunctions();
  }
  async prepareReadonlyLocatorAll(
    tabId: unknown,
    selector: string,
    resultExpression: string,
    options: ExecutionOptions = {},
  ) {
    const timeoutMs = inputTimeout({ timeout_ms: options.timeoutMs });
    const resolved = await this.resolveSelectorTarget(
      rootSelectorScope(tabId),
      selector,
      {
        deadlineMs: options.deadlineMs,
        timeoutMs,
        telemetryAttrs: {
          "browser_use.playwright.operation":
            this.performanceSpan.currentPlaywrightOperation("locator"),
          "browser_use.playwright.phase": "selector_scope",
        },
      },
    );
    return {
      expression: `(() => {
        ${querySelectorWithVisibleFallbackSource}
        ${selectorScopeFunctions()}
        const injected = globalThis.__codexPlaywrightInjected;
        const parsed = injected.parseSelector(${JSON.stringify(resolved.selector)});
        const selectorScope = selectorScopeFor(injected, parsed);
        const elements = selectorScope
          ? selectorScope.injected.querySelectorAll(
              selectorScope.parsed,
              selectorScope.root,
            )
          : [];
        return ${resultExpression};
      })()`,
      frameId: resolved.frameId,
      target: resolved.target,
    };
  }
  async selectorsResolveToDistinctElements(
    tabId: unknown,
    selectors: string[],
    options: ExecutionOptions = {},
  ) {
    return selectors.length < 2
      ? true
      : await this.evaluateWithPlaywrightInjected(
          tabId,
          `(() => {
        ${querySelectorWithVisibleFallbackSource}
        const injected = window.${PlaywrightService.injectedConstant};
        const elements = ${JSON.stringify(selectors)}.map((selector) => {
          const parsed = injected.parseSelector(selector);
          return querySelectorStrictWithVisibleFallback(injected, parsed, document);
        });
        return elements.every(
          (element, index) => element != null && elements.indexOf(element) === index
        );
      })()`,
          {
            telemetryAttrs: {
              "browser_use.playwright.operation":
                this.performanceSpan.currentPlaywrightOperation("locator"),
              "browser_use.playwright.phase": "selector_identity_eval",
            },
            timeoutMs: options.timeoutMs,
          },
        );
  }
}
