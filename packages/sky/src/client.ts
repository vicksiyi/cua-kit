import type * as Click from "./types/desktop/Click";
import type * as Drag from "./types/desktop/Drag";
import type * as Scroll from "./types/desktop/Scroll";
import type * as Move from "./types/desktop/Move";
import type * as TypeText from "./types/desktop/TypeText";
import type * as PressKey from "./types/desktop/PressKey";
import type * as Paste from "./types/desktop/Paste";
import type * as T from "./types/index";
import { load_options } from "./load_options";
import { invoke, create_drag_handle, type SkyRpcRequest, type SkyRpcRuntime } from "./sky_service_rpc";
import { WindowsComputerUseClient } from "./targets/windows/internal/computer_use_client";

export type DesktopClientOptions = { api: "desktop"; target?: "windows" };

/** Current desktop API entry: direct helper outside NodeREPL, owned client RPC inside. */
export async function create_client(options: DesktopClientOptions): Promise<T.Desktop.Client> {
  if (options.api !== "desktop") throw new Error("Only the desktop API is supported");
  const host: SkyRpcRuntime | undefined = (globalThis as any).nodeRepl;
  if (host === undefined) {
    const configured = load_options();
    if (!("api" in configured) || configured.api !== "desktop")
      throw new Error("The Sky configuration must enable the desktop API");
    if (configured.target !== "windows" || (options.target ?? configured.target) !== "windows")
      throw new Error("The desktop API requires Windows");
    return WindowsComputerUseClient.createDesktopClient({});
  }
  const { client_id, target } = await invoke(host, { type: "create", options });
  if (client_id == null || target !== "windows_desktop")
    throw new Error("Sky host does not support the requested desktop API");
  let closing: Promise<any> | undefined;
  function send(request: SkyRpcRequest) {
    return closing != null ? Promise.reject(new Error("Windows desktop client is closed")) : invoke(host, request);
  }
  const execute = (method: string, args: unknown[] = []) => send({ type: "execute", client_id, method, args });
  return {
    target: "windows_desktop" as const,
    get_screenshot: () => execute("get_screenshot"),
    click: (input: Click.Input) => execute("click", [input]),
    drag: (input: Drag.Input) => execute("drag", [input]),
    scroll: (input: Scroll.Input) => execute("scroll", [input]),
    move: (input: Move.Input) => execute("move", [input]),
    type_text: (input: TypeText.Input) => execute("type_text", [input]),
    press_key: (input: PressKey.Input) => execute("press_key", [input]),
    paste: (input: Paste.Input) => execute("paste", [input]),
    close: () => closing ??= invoke(host, { type: "execute", client_id, method: "close", args: [] }),
    drag_handle: () => create_drag_handle(request => send({ ...request, client_id })),
  };
}
