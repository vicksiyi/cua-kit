import type { CdpTarget } from "../cdp/dispatch_helpers";
import { positiveTabId } from "../tab_id";
import { PlaywrightFocus } from "./focus";
import { assertSelectorDeadline, executionTargetKey } from "./execution_state";
import type { ExecutionCdp, ExecutionOptions } from "./execution_state";
import {
  playwrightEvaluationError,
  playwrightEvaluationValue,
} from "./node_execution";
import {
  querySelectorWithVisibleFallbackSource,
  selectorScopeFunctions,
} from "./selector_scope";
export const frameSelectorSeparator = " >> internal:control=enter-frame >> ";
export const unavailableFrameTarget =
  "Frame target is not available for this iframe selector path";
export interface FrameScope {
  target: CdpTarget;
  frameId?: string;
  oopifFrameChain: Array<{
    frameId: string | null;
    parentTarget: CdpTarget;
    size: { height: number; width: number };
  }>;
}
export interface FrameMetadata {
  frameUrl?: string;
  frameName?: string;
  enterFrameCount: number;
  size: { height: number; width: number };
}
export interface FrameTree {
  frame: { id?: string; url?: string; name?: string };
  childFrames?: FrameTree[];
}
export interface FrameRoutingCdp extends ExecutionCdp {
  enableOopifAutoAttach?(
    tabId: number,
    options: ExecutionOptions,
  ): Promise<unknown>;
  targetForFrame?(tabId: number, frameId: string): CdpTarget | null;
  targetForFrameOrAttach?(
    tabId: number,
    frameId: string | null,
    options: ExecutionOptions,
    metadata: { parentTarget: CdpTarget; url?: string },
  ): Promise<CdpTarget | null>;
}
/** Original rg/Rne/Ine/iS/kne/Bne. */
export function rootSelectorScope(tabId: unknown): FrameScope {
  return { oopifFrameChain: [], target: { tabId: positiveTabId(tabId) } };
}
export function isLocalFrameUrl(url?: string) {
  if (url == null) return false;
  try {
    const { protocol } = new URL(url);
    return protocol === "about:" || protocol === "data:";
  } catch {
    return false;
  }
}
export function remainingFrameSelector(selector: string, count: number) {
  return selector
    .split(frameSelectorSeparator)
    .slice(count)
    .join(frameSelectorSeparator);
}
export function flattenFrameTree(tree: FrameTree): FrameTree["frame"][] {
  return [tree.frame, ...(tree.childFrames ?? []).flatMap(flattenFrameTree)];
}
export function supportsFrameRouting(
  cdp: FrameRoutingCdp,
): cdp is FrameRoutingCdp &
  Required<Pick<FrameRoutingCdp, "enableOopifAutoAttach" | "targetForFrame">> {
  return (
    typeof cdp.enableOopifAutoAttach === "function" &&
    typeof cdp.targetForFrame === "function"
  );
}
/** Original ig iframe target routing, assembled on restored execution/injection/focus. */
export class PlaywrightFrameRouting extends PlaywrightFocus {
  declare cdp: FrameRoutingCdp;
  async frameRouteForFirstOopif(
    scope: FrameScope,
    selector: string,
    options: ExecutionOptions = {},
  ): Promise<(FrameScope & { selector: string }) | null> {
    if (
      !selector.includes(frameSelectorSeparator) ||
      !supportsFrameRouting(this.cdp)
    )
      return null;
    assertSelectorDeadline(options);
    await this.cdp.enableOopifAutoAttach(scope.target.tabId, options);
    assertSelectorDeadline(options);
    const response =
      await this.callRuntimeEvaluateWithPlaywrightInjectedInTarget(
        scope.target,
        {
          expression: `(() => {
          ${querySelectorWithVisibleFallbackSource}
          ${selectorScopeFunctions()}
          const initialInjected = window.${PlaywrightFrameRouting.injectedConstant};
          const parsedSelector = initialInjected.parseSelector(${JSON.stringify(selector)});
          let currentRoot = document;
          let currentInjected = initialInjected;
          let partStart = 0;

          while (true) {
            const enterFrameIndex = parsedSelector.parts.findIndex(
              (part, index) =>
                index >= partStart &&
                part.name === "internal:control" &&
                part.body === "enter-frame"
            );

            if (enterFrameIndex === -1) return null;

            const frameSelector = sliceParsedSelector(
              parsedSelector,
              partStart,
              enterFrameIndex
            );
            const frameElement = querySelectorStrictWithVisibleFallback(
              currentInjected,
              frameSelector,
              currentRoot,
              ${options.strict === !0}
            );
            if (!frameElement) return null;

            const tagName = String(frameElement.localName || frameElement.tagName || "").toLowerCase();
            if (tagName !== "iframe" && tagName !== "frame") {
              throw new Error("internal:control=enter-frame must target a frame element");
            }

            const state = currentInjected.elementState(frameElement, "visible");
            if (state.received === "error:notconnected") {
              throw new Error("Frame is not connected");
            }

            if (!state.matches) {
              throw new Error("Frame is not visible");
            }

            if (${options.scrollFrameIntoView !== !1}) {
              frameElement.scrollIntoView({
                block: "center",
                inline: "nearest",
                behavior: "instant",
              });
            }
            let frameWindow;
            let frameDocument;
            try {
              frameWindow = frameElement.contentWindow;
              frameDocument = frameElement.contentDocument || frameWindow?.document;
            } catch {
              return frameElement;
            }

            if (!frameWindow || !frameDocument) return frameElement;

            currentRoot = frameDocument;
            currentInjected = injectedForWindow(initialInjected, frameWindow);
            partStart = enterFrameIndex + 1;
          }
        })()`,
          returnByValue: false,
        },
        options,
        scope.frameId,
      );
    const elementId = response.result?.objectId,
      exceptionId = response.exceptionDetails?.exception?.objectId;
    let metadataId: string | undefined, metadataExceptionId: string | undefined;
    try {
      const error = playwrightEvaluationError(response);
      if (error != null) throw error;
      if (elementId == null) {
        assertSelectorDeadline(options);
        return null;
      }
      assertSelectorDeadline(options);
      const [metadataResponse, nodeResponse] = await Promise.allSettled([
        this.callCdpTarget(
          scope.target,
          "Runtime.callFunctionOn",
          {
            functionDeclaration: `function () {
              let ownerDocument = this.ownerDocument;
              let enterFrameCount = 1;
              while (ownerDocument !== document) {
                const ownerFrame = ownerDocument?.defaultView?.frameElement;
                if (!ownerFrame) throw new Error("Frame is not connected");
                ownerDocument = ownerFrame.ownerDocument;
                enterFrameCount += 1;
              }

              const rect = this.getBoundingClientRect();
              if (!rect || rect.width <= 0 || rect.height <= 0) {
                throw new Error("Frame does not have an actionable bounding box");
              }

              let width = Number(this.clientWidth) || rect.width;
              let height = Number(this.clientHeight) || rect.height;
              if (${this.isIabBackend}) {
                const style = this.ownerDocument.defaultView.getComputedStyle(this);
                const contentSize = (axis, currentSize, paddingStart, paddingEnd, borderStart, borderEnd) => {
                  const computedSize = parseFloat(style[axis]);
                  const padding = parseFloat(style[paddingStart]) + parseFloat(style[paddingEnd]);
                  if (!Number.isFinite(computedSize)) return Math.round(currentSize - padding);
                  return Math.round(computedSize - (style.boxSizing === 'border-box'
                    ? padding + parseFloat(style[borderStart]) + parseFloat(style[borderEnd]) : 0));
                };
                width = contentSize('width', width, 'paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth');
                height = contentSize('height', height, 'paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth');
              }
              if (width <= 0 || height <= 0) {
                throw new Error("Frame does not have an actionable bounding box");
              }

              return {
                enterFrameCount,
                frameName: this.name || undefined,
                frameUrl: this.src || undefined,
                size: { height, width },
              };
            }`,
            objectId: elementId,
            returnByValue: true,
          },
          options,
        ),
        this.callCdpTarget(
          scope.target,
          "DOM.describeNode",
          { objectId: elementId },
          options,
        ),
      ]);
      if (metadataResponse.status === "fulfilled") {
        metadataId = metadataResponse.value.result?.objectId;
        metadataExceptionId =
          metadataResponse.value.exceptionDetails?.exception?.objectId;
      } else throw metadataResponse.reason;
      if (nodeResponse.status === "rejected") throw nodeResponse.reason;
      const metadata = playwrightEvaluationValue(
        metadataResponse.value,
      ) as FrameMetadata;
      const frameId =
        typeof nodeResponse.value.node.frameId === "string"
          ? nodeResponse.value.node.frameId
          : await this.frameIdForFrameMatch(scope.target, metadata, options);
      const target =
        isLocalFrameUrl(metadata.frameUrl) ||
        (frameId != null &&
          this.playwrightFrameWorlds.has(
            executionTargetKey(scope.target, frameId),
          ) &&
          this.cdp.targetForFrame(scope.target.tabId, frameId) == null)
          ? null
          : await this.targetForFrame(
              scope.target.tabId,
              frameId,
              {
                parentTarget: scope.target,
                ...(metadata.frameUrl != null
                  ? { url: metadata.frameUrl }
                  : {}),
              },
              options,
            );
      assertSelectorDeadline(options);
      if ((target == null || options.isolatedWorld === true) && frameId == null)
        throw new Error(unavailableFrameTarget);
      const entry = {
        frameId,
        parentTarget: scope.target,
        size: metadata.size,
      };
      const last = scope.oopifFrameChain[scope.oopifFrameChain.length - 1];
      const chain =
        last != null &&
        executionTargetKey(last.parentTarget) ===
          executionTargetKey(entry.parentTarget)
          ? [...scope.oopifFrameChain.slice(0, -1), entry]
          : [...scope.oopifFrameChain, entry];
      return {
        ...(frameId != null &&
        (target == null || options.isolatedWorld === true)
          ? { frameId }
          : {}),
        oopifFrameChain: chain,
        selector: remainingFrameSelector(selector, metadata.enterFrameCount),
        target: target ?? scope.target,
      };
    } finally {
      await this.releaseRuntimeObjects(
        scope.target,
        [elementId, exceptionId, metadataId, metadataExceptionId],
        options,
      );
    }
  }
  async frameIdForFrameMatch(
    target: CdpTarget,
    metadata: Pick<FrameMetadata, "frameUrl" | "frameName">,
    options: ExecutionOptions = {},
  ): Promise<string | null> {
    if (metadata.frameUrl == null) return null;
    const { frameTree } = await this.callCdpTarget(
      target,
      "Page.getFrameTree",
      undefined,
      options,
    );
    const matches = flattenFrameTree(frameTree).filter(
      (frame) =>
        frame.url === metadata.frameUrl &&
        (metadata.frameName == null || frame.name === metadata.frameName),
    );
    return matches.length !== 1 ? null : (matches[0]?.id ?? null);
  }
  async targetForFrame(
    tabId: number,
    frameId: string | null,
    metadata: { parentTarget: CdpTarget; url?: string },
    options: ExecutionOptions = {},
  ) {
    assertSelectorDeadline(options);
    return typeof this.cdp.targetForFrameOrAttach === "function"
      ? await this.cdp.targetForFrameOrAttach(tabId, frameId, options, metadata)
      : frameId == null
        ? null
        : this.cdp.targetForFrame!(tabId, frameId);
  }
}
