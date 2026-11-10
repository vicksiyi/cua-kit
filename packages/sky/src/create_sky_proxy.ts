import { invoke, create_drag_handle } from "./sky_service_rpc";
import type { SkyRpcRequest } from "./sky_service_rpc";
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
      remote.drag_handle = () => create_drag_handle(rpc);
    return (client = remote);
  }
  async function rpc(request: SkyRpcRequest): Promise<any> {
    return invoke(runtime, request, setup?.target);
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
