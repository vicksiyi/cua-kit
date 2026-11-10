import { accessibility_tree } from "./targets/linux/accessibility_tree";

export type SkyRpcRequest = { type: string; method?: string; [name: string]: unknown };
export type SkyRpcRuntime = { rpc?: (service: string, request: SkyRpcRequest) => Promise<any> };

export function create_drag_handle<T>(send: (request: SkyRpcRequest) => Promise<T>) {
  const handle = crypto.randomUUID();
  return {
    start: (point: unknown) => send({ type: "drag_start", handle_id: handle, point }),
    move_to: (point: unknown) => send({ type: "drag_move", handle_id: handle, point }),
    end: () => send({ type: "drag_end", handle_id: handle }),
  };
}

/** Current shared sky_service_rpc.js; media is restored only for its methods. */
export async function invoke(runtime: SkyRpcRuntime | undefined, request: SkyRpcRequest, target?: string): Promise<any> {
  if (typeof runtime?.rpc !== "function")
    throw new Error("Computer Use requires a trusted Node REPL Sky service");
  let value = await runtime.rpc("sky", request);
  if (request.type === "execute" && request.method === "get_screenshot") value = value.map(media);
  if (request.type === "execute" && request.method === "get_window_state" && target === "linux") {
    value = { ...value, ax_tree: accessibility_tree(value.ax_tree, value.focused_modal), screenshots: value.screenshots.map(media) };
  }
  if (request.type === "execute" && request.method === "stop_audio_recording") value = media(value);
  return value ?? undefined;
}

function media(value: { filepath: string; data_url: string }) {
  return {
    filepath: value.filepath,
    data_url: value.data_url,
    bytes: Uint8Array.from(Buffer.from(value.data_url.split(",")[1] ?? "", "base64")),
  };
}
