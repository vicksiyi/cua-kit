import {
  PlaywrightFrameRouting,
  frameSelectorSeparator,
  unavailableFrameTarget,
  flattenFrameTree,
} from "./frame_routing";
import type { FrameScope, FrameRoutingCdp } from "./frame_routing";
import { positiveTabId } from "../tab_id";
import { assertSelectorDeadline } from "./execution_state";
import type { ExecutionOptions } from "./execution_state";
import type { LocatorTiming } from "./retry";
import { playwrightEvaluationValue } from "./node_execution";
import {
  querySelectorWithVisibleFallbackSource,
  selectorScopeFunctions,
} from "./selector_scope";
export interface ResolvedSelectorScope extends FrameScope {
  selector: string;
}
export interface PlaywrightPerformanceSpan {
  currentPlaywrightOperation(fallback: string): string;
}
/** Original tS. */
export function serializeArgument(value: unknown) {
  return JSON.stringify(value) ?? "undefined";
}
/** Original ig.resolveSelectorTarget page callback; serialized without module dependencies. */
export function assertDocumentSelector(injected: any, selector: string) {
  const containsFrameTraversal = (value: unknown): boolean =>
    value == null || typeof value !== "object"
      ? false
      : "name" in value &&
          value.name === "internal:control" &&
          "body" in value &&
          value.body === "enter-frame"
        ? true
        : Object.values(value).some(containsFrameTraversal);
  if (containsFrameTraversal(injected.parseSelector(selector)))
    throw new Error("Child frame traversal is restricted for this document.");
}
/** Selector execution portion of original ig, assembled over restored frame routing. */
export class PlaywrightSelectorExecution extends PlaywrightFrameRouting {
  constructor(
    cdp: FrameRoutingCdp,
    injectedSource: string,
    commandTiming: LocatorTiming,
    public performanceSpan: PlaywrightPerformanceSpan,
    isIabBackend = false,
    executionPolicy: { documentOnly?: boolean } = {},
  ) {
    super(cdp, injectedSource, commandTiming, isIabBackend, executionPolicy);
  }
  async evaluateOnPlaywrightPage(
    tabId: unknown,
    callback: Function,
    options: ExecutionOptions & { arg?: unknown } = {},
  ) {
    const callbackSource = callback.toString();
    const target = { tabId: positiveTabId(tabId) };
    const executionOptions = {
      telemetryAttrs: {
        "browser_use.playwright.operation":
          this.performanceSpan.currentPlaywrightOperation("page"),
        "browser_use.playwright.phase": "page_eval",
      },
      timeoutMs: options.timeoutMs,
    };
    let frameId: string | undefined;
    if (options.isolatedWorld === true) {
      const { frameTree } = await this.callCdpTarget(
        target,
        "Page.getFrameTree",
        undefined,
        executionOptions,
      );
      if (!frameTree.frame.id) throw new Error(unavailableFrameTarget);
      frameId = frameTree.frame.id;
    }
    return await this.evaluateWithPlaywrightInjectedInTarget(
      target,
      `(async () => {
          const __name = (target) => target;
          const injected = window.${PlaywrightSelectorExecution.injectedConstant};
          return await (${callbackSource})(injected, ${serializeArgument(options.arg)});
        })()`,
      executionOptions,
      frameId,
    );
  }
  async resolveSelectorTarget(
    scope: FrameScope,
    selector: string,
    options: ExecutionOptions = {},
  ): Promise<ResolvedSelectorScope> {
    if (this.executionPolicy.documentOnly)
      await this.evaluateOnPlaywrightPage(
        scope.target.tabId,
        assertDocumentSelector,
        { arg: selector, timeoutMs: options.timeoutMs },
      );
    let currentScope = scope,
      currentSelector = selector;
    for (;;) {
      assertSelectorDeadline(options);
      const routed = await this.frameRouteForFirstOopif(
        currentScope,
        currentSelector,
        options,
      );
      if (routed == null)
        return {
          ...(currentScope.frameId == null
            ? {}
            : { frameId: currentScope.frameId }),
          oopifFrameChain: currentScope.oopifFrameChain,
          selector: currentSelector,
          target: currentScope.target,
        };
      currentScope = routed;
      currentSelector = routed.selector;
    }
  }
  async nodeForResolvedSelectorTarget(
    scope: ResolvedSelectorScope,
    options: ExecutionOptions,
  ) {
    const response =
      await this.callRuntimeEvaluateWithPlaywrightInjectedInTarget(
        scope.target,
        {
          expression: `(() => {
            ${querySelectorWithVisibleFallbackSource}
            ${selectorScopeFunctions()}
            const initialInjected = window.${PlaywrightSelectorExecution.injectedConstant};
            const parsed = initialInjected.parseSelector(${JSON.stringify(scope.selector)});
            const scope = selectorScopeFor(initialInjected, parsed);
            const element = scope
              ? querySelectorStrictWithVisibleFallback(scope.injected, scope.parsed, scope.root)
              : null;
            if (!element) throw new Error("No element matched selector");
            return element;
          })()`,
          returnByValue: false,
        },
        options,
        scope.frameId,
      );
    const objectId = response.result?.objectId,
      exceptionId = response.exceptionDetails?.exception?.objectId;
    try {
      if (response.exceptionDetails != null)
        playwrightEvaluationValue(response);
      if (objectId == null)
        throw new Error("Playwright selector did not resolve to a DOM node");
      const { node } = await this.callCdpTarget(
        scope.target,
        "DOM.describeNode",
        { objectId },
        options,
      );
      const frameId = scope.selector.includes(frameSelectorSeparator)
        ? await this.frameIdForElementObject(scope.target, objectId, options)
        : scope.frameId;
      return {
        backendNodeId: node.backendNodeId,
        ...(frameId == null ? {} : { frameId }),
      };
    } finally {
      await this.releaseRuntimeObjects(
        scope.target,
        [objectId, exceptionId],
        options,
      );
    }
  }
  async frameIdentityForResolvedSelectorTarget(
    scope: ResolvedSelectorScope,
    options: ExecutionOptions = {},
  ) {
    const { frameTree } = await this.callCdpTarget(
      scope.target,
      "Page.getFrameTree",
      undefined,
      options,
    );
    const frameId = scope.selector.includes(frameSelectorSeparator)
      ? (await this.nodeForResolvedSelectorTarget(scope, options)).frameId
      : (scope.frameId ?? frameTree.frame.id);
    const frame = flattenFrameTree(frameTree).find(
      (frame) => frame.id === frameId,
    );
    if (frame != null && frame.id && frame.loaderId && frame.url)
      return {
        ...(frame.domainAndRegistry == null
          ? {}
          : { domainAndRegistry: frame.domainAndRegistry }),
        frameId: frame.id,
        loaderId: frame.loaderId,
        url: frame.url,
      };
  }
  async evaluateSingleSelectorInResolvedTarget(
    scope: ResolvedSelectorScope,
    callbackSource: string,
    arg: unknown,
    options: ExecutionOptions = {},
  ) {
    const response =
      await this.callRuntimeEvaluateWithPlaywrightInjectedInTarget(
        scope.target,
        {
          awaitPromise: true,
          returnByValue: true,
          expression: `(async () => {
          const __name = (target) => target;
          ${querySelectorWithVisibleFallbackSource}
          ${selectorScopeFunctions()}
          const initialInjected = window.${PlaywrightSelectorExecution.injectedConstant};
          const parsed = initialInjected.parseSelector(${JSON.stringify(scope.selector)});
          const scope = selectorScopeFor(initialInjected, parsed, ${options.strict === !0});
          const element = scope
            ? querySelectorStrictWithVisibleFallback(scope.injected, scope.parsed, scope.root, ${options.strict === !0})
            : null;
          if (!element) throw new Error("No element matched selector");
          return await (${callbackSource})(element, scope.injected, ${serializeArgument(arg)}, scope);
        })()`,
        },
        options,
        scope.frameId,
      );
    return {
      executionContextId: response.executionContextId,
      result: playwrightEvaluationValue(response),
    };
  }
  async evaluateSingleSelectorWithTarget(
    scope: FrameScope,
    selector: string,
    callbackSource: string,
    arg: unknown,
    options: ExecutionOptions = {},
  ) {
    assertSelectorDeadline(options);
    const resolved = await this.resolveSelectorTarget(scope, selector, options);
    assertSelectorDeadline(options);
    return {
      ...(options.includeFrameIdentity === true
        ? {
            frameIdentity: await this.frameIdentityForResolvedSelectorTarget(
              resolved,
              options,
            ),
          }
        : {}),
      ...(await this.evaluateSingleSelectorInResolvedTarget(
        resolved,
        callbackSource,
        arg,
        options,
      )),
      oopifFrameChain: resolved.oopifFrameChain,
      target: resolved.target,
    };
  }
  async evaluateSelectorAllInTarget(
    scope: FrameScope,
    selector: string,
    callbackSource: string,
    arg: unknown,
    options: ExecutionOptions = {},
  ) {
    assertSelectorDeadline(options);
    const resolved = await this.resolveSelectorTarget(scope, selector, options);
    assertSelectorDeadline(options);
    return await this.evaluateWithPlaywrightInjectedInTarget(
      resolved.target,
      `(async () => {
          ${querySelectorWithVisibleFallbackSource}
          ${selectorScopeFunctions()}
          const initialInjected = window.${PlaywrightSelectorExecution.injectedConstant};
          const parsed = initialInjected.parseSelector(${JSON.stringify(resolved.selector)});
          const scope = selectorScopeFor(initialInjected, parsed);
          const elements = scope
            ? scope.injected.querySelectorAll(scope.parsed, scope.root)
            : [];
          const scopedInjected = scope ? scope.injected : initialInjected;
          return await (${callbackSource})(elements, scopedInjected, ${serializeArgument(arg)});
        })()`,
      options,
      resolved.frameId,
    );
  }
}
