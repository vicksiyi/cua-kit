import { accessibility_tree } from "./targets/linux/accessibility_tree";
import type { SkyServiceRequest } from "./create_service";
type RuntimeClient = { target?: string; [name: string]: any };
/** Original sky.js module state, with a supplied direct-platform factory. */
export async function createSkyProxy(createDirectClient: () => RuntimeClient) {
  const runtime = (globalThis as any).nodeRepl;
  let setup: { target: string; methods: string[] } | undefined,
    setupError: unknown,
    client: RuntimeClient | undefined;
  if (typeof runtime?.rpc === "function")
    try {
      setup = await rpc({ type: "setup" });
    } catch (error) {
      setupError = error;
    }
  function resolveClient(): RuntimeClient {
    if (client != null) return client;
    if (runtime === undefined) return (client = createDirectClient());
    if (typeof runtime.rpc !== "function")
      throw new Error(
        "sky requires node_repl; configure NODE_REPL_TRUSTED_SERVICES",
      );
    const remote: RuntimeClient = { target: setup?.target };
    for (const method of setup?.methods ?? [])
      Reflect.set(remote, method, (...args: unknown[]) =>
        rpc({ type: "execute", method, args }),
      );
    if (remote.target === "linux" && setup?.methods.includes("drag_handle"))
      remote.drag_handle = () => {
        const handle = crypto.randomUUID();
        return {
          start: (point: any) =>
            rpc({ type: "drag_start", handle_id: handle, point }),
          move_to: (point: any) =>
            rpc({ type: "drag_move", handle_id: handle, point }),
          end: () => rpc({ type: "drag_end", handle_id: handle }),
        };
      };
    return (client = remote);
  }
  async function rpc(request: SkyServiceRequest): Promise<any> {
    if (typeof runtime?.rpc !== "function")
      throw new Error("Computer Use requires a trusted Node REPL Sky service");
    let value = await runtime.rpc("sky", request);
    if (request.type === "execute" && request.method === "get_screenshot")
      value = value.map(media);
    if (
      request.type === "execute" &&
      request.method === "get_window_state" &&
      setup?.target === "linux"
    )
      value = {
        ...value,
        ax_tree: accessibility_tree(value.ax_tree, value.focused_modal),
        screenshots: value.screenshots.map(media),
      };
    if (request.type === "execute" && request.method === "stop_audio_recording")
      value = media(value);
    return value ?? undefined;
  }
  const proxy = new Proxy({} as RuntimeClient, {
    get(_target, key) {
      const object = resolveClient(),
        value = Reflect.get(object, key);
      return typeof value === "function"
        ? value.bind(object)
        : key in object || setupError === undefined
          ? value
          : () => Promise.reject(setupError);
    },
    getOwnPropertyDescriptor(_target, key) {
      return Object.getOwnPropertyDescriptor(resolveClient(), key);
    },
    has(_target, key) {
      return key in resolveClient();
    },
    ownKeys() {
      return Object.keys(resolveClient());
    },
  });
  // Wrapping avoids Promise resolution treating an arbitrary remote "then" method as a thenable.
  return { sky: proxy };
}
function media(value: { filepath: string; data_url: string }) {
  const encoded = value.data_url.split(",")[1] ?? "",
    bytes = Buffer.from(encoded, "base64");
  return {
    filepath: value.filepath,
    bytes: Uint8Array.from(bytes),
    data_url: value.data_url,
  };
}
