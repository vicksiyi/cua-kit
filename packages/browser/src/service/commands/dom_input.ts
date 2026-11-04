import { defineCommand } from "./define_command";
import { DomCuaClick } from "../../commands/cua_input";
import { positiveTabId } from "../tab_id";
import {
  dispatchClipboardKeypress,
  type ClipboardContext,
} from "../clipboard/operations";
import type { BrowserInput } from "../input/index";
import type {
  createTextPaste,
  TextPasteContext,
  TextPasteRequest,
} from "../input/text_paste";
export interface DomInputContext {
  acquireAuthority(): {
    actInFrame(url: unknown): { assert(): Promise<unknown> };
  };
  security: { currentTabUrl(tabId: number): Promise<unknown> };
  followSessionTab(tabId: number): Promise<unknown>;
  cua: Pick<
    InstanceType<typeof BrowserInput>,
    "clickDomCuaNode" | "scrollDomCuaNode" | "scrollPoint" | "dispatchKeyPress"
  >;
  cdp: { call(tabId: number, method: string): Promise<any> };
}
/** Original AN/Nh/CN. Undefined optional nodes differ from null/invalid nodes. */
export function domInputNode(value: unknown, command: string, required = true) {
  if (value === undefined) {
    if (required) throw new Error(`${command} requires node_id`);
    return undefined;
  }
  const parsed = DomCuaClick.DomNodeIdSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(
      `${command} ${parsed.error.issues[0]?.message ?? "has an invalid node_id"}`,
    );
  return parsed.data;
}
function clickCommand(command: string, count: number) {
  return defineCommand(
    command,
    async (
      payload: { tab_id: unknown; node_id?: unknown; timeout_ms?: number },
      context: DomInputContext,
    ) => {
      await context
        .acquireAuthority()
        .actInFrame(
          await context.security.currentTabUrl(Number(payload.tab_id)),
        )
        .assert();
      await context.followSessionTab(Number(payload.tab_id));
      const nodeId = domInputNode(payload.node_id, command);
      await context.cua.clickDomCuaNode({
        clickCount: count,
        nodeId,
        tabId: positiveTabId(payload.tab_id),
        timeoutMs: payload.timeout_ms,
      });
      return {};
    },
  );
}
/** Original PN/RN. */
export const DomCuaClickCommand = clickCommand("dom_cua_click", 1);
export const DomCuaDoubleClickCommand = clickCommand("dom_cua_double_click", 2);
/** Original kN/yte: absent node scrolls the visual viewport center. */
export const DomCuaScrollCommand = defineCommand(
  "dom_cua_scroll",
  async (
    payload: {
      tab_id: unknown;
      node_id?: unknown;
      scroll_x: number;
      scroll_y: number;
    },
    context: DomInputContext,
  ) => {
    const tabId = positiveTabId(payload.tab_id);
    await context
      .acquireAuthority()
      .actInFrame(await context.security.currentTabUrl(tabId))
      .assert();
    await context.followSessionTab(tabId);
    const nodeId = domInputNode(payload.node_id, "dom_cua_scroll", false);
    if (nodeId != null) {
      await context.cua.scrollDomCuaNode({
        nodeId,
        scrollX: payload.scroll_x,
        scrollY: payload.scroll_y,
        tabId,
      });
      return {};
    }
    const { cssVisualViewport } = await context.cdp.call(
      tabId,
      "Page.getLayoutMetrics",
    );
    await context.cua.scrollPoint({
      modifiers: 0,
      point: {
        x: cssVisualViewport.clientWidth / 2,
        y: cssVisualViewport.clientHeight / 2,
      },
      scrollX: payload.scroll_x,
      scrollY: payload.scroll_y,
      tabId,
    });
    return {};
  },
);
/** Original IN: only key arrays enter virtual clipboard shortcut interception. */
export const DomCuaKeypressCommand = defineCommand(
  "dom_cua_keypress",
  async (
    payload: { tab_id: string | number; keys: string[] | string },
    context: DomInputContext & ClipboardContext,
  ) => {
    await context
      .acquireAuthority()
      .actInFrame(await context.security.currentTabUrl(Number(payload.tab_id)))
      .assert();
    await context.followSessionTab(Number(payload.tab_id));
    if (
      Array.isArray(payload.keys) &&
      (await dispatchClipboardKeypress({
        commandType: "dom_cua_keypress",
        ctx: context,
        keypress: payload.keys,
        tabId: payload.tab_id,
      }))
    )
      return {};
    await context.cua.dispatchKeyPress({
      commandName: "dom_cua_keypress",
      keys: payload.keys,
      tabId: payload.tab_id,
    });
    return {};
  },
);
/** Original Tv, using explicit Hs dependency until bundled markdown renderer is assembled. */
export function createDomCuaTypeCommand(
  typeText: ReturnType<typeof createTextPaste>["typeText"],
) {
  const command = defineCommand(
    "dom_cua_type",
    async (
      payload: TextPasteRequest,
      context: DomInputContext & TextPasteContext,
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
