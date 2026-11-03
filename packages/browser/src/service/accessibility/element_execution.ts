import type { CdpTarget } from "../cdp/dispatch_helpers";
import { setElementValue } from "./set_value";

export interface AccessibilityTarget {
  id: number;
  target: CdpTarget;
  backendNodeId: number;
  isValueSettable?: boolean;
}
export interface AccessibilityExecutionContext {
  cdp: {
    callTarget(target: CdpTarget, method: string, params: object): Promise<any>;
  };
}
/** Original Oo: resolve per operation, invoke as a user gesture, always release the remote object. */
export async function callElementFunction<T, R>(
  context: AccessibilityExecutionContext,
  target: AccessibilityTarget,
  fn: (this: any, argument: T) => R,
  argument: T,
): Promise<R> {
  const { object } = await context.cdp.callTarget(
    target.target,
    "DOM.resolveNode",
    {
      backendNodeId: target.backendNodeId,
    },
  );
  const objectId = object.objectId;
  if (objectId == null)
    throw new Error(`Could not resolve accessibility element ${target.id}`);
  try {
    const response = await context.cdp.callTarget(
      target.target,
      "Runtime.callFunctionOn",
      {
        arguments: [{ value: argument }],
        functionDeclaration: `function (argument) { const __name = (target) => target; return (${fn.toString()}).call(this, argument); }`,
        objectId,
        returnByValue: true,
        userGesture: true,
      },
    );
    if (response.exceptionDetails != null) {
      const exception = response.exceptionDetails.exception;
      throw new Error(
        String(
          exception?.description ??
            exception?.value ??
            response.exceptionDetails.text ??
            "Accessibility action failed",
        ),
      );
    }
    return response.result.value;
  } finally {
    await context.cdp
      .callTarget(target.target, "Runtime.releaseObject", { objectId })
      .catch(() => {});
  }
}
export interface AccessibilityValueContext extends AccessibilityExecutionContext {
  ax: {
    targetForElement(tabId: number, elementId: number): AccessibilityTarget;
  };
}
/** Original Ire. The full $v click implementation is a required dependency, never a permissive fallback. */
export function createSetAccessibilityValue(
  click: (
    context: AccessibilityValueContext,
    tabId: number,
    elementId: number,
    options: { clickCount: number },
  ) => Promise<unknown>,
) {
  return async function setAccessibilityValue(
    context: AccessibilityValueContext,
    tabId: number,
    elementId: number,
    value: string,
  ): Promise<void> {
    const target = context.ax.targetForElement(tabId, elementId);
    if (target.isValueSettable === false)
      throw new Error(
        `Accessibility element ${elementId} has no settable value`,
      );
    if (
      (await callElementFunction(context, target, setElementValue, {
        value,
      })) === "needs-click"
    ) {
      await click(context, tabId, elementId, { clickCount: 1 });
      if (
        (await callElementFunction(context, target, setElementValue, {
          value,
        })) !== "done"
      )
        throw new Error("Tab did not become selected");
      return;
    }
  };
}
