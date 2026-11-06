import { CuaKeypress } from "../../commands/cua_input";
import { defineCommand } from "./define_command";
import { positiveTabId } from "../tab_id";
import { modifierMask } from "../input/keyboard_keys";
import {
  dispatchClipboardKeypress,
  type ClipboardContext,
} from "../clipboard/operations";
import type { BrowserInput } from "../input/index";
import type { DomInputContext } from "./dom_input";
import type {
  createTextPaste,
  TextPasteContext,
  TextPasteRequest,
} from "../input/text_paste";
export interface CoordinateInputContext extends Omit<DomInputContext, "cua"> {
  runtime: { platform: string };
  cua: Pick<
    InstanceType<typeof BrowserInput>,
    | "clickPoint"
    | "dragPath"
    | "dispatchMouseMove"
    | "scrollPoint"
    | "dispatchKeyPress"
  >;
}
interface Point {
  x: number;
  y: number;
}
interface PointerPayload extends Point {
  tab_id: unknown;
  keys?: string[];
  button?: number;
}
/** Original ar: coordinates are finite numbers; no coercion or viewport clamping. */
export function assertCoordinates(command: string, point: Point) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
    throw new Error(`${command} requires finite x and y coordinates`);
}
/** Original FA. */
export function mouseButton(button?: number) {
  switch (button) {
    case undefined:
    case 1:
      return "left";
    case 2:
      return "middle";
    case 3:
      return "right";
    default:
      throw new Error(`Unsupported CUA mouse button: ${button}`);
  }
}
function clickCommand(name: string, count: number) {
  return defineCommand(
    name,
    async (payload: PointerPayload, context: CoordinateInputContext) => {
      const tabId = positiveTabId(payload.tab_id);
      await context
        .acquireAuthority()
        .actInFrame(await context.security.currentTabUrl(tabId))
        .assert();
      await context.followSessionTab(tabId);
      assertCoordinates(name, payload);
      await context.cua.clickPoint({
        ...(count === 1 ? { button: mouseButton(payload.button) } : {}),
        clickCount: count,
        modifiers: modifierMask(payload.keys, context.runtime.platform),
        point: { x: payload.x, y: payload.y },
        tabId,
        timeoutMs: 10000,
      });
      return {};
    },
  );
}
/** Original LA/UA. */
export const CuaClickCommand = clickCommand("cua_click", 1);
export const CuaDoubleClickCommand = clickCommand("cua_double_click", 2);
/** Original qA: resolve modifiers before validating the nonempty path. */
export const CuaDragCommand = defineCommand(
  "cua_drag",
  async (
    payload: { tab_id: unknown; keys?: string[]; path: Point[] },
    context: CoordinateInputContext,
  ) => {
    const tabId = positiveTabId(payload.tab_id);
    await context
      .acquireAuthority()
      .actInFrame(await context.security.currentTabUrl(tabId))
      .assert();
    await context.followSessionTab(tabId);
    const modifiers = modifierMask(payload.keys, context.runtime.platform);
    if (payload.path.length === 0)
      throw new Error("cua_drag requires a non-empty path");
    for (const point of payload.path) assertCoordinates("cua_drag", point);
    await context.cua.dragPath({ modifiers, path: payload.path, tabId });
    return {};
  },
);
/** Original YA deliberately does not follow the session tab. */
export const CuaMoveCommand = defineCommand(
  "cua_move",
  async (payload: PointerPayload, context: CoordinateInputContext) => {
    const tabId = positiveTabId(payload.tab_id);
    await context
      .acquireAuthority()
      .actInFrame(await context.security.currentTabUrl(tabId))
      .assert();
    assertCoordinates("cua_move", payload);
    await context.cua.dispatchMouseMove(
      tabId,
      { x: payload.x, y: payload.y },
      modifierMask(payload.keys, context.runtime.platform),
    );
    return {};
  },
);
/** Original JA. */
export const CuaScrollCommand = defineCommand(
  "cua_scroll",
  async (
    payload: PointerPayload & { scroll_x: number; scroll_y: number },
    context: CoordinateInputContext,
  ) => {
    const tabId = positiveTabId(payload.tab_id);
    await context
      .acquireAuthority()
      .actInFrame(await context.security.currentTabUrl(tabId))
      .assert();
    await context.followSessionTab(tabId);
    assertCoordinates("cua_scroll", payload);
    const modifiers = modifierMask(payload.keys, context.runtime.platform);
    const point = { x: payload.x, y: payload.y };
    await context.cua.scrollPoint({
      modifiers,
      point,
      scrollX: payload.scroll_x,
      scrollY: payload.scroll_y,
      tabId,
    });
    return {};
  },
);
/** Current TD: only zero/omitted duration enters clipboard interception; held keys use native dispatch. */
export const CuaKeypressCommand = defineCommand(
  "cua_keypress",
  async (
    payload: {
      tab_id: string | number;
      keys: string[] | string;
      duration?: number;
    },
    context: CoordinateInputContext & ClipboardContext,
  ) => {
    await context
      .acquireAuthority()
      .actInFrame(await context.security.currentTabUrl(Number(payload.tab_id)))
      .assert();
    const duration = CuaKeypress.PayloadSchema.shape.duration.parse(
      payload.duration,
    );
    await context.followSessionTab(Number(payload.tab_id));
    if (
      !duration &&
      Array.isArray(payload.keys) &&
      (await dispatchClipboardKeypress({
        commandType: "cua_keypress",
        ctx: context,
        keypress: payload.keys,
        tabId: payload.tab_id,
      }))
    )
      return {};
    await context.cua.dispatchKeyPress({
      commandName: "cua_keypress",
      keys: payload.keys,
      durationMs: duration ? duration * 1000 : undefined,
      tabId: payload.tab_id,
    });
    return {};
  },
);
/** Original n_; actual Hs is injected until its bundled markdown renderer is assembled. */
export function createCuaTypeCommand(
  typeText: ReturnType<typeof createTextPaste>["typeText"],
) {
  const command = defineCommand(
    "cua_type",
    async (
      payload: TextPasteRequest,
      context: CoordinateInputContext & TextPasteContext,
    ) => {
      await context
        .acquireAuthority()
        .actInFrame(
          await context.security.currentTabUrl(Number(payload.tab_id)),
        )
        .assert();
      await context.followSessionTab(Number(payload.tab_id));
      await typeText(payload, context, command.type);
      return {};
    },
  );
  return command;
}
