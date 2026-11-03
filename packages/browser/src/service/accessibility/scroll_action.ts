import { positionAccessibilityTarget } from "./position_target";
import type { GeometryContext, GeometryTarget } from "./target_geometry";
interface CoordinateContext {
  cdp: { call(tabId: number, method: string): Promise<any> };
}
/** Original ar/kre: array shape and finite values, without integer coercion. */
export function accessibilityPoint(value: unknown): { x: number; y: number } {
  if (!Array.isArray(value))
    throw new Error("Accessibility action requires an element index or point");
  const point = { x: value[0], y: value[1] };
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
    throw new Error("tab_ax_action requires finite x and y coordinates");
  return point;
}
/** Original Vh: viewport bounds are checked after point validation. */
export async function coordinateTarget(
  context: CoordinateContext,
  tabId: number,
  value: unknown,
) {
  const point = accessibilityPoint(value);
  const { cssVisualViewport: viewport } = await context.cdp.call(
    tabId,
    "Page.getLayoutMetrics",
  );
  if (
    point.x < 0 ||
    point.y < 0 ||
    point.x >= viewport.clientWidth ||
    point.y >= viewport.clientHeight
  )
    throw new Error("Coordinate is outside the active tab content viewport");
  return { height: viewport.clientHeight, point, width: viewport.clientWidth };
}
interface ScrollContext extends GeometryContext {
  ax: GeometryContext["ax"] & {
    targetForElement(tabId: number, id: number): GeometryTarget;
  };
  cdp: GeometryContext["cdp"] & {
    call(tabId: number, method: string, params?: object): Promise<any>;
  };
  cua: {
    dispatchMouseMove(
      tabId: number,
      point: { x: number; y: number },
      modifiers: number,
    ): Promise<unknown>;
  };
}
/** Original Pre: scroll page size has a 100px floor and uses top-level coordinates. */
export async function scrollAccessibilityTarget(
  context: ScrollContext,
  tabId: number,
  action: { target: number | number[]; direction: string; pages?: number },
): Promise<void> {
  const geometry =
    typeof action.target === "number"
      ? await positionAccessibilityTarget(
          context,
          tabId,
          context.ax.targetForElement(tabId, action.target),
        )
      : await coordinateTarget(context, tabId, action.target);
  const { point } = geometry;
  const horizontal = ["left", "l", "right", "r"].includes(action.direction);
  const distance =
    Math.max(horizontal ? geometry.width : geometry.height, 100) *
    (action.pages ?? 1);
  const delta = ["left", "l", "up", "u"].includes(action.direction)
    ? -distance
    : distance;
  await context.cua.dispatchMouseMove(tabId, point, 0);
  await context.cdp.call(tabId, "Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: point.x,
    y: point.y,
    deltaX: horizontal ? delta : 0,
    deltaY: horizontal ? 0 : delta,
  });
}
