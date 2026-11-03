import { PlaywrightLocatorEvaluation } from "./locator_evaluation";
import { createInputTargetToken } from "../input/text_input";
import { focusPageElement } from "./focus";
import type { FocusOptions } from "./focus";
export interface LocatorRequest {
  tab_id: unknown;
  selector: string;
  timeout_ms?: number;
}
/** Original Dne. */
export function sequentialInputToken() {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `press-sequentially-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
/** Original ig.prepareLocatorFill callback, serialized without module dependencies. */
export function preparePageFill(
  element: any,
  injected: any,
  options: { states: string[]; value: string; inputTargetToken?: string },
) {
  for (const state of options.states) {
    const result = injected.elementState(element, state);
    if (result.received === "error:notconnected")
      throw new Error("Element is not connected");
    if (!result.matches) throw new Error("Element is not " + state);
  }
  element.scrollIntoView({ block: "center", inline: "nearest" });
  const result = injected.fill(element, options.value);
  if (result === "error:notconnected")
    throw new Error("Element is not connected");
  if (result !== "done" && result !== "needsinput") throw new Error(result);
  if (result === "done") return "done";
  const target =
    typeof injected.retarget === "function"
      ? injected.retarget(element, "follow-label")
      : element;
  if (target == null) throw new Error("Element is not connected");
  if (options.inputTargetToken != null)
    Object.defineProperty(target, "__codexIabInputTargetToken", {
      configurable: true,
      value: options.inputTargetToken,
      writable: true,
    });
  return result;
}
/** Original ig.prepareSequentialInput callback. */
export function preparePageSequentialInput(
  element: any,
  injected: any,
  options: { states: string[]; targetToken: string; inputTargetToken?: string },
) {
  for (const state of options.states) {
    const result = injected.elementState(element, state);
    if (result.received === "error:notconnected")
      throw new Error("Element is not connected");
    if (!result.matches) throw new Error("Element is not " + state);
  }
  element.scrollIntoView({ block: "center", inline: "nearest" });
  const target =
    typeof injected.retarget === "function"
      ? injected.retarget(element, "follow-label")
      : element;
  if (target == null) throw new Error("Element is not connected");
  if (!target.matches(":focus")) {
    const result = injected.focusNode(target, false);
    if (result !== "done") throw new Error(String(result));
  }
  Object.defineProperty(target, "__codexPressSequentiallyTargetToken", {
    configurable: true,
    value: options.targetToken,
  });
  if (options.inputTargetToken != null)
    Object.defineProperty(target, "__codexIabInputTargetToken", {
      configurable: true,
      value: options.inputTargetToken,
      writable: true,
    });
  return true;
}
/** Original ig input preparation and locator state operations. */
export class PlaywrightInputPreparation extends PlaywrightLocatorEvaluation {
  async focusLocator(request: LocatorRequest, options: FocusOptions) {
    const token = createInputTargetToken(
      this.isIabBackend || this.executionPolicy.documentOnly === true,
    );
    const { executionContextId, target } =
      await this.evaluateOnPlaywrightSelectorWithTarget(
        request.tab_id,
        request.selector,
        focusPageElement,
        {
          arg: {
            ...options,
            documentOnly: this.executionPolicy.documentOnly,
            inputTargetToken: token,
            retargetInput:
              options.requireEditable || options.selectText === true,
          },
          timeoutMs: request.timeout_ms,
        },
      );
    return {
      executionContextId,
      target,
      inputTargetToken: token,
      blockClosedShadowInput: this.isIabBackend,
    };
  }
  async prepareLocatorFill(request: LocatorRequest, value: string) {
    const token = createInputTargetToken(
        this.isIabBackend || this.executionPolicy.documentOnly === true,
      ),
      arg = {
        inputTargetToken: token,
        states: ["visible", "enabled", "editable"],
        value,
      };
    return {
      ...(await this.evaluateOnPlaywrightSelectorWithTarget(
        request.tab_id,
        request.selector,
        preparePageFill,
        { arg, timeoutMs: request.timeout_ms },
      )),
      inputTargetToken: token,
      blockClosedShadowInput: this.isIabBackend,
    };
  }
  async prepareSequentialInput(request: LocatorRequest, deadlineMs?: number) {
    const states = ["visible", "enabled", "editable"],
      targetToken = sequentialInputToken(),
      inputTargetToken = createInputTargetToken(
        this.isIabBackend || this.executionPolicy.documentOnly === true,
      ),
      arg = { inputTargetToken, states, targetToken };
    return {
      ...(await this.evaluateOnPlaywrightSelectorWithTarget(
        request.tab_id,
        request.selector,
        preparePageSequentialInput,
        { arg, deadlineMs, timeoutMs: request.timeout_ms },
      )),
      inputTargetToken,
      targetToken,
      blockClosedShadowInput: this.isIabBackend,
    };
  }
  async readCheckedState(request: LocatorRequest) {
    return await this.evaluateOnPlaywrightSelector(
      request.tab_id,
      request.selector,
      (element: any, injected: any) => {
        const state = injected.elementState(element, "checked");
        if (state.received === "error:notconnected")
          throw new Error("Element is not connected");
        return { checked: !!state.matches, isRadio: !!state.isRadio };
      },
      { timeoutMs: request.timeout_ms },
    );
  }
  async countLocator(request: LocatorRequest) {
    return await this.evaluateOnPlaywrightSelectorAll(
      request.tab_id,
      request.selector,
      (elements: any[]) => elements.length,
    );
  }
  async readElementState(request: LocatorRequest, stateName: string) {
    return await this.evaluateOnPlaywrightSelectorAll(
      request.tab_id,
      request.selector,
      (elements: any[], injected: any, options: { stateName: string }) => {
        const element = elements[0] ?? null;
        if (!element) return false;
        const state = injected.elementState(element, options.stateName);
        return state.received === "error:notconnected"
          ? false
          : !!state.matches;
      },
      { arg: { stateName }, timeoutMs: request.timeout_ms },
    );
  }
}
