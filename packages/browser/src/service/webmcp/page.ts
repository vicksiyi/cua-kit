interface NativeTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: unknown;
  annotations?: unknown;
  origin: string;
  window: Window;
}
interface NativeContext {
  getTools(): Promise<NativeTool[]>;
  executeTool(...args: any[]): Promise<unknown>;
  addEventListener(type: string, listener: () => void): void;
}
type ModelDocument = Document & { modelContext?: NativeContext };
interface ReadToolsOptions {
  frameUrl: string;
  generation: number;
  pageUrl: string;
  staleRegistrationError: string;
  useChromiumCrashWorkaround: boolean;
}
interface InvokeToolOptions {
  registrationId: string;
  generation: number;
  inputJson: string;
  timeoutMs?: number;
  staleRegistrationError: string;
}
/** Restored readable native-tools/page modules embedded in original xv. Self-contained for serialization. */
export function createWebMcpPage() {
  async function readNativeWebMcpFrameTools() {
    const modelContext = Reflect.get(document, "modelContext");
    if (
      !modelContext ||
      typeof modelContext.getTools !== "function" ||
      globalThis.origin === "null"
    )
      return [];
    try {
      return (await modelContext.getTools()).filter(
        (tool: NativeTool) => tool.window === window && tool.origin !== "null",
      );
    } catch (error) {
      if (
        error != null &&
        typeof error === "object" &&
        "name" in error &&
        (error.name === "NotAllowedError" || error.name === "SecurityError")
      )
        return [];
      throw error;
    }
  }
  function describeNativeWebMcpTool(tool: NativeTool) {
    return {
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema:
        typeof tool.inputSchema === "string"
          ? JSON.parse(tool.inputSchema)
          : (tool.inputSchema ?? null),
      annotations: tool.annotations,
      origin: tool.origin,
    };
  }

  // ../browser-client/src/webmcp/page.ts
  var NATIVE_STATE_KEY = "__codexNativeWebMcpState";
  var WEBMCP_PROBE_FRAME_NAME =
    "codex-webmcp-probe-97adecab-75be-4770-bbe4-654cac643843";
  async function readTools({
    frameUrl,
    generation,
    pageUrl,
    staleRegistrationError,
    useChromiumCrashWorkaround,
  }: ReadToolsOptions) {
    if (location.href !== frameUrl) throw new Error(staleRegistrationError);
    const modelContext = useChromiumCrashWorkaround
      ? await getNativeWebMcpContext()
      : (document as ModelDocument).modelContext;
    if (
      !modelContext ||
      typeof modelContext.getTools !== "function" ||
      globalThis.origin === "null"
    )
      return [];
    const state = Reflect.get(globalThis, NATIVE_STATE_KEY) ?? {
      handles: /* @__PURE__ */ new Map(),
      registrationIds: /* @__PURE__ */ new Map(),
      generation,
      listening: false,
    };
    Reflect.set(globalThis, NATIVE_STATE_KEY, state);
    if (state.generation !== generation) {
      if (state.generation > generation)
        throw new Error(staleRegistrationError);
      state.handles.clear();
      state.registrationIds = /* @__PURE__ */ new Map();
      state.generation = generation;
    }
    if (!state.listening) {
      modelContext.addEventListener("toolchange", () => {
        state.handles.clear();
        state.registrationIds = /* @__PURE__ */ new Map();
      });
      state.listening = true;
    }
    const registrations = state.registrationIds;
    const tools = await readNativeWebMcpFrameTools();
    if (location.href !== frameUrl || registrations !== state.registrationIds)
      throw new Error(staleRegistrationError);
    return tools.map((tool: NativeTool) => {
      const metadata = describeNativeWebMcpTool(tool);
      const descriptor = toolDescriptor(tool);
      let id = registrations.get(tool.name);
      if (id != null && state.handles.get(id)?.descriptor !== descriptor) {
        state.handles.delete(id);
        id = void 0;
      }
      if (id == null) {
        id = crypto.randomUUID();
        registrations.set(tool.name, id);
      }
      state.handles.set(id, { tool, descriptor });
      return {
        name: tool.name,
        call_name: tool.name + "__" + id,
        registration_id: id,
        title: tool.title,
        description: tool.description,
        input_schema: metadata.inputSchema,
        annotations: tool.annotations,
        origin: tool.origin,
        // Guardian needs the top-level page URL separately from the actual tool owner.
        pageUrl,
      };
    });
  }
  async function invokeTool({
    registrationId,
    generation,
    inputJson,
    timeoutMs,
    staleRegistrationError,
  }: InvokeToolOptions) {
    const modelContext = (document as ModelDocument).modelContext;
    const state = Reflect.get(globalThis, NATIVE_STATE_KEY);
    const handle = state?.handles.get(registrationId);
    const tool = handle?.tool;
    if (!modelContext || !state || !tool || state.generation !== generation)
      throw new Error(staleRegistrationError);
    if (globalThis.origin === "null" || tool.origin === "null")
      throw new Error("Opaque-origin WebMCP tools are not allowed.");
    const registrations = state.registrationIds;
    const tools = await modelContext.getTools();
    if (
      registrations !== state.registrationIds ||
      !state.handles.has(registrationId) ||
      !tools.some(
        (current: NativeTool) =>
          current.window === window &&
          current.window === tool.window &&
          current.name === tool.name &&
          current.origin === tool.origin &&
          toolDescriptor(current) === handle?.descriptor,
      )
    )
      throw new Error(staleRegistrationError);
    const arity = modelContext.executeTool.length;
    if (arity !== 1 && arity !== 2)
      throw new Error("Unsupported native WebMCP executeTool signature.");
    const input = JSON.parse(inputJson);
    return await modelContext.executeTool(
      tool,
      arity === 2 ? JSON.stringify(input) : input,
      timeoutMs == null ? void 0 : { signal: AbortSignal.timeout(timeoutMs) },
    );
  }
  async function getNativeWebMcpContext() {
    if (
      !("modelContext" in document) ||
      globalThis.origin === "null" ||
      document.documentElement == null
    )
      return;
    const ownerDocument = document;
    const host = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    host.style.setProperty("display", "none", "important");
    const frame = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "iframe",
    ) as HTMLIFrameElement;
    frame.name = WEBMCP_PROBE_FRAME_NAME;
    host.attachShadow({ mode: "closed" }).append(frame);
    try {
      document.documentElement.append(host);
      if (frame.contentDocument == null) return;
      const probe = Reflect.get(frame.contentDocument, "modelContext");
      if (probe == null || typeof probe.getTools !== "function") return;
      const tools = await probe.getTools();
      if (
        ownerDocument === document &&
        tools.some(
          (tool: NativeTool) =>
            tool.window === window && tool.origin !== "null",
        )
      )
        return (ownerDocument as ModelDocument).modelContext;
    } catch (error) {
      if (
        error != null &&
        typeof error === "object" &&
        "name" in error &&
        (error.name === "NotAllowedError" || error.name === "SecurityError")
      )
        return;
      throw error;
    } finally {
      host.remove();
    }
  }
  function toolDescriptor(tool: NativeTool) {
    return JSON.stringify([
      tool.name,
      tool.origin,
      tool.title,
      tool.description,
      describeNativeWebMcpTool(tool).inputSchema,
      tool.annotations,
    ]);
  }

  return Object.defineProperties(
    {},
    {
      __esModule: { value: true },
      WEBMCP_PROBE_FRAME_NAME: {
        get: () => WEBMCP_PROBE_FRAME_NAME,
        enumerable: true,
      },
      readTools: { get: () => readTools, enumerable: true },
      invokeTool: { get: () => invokeTool, enumerable: true },
    },
  ) as {
    WEBMCP_PROBE_FRAME_NAME: string;
    readTools: typeof readTools;
    invokeTool: typeof invokeTool;
  };
}
/** Preserve the original webMcp script binding; supply build-time name helper for serialization. */
export function webMcpPageScript() {
  return `"use strict";\nvar webMcp = (() => { const __name = (target) => target; return (${createWebMcpPage.toString()})(); })();`;
}
