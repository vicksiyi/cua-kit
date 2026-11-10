import { UnreachableCaseError } from "@core/core/UnreachableCaseError";
import { require_audio_model_support } from "./require_audio_model_support";
export type Point = { x: number; y: number };
export type SkyServiceRequest = (
  | { type: "create"; options: { api: string; target?: string } }
  | { type: "setup" }
  | { type: "execute"; method: string; args: unknown[] }
  | { type: "drag_start" | "drag_move"; handle_id: string; point: Point }
  | { type: "drag_end"; handle_id: string }
) & { client_id?: string };
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
export function createSkyService(createClient: (options?: { target: string; api?: unknown }) => ServiceClient, dependencies: {
  loadOptions?: () => { target: string; api?: unknown };
  createDesktopClient?: () => ServiceClient;
} = {}) {
  let client: ServiceClient | undefined;
  type HandleState = { handle: DragHandle; starting: boolean };
  const handles = new Map<string, HandleState>();
  let options: { target: string; api?: unknown } | undefined;
  let desktop: { id: string; client: ServiceClient; handles: Map<string, HandleState> } | undefined;
  const wireMedia = (media: WireMedia): WireMedia => ({
    filepath: media.filepath,
    data_url: media.data_url,
  });
  async function handleRpc(request: SkyServiceRequest): Promise<unknown> {
    options ??= dependencies.loadOptions?.() ?? { target: "fixture" };
    const desktopMode = options.target === "windows" && "api" in options && options.api === "desktop";
    if (request.type === "create") {
      if (!desktopMode) throw new Error("The Sky configuration must enable the desktop API");
      if (request.options?.api !== "desktop") throw new Error("Only the desktop API is supported");
      if ((request.options.target ?? options.target) !== "windows") throw new Error("The desktop API requires Windows");
      if (desktop != null) throw new Error("A Windows desktop session is already active");
      const entry = { id: crypto.randomUUID(), client: dependencies.createDesktopClient!(), handles: new Map<string, HandleState>() };
      desktop = entry;
      return { target: entry.client.target, client_id: entry.id };
    }
    const id = "client_id" in request ? request.client_id : undefined;
    if (desktopMode && id == null) throw new Error("The configured desktop API requires create_client({ api: 'desktop' })");
    const entry = id == null ? undefined : desktop;
    if (id != null && entry?.id !== id) throw new Error("Sky client is unknown or closed");
    const current = entry == null ? (client ??= createClient(options)) : entry.client;
    if (request.type === "execute" && request.method === "close" && entry != null) {
      entry.handles.clear();
      await (entry.client.close as () => Promise<unknown>).call(entry.client);
      if (desktop === entry) desktop = undefined;
      return;
    }
    const activeHandles = entry?.handles ?? handles;
    switch (request.type) {
      case "setup":
        return {
          target: current.target,
          methods: Object.keys(current).filter(
            (name) => typeof Reflect.get(current, name) === "function",
          ),
        };
      case "execute": {
        const method = Object.getOwnPropertyDescriptor(
          current,
          request.method,
        )?.value;
        if (typeof method !== "function" || request.method === "drag_handle")
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
        const result = await method.call(current, ...request.args);
        if (request.method === "get_screenshot") return result.map(wireMedia);
        if (request.method === "get_window_state" && current.target === "linux")
          return { ...result, screenshots: result.screenshots.map(wireMedia) };
        if (request.method === "stop_audio_recording") return wireMedia(result);
        return result;
      }
      case "drag_start": {
        if (current.target !== "linux" && current.target !== "windows_desktop")
          throw new Error("Sky drag handles require a desktop runtime");
        if (activeHandles.has(request.handle_id)) throw new Error("drag handle can only be started once");
        const state = { handle: current.drag_handle!(), starting: true };
        activeHandles.set(request.handle_id, state);
        try { await state.handle.start(request.point); state.starting = false; }
        catch (error) { if (activeHandles.get(request.handle_id) === state) activeHandles.delete(request.handle_id); throw error; }
        return;
      }
      case "drag_move":
      case "drag_end": {
        const state = activeHandles.get(request.handle_id);
        if (state == null) throw new Error("Sky drag handle has not been started");
        if (state.starting) throw new Error("Sky drag handle is still starting");
        try {
          if (request.type === "drag_move") return await state.handle.move_to(request.point);
          await state.handle.end();
          if (activeHandles.get(request.handle_id) === state) activeHandles.delete(request.handle_id);
        } catch (error) {
          if (current.target === "windows_desktop" && activeHandles.get(request.handle_id) === state) activeHandles.delete(request.handle_id);
          throw error;
        }
        return;
      }
      default:
        throw new UnreachableCaseError(request as never);
    }
  }
  return { handleRpc };
}
