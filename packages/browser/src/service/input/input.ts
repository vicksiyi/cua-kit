import { positiveTabId } from "../tab_id";
import { isNestedTarget } from "../cdp/dispatch_helpers";
interface Point {
  x: number;
  y: number;
}
interface Cdp {
  platform: string;
  targetForFrameOrAttach(...args: any[]): Promise<any>;
  addTabCleanupHandler(handler: (tabId: number) => void): unknown;
  call(...args: any[]): Promise<any>;
  callTarget(...args: any[]): Promise<any>;
  waitForPageLoadEvent(...args: any[]): Promise<any>;
}
interface Ui {
  moveMouse(...args: any[]): Promise<any>;
}
/** These source dependencies must be supplied; no permissive substitutes are installed. */
export interface InputDependencies {
  dispatchKeys(
    cdp: Cdp,
    tabId: number,
    keys: string[],
    options: any,
  ): Promise<void>;
  resolveDomNode(
    tabId: number,
    cdp: Cdp,
    nodeId: string,
    blockClosedShadowInput: boolean,
  ): Promise<{ inputPoint: Point; point: Point; target: any }>;
  assertInputPoint(
    cdp: Cdp,
    target: any,
    point: Point,
    options: any,
    topLevelPoint?: Point,
  ): Promise<void>;
}
/** Original Ve. */
export function inputTimeout(options: { timeout_ms?: number; max?: number }) {
  const timeout =
    typeof options.timeout_ms === "number" ? options.timeout_ms : 3000;
  return Math.min(Math.max(0, timeout), options.max || 3000);
}
/** Original Xy. */
export async function inputDelay(duration: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (duration !== 0) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", abort);
        resolve();
      }, duration);
      function abort() {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        reject(signal?.reason);
      }
      signal?.addEventListener("abort", abort, { once: true });
    });
    signal?.throwIfAborted();
  }
}
export function mouseButtonMask(button: string) {
  switch (button) {
    case "right":
      return 2;
    case "middle":
      return 4;
    case "left":
      return 1;
  }
}
export function quadCenter(quad?: number[] | null) {
  if (quad == null || quad.length < 8) return null;
  const [x1, y1, x2, y2, x3, y3, x4, y4] = quad;
  return { x: (x1 + x2 + x3 + x4) / 4, y: (y1 + y2 + y3 + y4) / 4 };
}
/** Original cg. Factory keeps the original constructor while its external helpers are restored separately. */
export function createInputClass(dependencies: InputDependencies) {
  return class BrowserInput {
    cdp: Cdp;
    ui: Ui;
    scrollMethod: string;
    blockClosedShadowInput: boolean;
    constructor(
      cdp: Cdp,
      ui: Ui,
      scrollMethod = "synthesizeScrollGesture",
      blockClosedShadowInput = false,
    ) {
      this.cdp = cdp;
      this.ui = ui;
      this.scrollMethod = scrollMethod;
      this.blockClosedShadowInput = blockClosedShadowInput;
    }
    async dispatchKeyPress(request: any) {
      if (!Array.isArray(request.keys) || request.keys.length === 0)
        throw new Error(
          `${request.commandName} requires a non-empty keys array`,
        );
      await dependencies.dispatchKeys(
        this.cdp,
        positiveTabId(request.tabId),
        request.keys,
        {
          blockClosedShadowInput: this.blockClosedShadowInput,
          durationMs: request.durationMs,
        },
      );
    }
    async dispatchMouseMove(tabId: number, point: Point, modifiers: number) {
      await this.ui.moveMouse(tabId, point.x, point.y);
      await this.cdp.call(tabId, "Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: point.x,
        y: point.y,
        button: "none",
        buttons: 0,
        modifiers,
      });
    }
    async getBackendNodeViewportPoint(tabId: number, nodeId: number) {
      await this.cdp.call(tabId, "DOM.scrollIntoViewIfNeeded", {
        backendNodeId: nodeId,
      });
      try {
        const { quads } = await this.cdp.call(tabId, "DOM.getContentQuads", {
          backendNodeId: nodeId,
        });
        const point = quadCenter(quads[0]);
        if (point != null) return point;
      } catch {}
      const { model } = await this.cdp.call(tabId, "DOM.getBoxModel", {
          backendNodeId: nodeId,
        }),
        point = quadCenter(model.border);
      if (point == null)
        throw new Error(`Missing DOM geometry for backend node ${nodeId}`);
      return point;
    }
    async clickDomCuaNode(request: any) {
      const { inputPoint, point, target } = await dependencies.resolveDomNode(
          request.tabId,
          this.cdp,
          request.nodeId,
          this.blockClosedShadowInput,
        ),
        nested = isNestedTarget(target);
      await this.clickPoint({
        clickCount: request.clickCount,
        ...(nested
          ? { inputPoint, inputTarget: target, loadTarget: target }
          : {}),
        modifiers: 0,
        point,
        tabId: request.tabId,
        timeoutMs:
          request.timeoutMs == null
            ? undefined
            : inputTimeout({ timeout_ms: request.timeoutMs }),
      });
    }
    async scrollDomCuaNode(request: any) {
      const { point } = await dependencies.resolveDomNode(
        request.tabId,
        this.cdp,
        request.nodeId,
        this.blockClosedShadowInput,
      );
      await this.scrollPoint({
        modifiers: 0,
        point,
        scrollX: request.scrollX,
        scrollY: request.scrollY,
        tabId: request.tabId,
      });
    }
    async dragPath(request: any) {
      const tabId = positiveTabId(request.tabId),
        [first, ...rest] = request.path.map((point: Point) =>
          this.mouseInputPoint(point),
        );
      if (!first) throw new Error("cua_drag requires a non-empty path");
      const button = "left";
      await this.dispatchMouseMove(tabId, first, request.modifiers);
      await this.dispatchMouseDown({
        button,
        clickCount: 1,
        modifiers: request.modifiers,
        point: first,
        target: { tabId },
      });
      let last = first,
        released = false;
      try {
        for (const point of rest) {
          if (this.blockClosedShadowInput)
            await dependencies.assertInputPoint(this.cdp, { tabId }, point, {});
          last = point;
          await this.dispatchPressedMouseMove(
            tabId,
            point,
            button,
            request.modifiers,
          );
        }
        if (this.blockClosedShadowInput)
          await dependencies.assertInputPoint(this.cdp, { tabId }, last, {});
        released = true;
        await this.dispatchMouseUp({
          button,
          clickCount: 1,
          modifiers: request.modifiers,
          point: last,
          target: { tabId },
        });
      } finally {
        if (!released) {
          if (this.blockClosedShadowInput)
            try {
              await dependencies.assertInputPoint(
                this.cdp,
                { tabId },
                last,
                {},
              );
            } catch {
              last = { x: -1, y: -1 };
            }
          await this.dispatchMouseUp({
            button,
            clickCount: 1,
            modifiers: request.modifiers,
            point: last,
            target: { tabId },
          }).catch(() => {});
        }
      }
    }
    async scrollPoint(request: any) {
      const tabId = positiveTabId(request.tabId);
      await this.dispatchMouseMove(tabId, request.point, request.modifiers);
      if (this.scrollMethod === "mouseWheel") {
        await this.cdp.call(tabId, "Input.dispatchMouseEvent", {
          type: "mouseWheel",
          x: request.point.x,
          y: request.point.y,
          deltaX: request.scrollX,
          deltaY: request.scrollY,
          modifiers: request.modifiers,
        });
        return;
      }
      const xDistance = request.scrollX === 0 ? 0 : -request.scrollX,
        yDistance = request.scrollY === 0 ? 0 : -request.scrollY;
      await this.cdp.call(tabId, "Input.synthesizeScrollGesture", {
        x: request.point.x,
        y: request.point.y,
        xDistance,
        yDistance,
        gestureSourceType: "mouse",
        preventFling: true,
        speed: 8000,
      });
    }
    async clickPoint(request: any) {
      const tabId = positiveTabId(request.tabId),
        duration = request.durationMs ?? 0,
        timeout =
          inputTimeout({ timeout_ms: request.timeoutMs }) +
          duration * request.clickCount,
        deadline = Date.now() + timeout,
        button = request.button ?? "left",
        point = this.mouseInputPoint(request.inputPoint ?? request.point),
        target = request.inputTarget ?? { tabId };
      const loading =
        request.loadTarget == null || !isNestedTarget(request.loadTarget)
          ? this.cdp.waitForPageLoadEvent(tabId, { timeoutMs: timeout })
          : Promise.all([
              this.cdp.waitForPageLoadEvent(request.loadTarget, {
                timeoutMs: timeout,
              }),
              this.cdp.waitForPageLoadEvent(tabId, {
                rejectSubframeNavigationBlocked: true,
                timeoutMs: timeout,
              }),
            ]);
      const settled = loading.catch(() => {});
      try {
        await this.ui.moveMouse(tabId, request.point.x, request.point.y);
        await this.dispatchCdpMouseMove({
          deadlineMs: deadline,
          modifiers: request.modifiers,
          point,
          target,
        });
        for (
          let clickCount = 1;
          clickCount <= request.clickCount;
          clickCount++
        ) {
          request.signal?.throwIfAborted();
          let pressed = false,
            releasing: Promise<void> | undefined;
          const release = (releasePoint: Point, deadlineMs?: number) =>
            (releasing ??= this.dispatchMouseUp({
              button,
              clickCount,
              deadlineMs,
              modifiers: request.modifiers,
              point: releasePoint,
              target,
            }));
          const abort = () => {
            if (pressed) release({ x: -1, y: -1 }).catch(() => {});
          };
          request.signal?.addEventListener("abort", abort, { once: true });
          try {
            await this.dispatchMouseDown({
              button,
              clickCount,
              deadlineMs: deadline,
              modifiers: request.modifiers,
              point,
              target,
              topLevelPoint: this.mouseInputPoint(request.point),
              onDispatch: () => {
                request.signal?.throwIfAborted();
                pressed = true;
              },
            });
            if (duration > 0) await inputDelay(duration, request.signal);
            if (duration > 0 && this.blockClosedShadowInput)
              await dependencies.assertInputPoint(
                this.cdp,
                target,
                point,
                { deadlineMs: deadline },
                this.mouseInputPoint(request.point),
              );
            request.signal?.throwIfAborted();
            await release(point, deadline);
          } finally {
            request.signal?.removeEventListener("abort", abort);
            if (pressed) await release({ x: -1, y: -1 }).catch(() => {});
          }
        }
      } catch (error) {
        await settled;
        throw error;
      }
      if (request.deferPageLoadWait != null) {
        request.deferPageLoadWait(loading.then(() => {}));
        return;
      }
      await loading;
    }
    mouseInputPoint(point: Point) {
      return this.blockClosedShadowInput
        ? { x: Math.round(point.x), y: Math.round(point.y) }
        : point;
    }
    async dispatchCdpMouseMove(request: any) {
      await this.cdp.callTarget(
        request.target,
        "Input.dispatchMouseEvent",
        {
          type: "mouseMoved",
          x: request.point.x,
          y: request.point.y,
          button: "none",
          buttons: 0,
          modifiers: request.modifiers,
        },
        { deadlineMs: request.deadlineMs },
      );
    }
    async dispatchMouseDown(request: any) {
      if (this.blockClosedShadowInput)
        await dependencies.assertInputPoint(
          this.cdp,
          request.target,
          request.point,
          { deadlineMs: request.deadlineMs },
          request.topLevelPoint,
        );
      request.onDispatch?.();
      await this.cdp.callTarget(
        request.target,
        "Input.dispatchMouseEvent",
        {
          type: "mousePressed",
          x: request.point.x,
          y: request.point.y,
          button: request.button,
          buttons: mouseButtonMask(request.button),
          clickCount: request.clickCount,
          modifiers: request.modifiers,
        },
        { deadlineMs: request.deadlineMs },
      );
    }
    async dispatchMouseUp(request: any) {
      await this.dispatchCdpMouseRelease(request);
    }
    async dispatchPressedMouseMove(
      tabId: number,
      point: Point,
      button: string,
      modifiers: number,
    ) {
      await this.ui.moveMouse(tabId, point.x, point.y, {
        waitForArrival: false,
      });
      await this.cdp.call(tabId, "Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: point.x,
        y: point.y,
        button,
        buttons: mouseButtonMask(button),
        modifiers,
      });
    }
    async dispatchCdpMouseRelease(request: any) {
      await this.cdp.callTarget(
        request.target,
        "Input.dispatchMouseEvent",
        {
          type: "mouseReleased",
          x: request.point.x,
          y: request.point.y,
          button: request.button,
          buttons: 0,
          clickCount: request.clickCount,
          modifiers: request.modifiers,
        },
        { deadlineMs: request.deadlineMs },
      );
    }
  };
}
