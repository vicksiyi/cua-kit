import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { originalServiceBindings } from "./service-source";
import {
  clickAccessibilityTarget,
  performSecondaryAction,
} from "../packages/browser/src/service/accessibility/click_action";
import { clickKeys } from "../packages/browser/src/service/input/keyboard_keys";
import { assertOpenRoots } from "../packages/browser/src/service/input/input_guard";
import {
  keyboardDispatch,
  BrowserInput,
} from "../packages/browser/src/service/input/index";
import { callElementFunction } from "../packages/browser/src/service/accessibility/element_execution";
import {
  optionActivationMode,
  activateSelectOption,
} from "../packages/browser/src/service/accessibility/selection";
import {
  positionAccessibilityTarget,
  AccessibilityHitError,
} from "../packages/browser/src/service/accessibility/position_target";
import { activateAccessibilityTarget } from "../packages/browser/src/service/accessibility/prepare_action";
import { coordinateTarget } from "../packages/browser/src/service/accessibility/scroll_action";
const original = originalServiceBindings(["$v", "Rre"], {
  VA: clickKeys,
  Oc: assertOpenRoots,
  Oo: callElementFunction,
  Fre: optionActivationMode,
  Lre: activateSelectOption,
  V2: positionAccessibilityTarget,
  ou: AccessibilityHitError,
  Are: activateAccessibilityTarget,
  Vh: coordinateTarget,
  Ky: keyboardDispatch.withHeldKeys,
});
async function outcome(fn: () => Promise<unknown>) {
  try {
    return { value: await fn() };
  } catch (e: any) {
    return { error: e.message };
  }
}
test("assembled AX click matches source over real Chromium input, modifiers, fallback and protection", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 600, height: 400 },
    });
    const session = await page.context().newCDPSession(page);
    for (const mode of [
      "ordinary",
      "coordinate",
      "right",
      "modifier",
      "hidden-fallback",
      "closed-shadow",
      "aborted",
    ]) {
      async function run(fn: typeof clickAccessibilityTarget) {
        await page.setContent(
          '<button id="target" style="width:100px;height:60px">Click</button>',
        );
        await page.evaluate((mode) => {
          let target = document.querySelector("#target")!;
          if (mode === "hidden-fallback")
            (target as HTMLElement).style.display = "none";
          if (mode === "closed-shadow") {
            target.remove();
            const host = document.createElement("div");
            document.body.append(host);
            const root = host.attachShadow({ mode: "closed" });
            root.innerHTML = "<button>Protected</button>";
            target = root.firstElementChild!;
          }
          (window as any).target = target;
          (window as any).clicks = [];
          for (const type of ["click", "contextmenu"])
            target.addEventListener(type, (event: any) => {
              event.preventDefault();
              (window as any).clicks.push({
                type,
                button: event.button,
                shift: event.shiftKey,
              });
            });
        }, mode);
        const { result } = await session.send("Runtime.evaluate", {
          expression: "window.target",
        });
        const { node } = await session.send("DOM.describeNode", {
          objectId: result.objectId!,
        });
        await session.send("Runtime.releaseObject", {
          objectId: result.objectId!,
        });
        const { frameTree } = await session.send("Page.getFrameTree");
        const target = {
          id: 1,
          backendNodeId: node.backendNodeId,
          target: { tabId: 1 },
          frameId: frameTree.frame.id,
          actionDescriptions: ["Expand"],
        };
        const deferred: Promise<unknown>[] = [];
        const cdp: any = {
          platform: "linux",
          call: (_tab: any, method: string, params: any) =>
            session.send(method as any, params),
          callTarget: (_target: any, method: string, params: any) =>
            session.send(method as any, params),
          targetForFrameOrAttach: () => {
            throw Error("unexpected frame");
          },
          waitForPageLoadEvent: () => Promise.resolve(),
          addTabCleanupHandler: () => {},
        };
        const context: any = {
          isIabBackend: true,
          cdp,
          ax: {
            targetForElement: () => target,
            frameForId: () => ({
              frameId: frameTree.frame.id,
              target: { tabId: 1 },
            }),
            trackDeferredPageLoad: (_tab: any, p: Promise<unknown>) =>
              deferred.push(p),
          },
          playwright: {
            evaluateOnPlaywrightNode: () => {
              throw Error("unexpected option");
            },
          },
          cua: new BrowserInput(
            cdp,
            { moveMouse: async () => {} },
            "synthesizeScrollGesture",
            true,
          ),
        };
        const abort = new AbortController();
        if (mode === "aborted") abort.abort(Error("cancelled"));
        const resultValue = await outcome(() =>
          fn(context, 1, mode === "coordinate" ? [30, 30] : 1, {
            clickCount: 1,
            button: mode === "right" ? "r" : undefined,
            key: mode === "modifier" ? "Shift" : undefined,
            signal: abort.signal,
          }),
        );
        await Promise.all(deferred);
        return {
          result: resultValue,
          clicks: await page.evaluate(() => (window as any).clicks),
        };
      }
      const actual = await run(clickAccessibilityTarget);
      assert.deepEqual(actual, await run(original.$v), mode);
      if (mode === "closed-shadow" || mode === "aborted")
        assert.equal(actual.clicks.length, 0);
      else assert.equal(actual.clicks.length, 1, mode);
    }
  } finally {
    await browser.close();
  }
});
test("secondary actions preserve unsupported action checks before clicking", async () => {
  const context: any = {
    ax: { targetForElement: () => ({ actionDescriptions: ["Expand"] }) },
  };
  for (const action of ["Collapse", "Other"])
    assert.deepEqual(
      await outcome(() =>
        performSecondaryAction(context, 1, { element_index: 2, action }),
      ),
      await outcome(() =>
        original.Rre(context, 1, { element_index: 2, action }),
      ),
    );
});

test("simple option clicks use the injected node selector without dispatching physical input", async () => {
  async function run(fn: typeof clickAccessibilityTarget) {
    const trace: any[] = [];
    const target = {
      id: 1,
      isOptionElement: true,
      target: { tabId: 1 },
      backendNodeId: 3,
      frameId: "root",
    };
    const context: any = {
      isIabBackend: false,
      cdp: {
        platform: "linux",
        async callTarget(_target: any, method: string, params: any) {
          trace.push(method);
          if (method === "DOM.resolveNode")
            return { object: { objectId: "node" } };
          if (method === "Runtime.releaseObject") return {};
          return { result: { value: "select-option" } };
        },
      },
      ax: { targetForElement: () => target },
      playwright: {
        async evaluateOnPlaywrightNode(node: any, fn: Function) {
          trace.push(["select", node.id, fn === activateSelectOption]);
        },
      },
      cua: {
        clickPoint: () => {
          throw Error("unexpected physical click");
        },
      },
    };
    return {
      result: await outcome(() => fn(context, 1, 1, { clickCount: 1 })),
      trace,
    };
  }
  assert.deepEqual(await run(clickAccessibilityTarget), await run(original.$v));
});
