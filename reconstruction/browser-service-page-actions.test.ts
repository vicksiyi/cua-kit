import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { originalServiceBindings } from "./service-source";
import {
  createPageActionDispatcher,
  createAxActionService,
} from "../packages/browser/src/service/accessibility/page_actions";
import {
  clickAccessibilityTarget,
  performSecondaryAction,
  setAccessibilityValue,
} from "../packages/browser/src/service/accessibility/click_action";
import {
  coordinateTarget,
  scrollAccessibilityTarget,
} from "../packages/browser/src/service/accessibility/scroll_action";
import { prepareAccessibilityInput } from "../packages/browser/src/service/accessibility/prepare_action";
import { dispatchAxText } from "../packages/browser/src/service/input/text_input";
import { clipboardKeys } from "../packages/browser/src/service/input/keyboard_dispatch";
import { clipboardShortcutError } from "../packages/browser/src/service/input/keyboard_keys";
import { keyboardDispatch } from "../packages/browser/src/service/input/index";
import { callElementFunction } from "../packages/browser/src/service/accessibility/element_execution";
import { selectElementText } from "../packages/browser/src/service/accessibility/selection";
async function outcome(fn: () => Promise<unknown>) {
  try {
    return { value: await fn() };
  } catch (e: any) {
    return { error: e.message };
  }
}
function setup(intercept: boolean) {
  const trace: any[] = [];
  const target = {
    id: 1,
    backendNodeId: 2,
    target: { tabId: 1 },
    frameId: "root",
    actionDescriptions: ["Expand"],
  };
  const cdp: any = new EventEmitter();
  Object.assign(cdp, {
    platform: "linux",
    getJsDialog: () => undefined,
    activeJsDialog: () => {
      throw Error("unexpected dialog");
    },
    async call(...args: any[]) {
      trace.push(["call", ...args]);
      return { cssVisualViewport: { clientWidth: 200, clientHeight: 100 } };
    },
    async callTarget(_target: any, method: string, params: any) {
      trace.push([
        "targetCall",
        method,
        {
          ...params,
          functionDeclaration: params.functionDeclaration
            ? "PAGE_FUNCTION"
            : undefined,
        },
      ]);
      if (method === "DOM.resolveNode") return { object: { objectId: "node" } };
      if (method === "DOM.getContentQuads")
        return { quads: [[0, 0, 100, 0, 100, 60, 0, 60]] };
      if (method === "Runtime.callFunctionOn")
        return {
          result: {
            value: params.functionDeclaration.includes("hitTestElement")
              ? {
                  point: { x: 50, y: 30 },
                  hitsTarget: true,
                  viewportSize: { width: 200, height: 100 },
                }
              : "done",
          },
        };
      return {};
    },
    waitForPageLoadEvent: () => Promise.resolve(),
    targetForFrameOrAttach: () => {
      throw Error("unexpected frame");
    },
  });
  const context: any = {
    browserId: "test",
    isIabBackend: false,
    cdp,
    ax: {
      targetForElement(tab: number, id: number) {
        trace.push(["target", tab, id]);
        return target;
      },
      frameForId: () => ({ frameId: "root", target: { tabId: 1 } }),
      trackDeferredPageLoad: () => {},
    },
    playwright: {
      async focusNode(node: any, options: any) {
        trace.push(["focus", node.id, options]);
        return {
          target: { tabId: 1 },
          executionContextId: 3,
          inputTargetToken: "token",
        };
      },
    },
    cua: {
      async clickPoint(request: any) {
        trace.push([
          "click",
          {
            ...request,
            signal: !!request.signal,
            deferPageLoadWait: typeof request.deferPageLoadWait,
          },
        ]);
      },
      async dragPath(request: any) {
        trace.push(["drag", request]);
      },
      async dispatchMouseMove(...args: any[]) {
        trace.push(["move", ...args]);
      },
    },
  };
  const clipboard = {
    async run(request: any) {
      trace.push([
        "clipboard",
        request.action,
        request.commandType,
        request.tabId,
        request.items,
      ]);
      trace.push(["clipboard-focus", await request.focusTarget(true)]);
    },
    async keypress(request: any) {
      trace.push([
        "shortcut",
        request.keypress,
        request.commandType,
        request.tabId,
      ]);
      if (intercept)
        trace.push(["shortcut-focus", await request.focusTarget(true)]);
      return intercept;
    },
  };
  return { context, trace, clipboard };
}
test("AX page dispatcher preserves every original action branch and clipboard boundaries", async () => {
  const actions = [
    { kind: "click", target: [10, 20], duration: 0.01 },
    { kind: "drag", from: [1, 2], to: [81, 42] },
    { kind: "perform_secondary_action", element_index: 1, action: "Expand" },
    { kind: "type_text", element_index: 1, text: "a😀\n" },
    { kind: "paste", element_index: 1, text: "text" },
    { kind: "paste", element_index: 1, text: "<b>x</b>", format: "html" },
    { kind: "press_key", element_index: 1, key: "a" },
    { kind: "press_key", key: "Control+c", duration: 1 },
    { kind: "scroll", target: [10, 20], direction: "down", pages: 2 },
    { kind: "select_text", element_index: 1, text: "x", prefix: "p" },
    { kind: "set_value", element_index: 1, value: "new" },
    { kind: "unsupported" },
  ];
  for (const action of actions)
    for (const intercept of [false, true]) {
      async function run(source: boolean) {
        const { context, trace, clipboard } = setup(intercept);
        const fn = source
          ? originalServiceBindings(["Tre"], {
              $v: clickAccessibilityTarget,
              Vh: coordinateTarget,
              Rre: performSecondaryAction,
              Hv: prepareAccessibilityInput,
              GA: dispatchAxText,
              Zy: clipboard.run,
              Ep: clipboardKeys,
              di: clipboardShortcutError,
              oo: clipboard.keypress,
              Os: keyboardDispatch.dispatchKeys,
              Pre: scrollAccessibilityTarget,
              Oo: callElementFunction,
              Nre: selectElementText,
              Ire: setAccessibilityValue,
            }).Tre
          : createPageActionDispatcher(clipboard);
        return {
          result: await outcome(() =>
            fn(context, 1, action, new AbortController().signal),
          ),
          trace,
        };
      }
      assert.deepEqual(
        await run(false),
        await run(true),
        JSON.stringify({ action, intercept }),
      );
    }
});
test("AX coordinator assembly executes page dispatch and releases tracked input", async () => {
  const { context, trace, clipboard } = setup(false);
  const Actions = createAxActionService(clipboard);
  const service = new Actions(context);
  await service.perform(1, { kind: "type_text", text: "a" });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.ok(
    trace.some(
      (entry) =>
        entry[0] === "targetCall" && entry[1] === "Input.dispatchKeyEvent",
    ),
  );
  assert.equal(service.pendingInput.size, 0);
  assert.equal(context.cdp.listenerCount("event"), 0);
});
