import { UnreachableCaseError } from "@core/core/UnreachableCaseError";
import { require_audio_model_support } from "./require_audio_model_support";
export type Point = { x: number; y: number };
export type SkyServiceRequest =
  | { type: "setup" }
  | { type: "execute"; method: string; args: unknown[] }
  | { type: "drag_start" | "drag_move"; handle_id: string; point: Point }
  | { type: "drag_end"; handle_id: string };
export type WireMedia = { filepath: string; data_url: string };
export type DragHandle = {
  start(point: Point): Promise<unknown>;
  move_to(point: Point): Promise<unknown>;
  end(): Promise<unknown>;
};
export interface ServiceClient {
  target: string;
  drag_handle?: () => DragHandle;
  [method: string]: unknown;
}
/** Restored service.js closure; the public service supplies the platform factory. */
export function createSkyService(createClient: () => ServiceClient) {
  let client: ServiceClient | undefined;
  const handles = new Map<string, DragHandle>();
  const wireMedia = (media: WireMedia): WireMedia => ({
    filepath: media.filepath,
    data_url: media.data_url,
  });
  async function handleRpc(request: SkyServiceRequest): Promise<unknown> {
    if (client == null) client = createClient();
    switch (request.type) {
      case "setup":
        return {
          target: client.target,
          methods: Object.keys(client).filter(
            (name) => typeof Reflect.get(client!, name) === "function",
          ),
        };
      case "execute": {
        const method = Object.getOwnPropertyDescriptor(
          client,
          request.method,
        )?.value;
        if (typeof method !== "function")
          throw new Error(
            `Sky runtime method is not available: ${request.method}`,
          );
        if (request.method === "start_audio_recording") {
          const runtime = (globalThis as any).nodeRepl;
          require_audio_model_support({
            model_allowlist: process.env.SKY_AUDIO_MODEL_ALLOWLIST,
            request_meta: runtime?.requestMeta,
          });
        }
        const result = await method.call(client, ...request.args);
        if (request.method === "get_screenshot") return result.map(wireMedia);
        if (request.method === "get_window_state" && client.target === "linux")
          return { ...result, screenshots: result.screenshots.map(wireMedia) };
        if (request.method === "stop_audio_recording") return wireMedia(result);
        return result;
      }
      case "drag_start": {
        if (client.target !== "linux")
          throw new Error("Sky drag handles require the Linux runtime");
        const handle = handles.get(request.handle_id) ?? client.drag_handle!();
        await handle.start(request.point);
        handles.set(request.handle_id, handle);
        return;
      }
      case "drag_move": {
        const handle = handles.get(request.handle_id);
        if (handle == null)
          throw new Error("Sky drag handle has not been started");
        return handle.move_to(request.point);
      }
      case "drag_end": {
        const handle = handles.get(request.handle_id);
        if (handle == null)
          throw new Error("Sky drag handle has not been started");
        await handle.end();
        handles.delete(request.handle_id);
        return;
      }
      default:
        throw new UnreachableCaseError(request as never);
    }
  }
  return { handleRpc };
}
