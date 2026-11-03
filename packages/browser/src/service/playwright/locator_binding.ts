import { PlaywrightSelectorExecution } from "./selector_execution";
import { rootSelectorScope, unavailableFrameTarget } from "./frame_routing";
import type { FrameScope } from "./frame_routing";
import { assertSelectorDeadline } from "./execution_state";
import type { ExecutionOptions } from "./execution_state";
import {
  selectorDeadline,
  selectorRetryDelay,
  isTerminalSelectorError,
} from "./retry";
import { inputTimeout } from "../input/input";
import { LocatorError } from "../errors/locator_error";
export interface BoundSelector {
  executionContextId: number | undefined;
  objectId: string;
  oopifFrameChain: FrameScope["oopifFrameChain"];
  selector: string;
  target: FrameScope["target"];
}
/** Original ig locator node resolution and document-bound callback scope. */
export class PlaywrightLocatorBinding extends PlaywrightSelectorExecution {
  declare boundSelector: BoundSelector | undefined;
  async resolvePlaywrightSelector(tabId: number, selector: string) {
    if (!Number.isFinite(tabId))
      throw new Error("resolvePlaywrightSelector requires numeric tab_id");
    return (
      await this.resolvePlaywrightSelectorNode(tabId, selector, {
        retry: false,
      })
    ).backendNodeId;
  }
  async resolvePlaywrightSelectorNode(
    tabId: unknown,
    selector: string,
    options: ExecutionOptions = {},
  ) {
    const timeoutMs = inputTimeout({ timeout_ms: options.timeoutMs }),
      startedAt = Date.now(),
      retryOptions = selectorDeadline(options, startedAt, timeoutMs);
    for (;;) {
      assertSelectorDeadline(retryOptions);
      try {
        const executionOptions = {
          deadlineMs: retryOptions.deadlineMs,
          isolatedWorld: retryOptions.isolatedWorld,
          timeoutMs,
          telemetryAttrs: {
            "browser_use.playwright.operation":
              this.performanceSpan.currentPlaywrightOperation("locator"),
            "browser_use.playwright.phase": "selector_node",
          },
        };
        const scope = rootSelectorScope(tabId);
        if (retryOptions.isolatedWorld === true) {
          const { frameTree } = await this.callCdpTarget(
            scope.target,
            "Page.getFrameTree",
            undefined,
            executionOptions,
          );
          if (!frameTree.frame.id) throw new Error(unavailableFrameTarget);
          scope.frameId = frameTree.frame.id;
        }
        const resolved = await this.resolveSelectorTarget(
          scope,
          selector,
          executionOptions,
        );
        return {
          ...(await this.nodeForResolvedSelectorTarget(
            resolved,
            executionOptions,
          )),
          oopifFrameChain: resolved.oopifFrameChain,
          target: resolved.target,
        };
      } catch (error) {
        if (isTerminalSelectorError(error) || retryOptions.retry === false)
          throw error;
        if (Date.now() - startedAt >= timeoutMs) {
          const message =
            error instanceof Error ? error.message : String(error);
          throw new LocatorError(
            "locator_timeout",
            `Timed out after ${timeoutMs}ms waiting for selector ${selector}: ${message}`,
            { cause: error },
          );
        }
        assertSelectorDeadline(retryOptions);
        await new Promise<void>((resolve) =>
          setTimeout(resolve, selectorRetryDelay(retryOptions)),
        );
      }
    }
  }
  async withBoundPlaywrightSelector<T>(
    tabId: unknown,
    selector: string,
    validate: () => Promise<unknown>,
    run: (service: this) => Promise<T>,
    options: ExecutionOptions = {},
  ): Promise<T | undefined> {
    const node = await this.resolvePlaywrightSelectorNode(tabId, selector, {
      isolatedWorld: options.isolatedWorld,
      retry: false,
      timeoutMs: options.timeoutMs,
    });
    return await this.withPlaywrightNode(
      node,
      async (objectId, executionContextId) => {
        const binding: BoundSelector = {
          executionContextId,
          objectId,
          oopifFrameChain: node.oopifFrameChain,
          selector,
          target: node.target,
        };
        if (!(await validate())) return;
        const scoped: this = Object.create(this, {
          boundSelector: { value: binding },
        });
        return await run(scoped);
      },
      options,
    );
  }
}
