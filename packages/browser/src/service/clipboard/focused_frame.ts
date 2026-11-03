import type { CdpTarget } from "../cdp/dispatch_helpers";
/** Original q5: this embedded page expression is already readable in the source bundle. */
export const focusedFrameExpression = `(() => {
  const focusedFrameElementInRoot = (root) => {
    const active = root.activeElement;
    if (active == null) return null;
    const activeWindow = active.ownerDocument.defaultView ?? window;
    if (active instanceof activeWindow.HTMLElement && active.shadowRoot != null)
      return focusedFrameElementInRoot(active.shadowRoot);
    if (
      active instanceof activeWindow.HTMLIFrameElement ||
      active instanceof activeWindow.HTMLFrameElement
    ) {
      try {
        const frameDocument =
          active.contentDocument ?? active.contentWindow?.document ?? null;
        if (frameDocument != null)
          return focusedFrameElementInRoot(frameDocument);
      } catch {}
      return active;
    }
    return null;
  };
  return focusedFrameElementInRoot(document);
})()`;
export interface ClipboardFocusTarget {
  target: CdpTarget;
  executionContextId?: number;
  inputTargetToken?: string;
}
interface Context {
  cdp: {
    callTarget(target: CdpTarget, method: string, params: object): Promise<any>;
    targetForFrameOrAttach(
      tabId: number,
      frameId: string,
    ): Promise<CdpTarget | undefined>;
  };
}
/** Original j5: inspect inaccessible focused frames, switching target or creating an isolated context. */
export async function resolveClipboardFocus(
  context: Context,
  tabId: number,
  initial: ClipboardFocusTarget = { target: { tabId } },
): Promise<ClipboardFocusTarget> {
  let current = initial;
  const seen = new Set<string>();
  for (;;) {
    const { target } = current;
    const key = `${target.sessionId ?? ""}:${target.targetId ?? ""}:${current.executionContextId ?? ""}`;
    if (seen.has(key))
      throw new Error("Browser Use encountered a focused frame cycle");
    seen.add(key);
    const evaluated = await context.cdp.callTarget(target, "Runtime.evaluate", {
      contextId: current.executionContextId,
      expression: focusedFrameExpression,
      returnByValue: false,
    });
    if (evaluated.exceptionDetails != null)
      throw new Error("Browser Use could not inspect the focused frame");
    const objectId = evaluated.result.objectId;
    if (objectId == null) return current;
    let frameId;
    try {
      const { node } = await context.cdp.callTarget(
        target,
        "DOM.describeNode",
        { objectId },
      );
      frameId = node.frameId;
    } finally {
      await context.cdp
        .callTarget(target, "Runtime.releaseObject", { objectId })
        .catch(() => {});
    }
    if (frameId == null) return current;
    const remote = await context.cdp.targetForFrameOrAttach(tabId, frameId);
    if (remote != null) {
      current = { target: remote };
      continue;
    }
    current = {
      executionContextId: (
        await context.cdp.callTarget(target, "Page.createIsolatedWorld", {
          frameId,
          grantUniveralAccess: false,
          worldName: "browser-use-virtual-clipboard",
        })
      ).executionContextId,
      target,
    };
  }
}
