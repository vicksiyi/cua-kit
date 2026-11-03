import { PlaywrightInjection } from "./injection";
import type { ExecutionCdp } from "./execution_state";
import type { PlaywrightNode } from "./node_execution";
import { retryLocator } from "./retry";
import type { LocatorTiming } from "./retry";
import { createInputTargetToken } from "../input/text_input";
export interface FocusOptions {
  requireEditable?: boolean;
  selectText?: boolean;
  documentOnly?: boolean;
  inputTargetToken?: string;
  retargetInput?: boolean;
  timeoutMs?: number;
}
/** Original _F. Serialized into the selected page world and relies on the actual injected helper. */
export async function focusPageElement(
  element: any,
  injected: any,
  options: FocusOptions,
): Promise<void> {
  for (
    let frame = element.ownerDocument.defaultView?.frameElement;
    !options.documentOnly && frame != null;
    frame = frame.ownerDocument.defaultView?.frameElement
  )
    if (!injected.elementState(frame, "visible").matches)
      throw new Error("Ancestor frame is not visible");
  const states = ["visible", "enabled"];
  if (options.requireEditable) states.push("editable");
  for (const state of states) {
    const result = injected.elementState(element, state);
    if (result.received === "error:notconnected")
      throw new Error("Element is not connected");
    if (!result.matches) throw new Error("Element is not " + state);
  }
  const target = options.retargetInput
    ? injected.retarget(element, "follow-label")
    : element;
  if (target == null) throw new Error("Element is not connected");
  element.scrollIntoView({ block: "center", inline: "nearest" });
  const focused = await injected.expect(target, {
      expression: "to.be.focused",
      isNot: false,
    }),
    result = options.selectText
      ? injected.selectText(target)
      : focused.matches
        ? "done"
        : injected.focusNode(target, false);
  if (result !== "done") throw new Error(String(result));
  if (
    !(
      await injected.expect(target, {
        expression: "to.be.focused",
        isNot: false,
      })
    ).matches
  )
    throw new Error("Element is not focused");
  if (options.inputTargetToken != null)
    Object.defineProperty(target, "__codexIabInputTargetToken", {
      configurable: true,
      value: options.inputTargetToken,
      writable: true,
    });
}
/** Original ig.focusNode, assembled with restored injection/node execution/retry. */
export class PlaywrightFocus extends PlaywrightInjection {
  constructor(
    cdp: ExecutionCdp,
    injectedSource: string,
    public commandTiming: LocatorTiming,
    public isIabBackend = false,
    public executionPolicy: { documentOnly?: boolean } = {},
  ) {
    super(cdp, injectedSource);
  }
  async focusNode(
    node: PlaywrightNode,
    options: FocusOptions & { timeoutMs: number },
  ) {
    const token = createInputTargetToken(
        this.isIabBackend || this.executionPolicy.documentOnly === true,
      ),
      startedAt = Date.now(),
      retry = {
        startedAt,
        timeoutMs: options.timeoutMs,
        deadlineMs: startedAt + options.timeoutMs,
      };
    return {
      ...(await retryLocator(
        "accessibility element",
        () =>
          this.evaluateOnPlaywrightNode(node, focusPageElement, {
            ...retry,
            arg: { ...options, inputTargetToken: token, retargetInput: false },
          }),
        retry,
        this.commandTiming,
      )),
      inputTargetToken: token,
      blockClosedShadowInput: this.isIabBackend,
    };
  }
}
