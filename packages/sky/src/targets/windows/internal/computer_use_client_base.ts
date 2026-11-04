import type * as T from "../../../types/window2/index";
import { from_filepath, to_data_url } from "../../../core/uint8";
import { codexTurnMetadataFromRequestMeta } from "./codex_turn_metadata";
import {
  appIdentifier,
  integerId,
  requireWindow,
  parseWindow,
  parseWindows,
  parseState,
  coordinate,
  clickCount,
  elementIndex,
  optionalString,
  optionalNumber,
  put,
} from "./window_protocol";
export type WindowsComputerUseTransport = {
  close: () => Promise<void>;
  request: (
    method: string,
    params: Record<string, unknown>,
    options?: { codexTurnMetadata?: unknown },
  ) => Promise<unknown>;
};
type Turn = { session_id: string; turn_id: string; metadata: unknown };
function suspended<T>(run: () => Promise<T>): Promise<T> {
  const suspend = (globalThis as any).nodeRepl?.withSuspendedTimeout;
  return typeof suspend !== "function" ? Promise.resolve(run()) : suspend(run);
}
export class WindowsComputerUseClientBase implements T.Client {
  readonly target = "windows";
  #active: Turn | null = null;
  #closed = false;
  #ending: Turn | null = null;
  #remove: (() => void) | undefined;
  #transport: WindowsComputerUseTransport;
  constructor(args: { transport: WindowsComputerUseTransport }) {
    this.#transport = args.transport;
    const host = (globalThis as any).nodeRepl;
    this.#remove = host?.addTurnEndedHandler?.({
      timeoutMs: 4000,
      run: async (turn: Turn) => {
        const active = this.#active;
        if (
          !this.#closed &&
          active != null &&
          this.#ending !== active &&
          active.session_id === turn.session_id &&
          active.turn_id === turn.turn_id
        ) {
          this.#ending = active;
          try {
            await this.#transport.request(
              "end_turn",
              {},
              { codexTurnMetadata: active.metadata },
            );
            if (this.#active === active) this.#active = null;
          } finally {
            if (this.#ending === active) this.#ending = null;
          }
        }
      },
    });
    if (process.env.SKY_ENABLE_AUDIO !== "1") {
      Reflect.deleteProperty(this, "start_audio_recording");
      Reflect.deleteProperty(this, "stop_audio_recording");
    }
  }
  async close() {
    if (!this.#closed) {
      this.#closed = true;
      this.#remove?.();
      this.#active = null;
      this.#ending = null;
      await this.closeTransport();
    }
  }
  protected closeTransport() {
    return suspended(() => this.#transport.close());
  }
  #request(method: string, params: Record<string, unknown>) {
    if (this.#closed)
      return Promise.reject(new Error("Windows computer-use client is closed"));
    const metadata = codexTurnMetadataFromRequestMeta();
    this.#active = null;
    if (metadata != null && typeof metadata === "object") {
      const session_id = Reflect.get(metadata, "session_id"),
        turn_id = Reflect.get(metadata, "turn_id");
      if (
        typeof session_id === "string" &&
        session_id.trim() !== "" &&
        typeof turn_id === "string" &&
        turn_id.trim() !== ""
      )
        this.#active = { session_id, turn_id, metadata };
    }
    return suspended(() =>
      this.#transport.request(method, params, { codexTurnMetadata: metadata }),
    );
  }
  activate_window = async ({ window }: T.ActivateWindow.Input) => {
    await this.#request("activate_window", { window: requireWindow(window) });
  };
  get_window_state = async ({
    include_screenshot = true,
    include_text = false,
    window,
  }: T.GetWindowState.Input) => {
    if (!include_screenshot && !include_text)
      throw new TypeError(
        "get_window_state must request include_text, include_screenshot, or both",
      );
    const normalized = requireWindow(window),
      result = parseState(
        await this.#request("get_window_state", {
          window: normalized,
          include_screenshot,
          include_text,
        }),
        normalized,
        include_screenshot,
      );
    for (const screenshot of result.screenshots) {
      const host = globalThis as any;
      if (host.nodeRepl?.emitImage != null)
        await host.nodeRepl.emitImage(screenshot.url);
      else if (host.codex?.emitImage != null)
        await host.codex.emitImage({
          type: "input_image",
          image_url: screenshot.url,
          detail: "original",
        });
    }
    return result;
  };
  start_audio_recording = async (args: T.StartAudioRecording.Input = {}) => {
    await this.#request("start_audio_recording", {
      max_duration_ms: args.max_duration_ms,
    });
  };
  stop_audio_recording = async () => {
    const result = await this.#request("stop_audio_recording", {});
    if (typeof result !== "object" || result == null)
      throw new Error("codex-computer-use.exe did not return computer audio");
    const filepath = Reflect.get(result, "filepath");
    if (typeof filepath !== "string" || filepath.length === 0)
      throw new Error(
        "codex-computer-use.exe did not return a computer audio filepath",
      );
    const bytes = await from_filepath(filepath);
    return { filepath, bytes, data_url: to_data_url(bytes, "audio/wav") };
  };
  click = async (
    input: T.Click.Input & { element?: unknown; elementIndex?: unknown },
  ) => {
    const {
        window,
        click_count = 1,
        element_index,
        mouse_button = "left",
        screenshotId,
        x,
        y,
      } = input,
      normalized = requireWindow(window),
      element = element_index ?? input.elementIndex ?? input.element;
    if (element == null) {
      if (x == null || y == null)
        throw new TypeError(
          "click requires either element_index or finite x and y coordinates",
        );
      await this.#request("click", {
        window: normalized,
        x: coordinate(x, "point.x"),
        y: coordinate(y, "point.y"),
        ...(screenshotId != null ? { screenshotId } : {}),
        click_count: clickCount(click_count),
        mouse_button,
      });
    } else
      await this.#request("click_element", {
        window: normalized,
        element_index: elementIndex(element),
        click_count: clickCount(click_count),
        mouse_button,
      });
  };
  scroll = async ({
    scrollX,
    scrollY,
    screenshotId,
    window,
    x,
    y,
  }: T.Scroll.Input) => {
    await this.#request("scroll", {
      window: requireWindow(window),
      x: coordinate(x, "scroll.x"),
      y: coordinate(y, "scroll.y"),
      ...(screenshotId != null ? { screenshotId } : {}),
      scrollX: coordinate(scrollX, "scroll.scrollX"),
      scrollY: coordinate(scrollY, "scroll.scrollY"),
    });
  };
  drag = async ({
    window,
    from_x,
    from_y,
    to_x,
    to_y,
    screenshotId,
  }: T.Drag.Input) => {
    await this.#request("drag", {
      window: requireWindow(window),
      from_x: coordinate(from_x, "from.x"),
      from_y: coordinate(from_y, "from.y"),
      to_x: coordinate(to_x, "to.x"),
      to_y: coordinate(to_y, "to.y"),
      ...(screenshotId != null ? { screenshotId } : {}),
    });
  };
  press_key = async ({ window, key }: T.PressKey.Input) => {
    if (!key) throw new TypeError("key is required");
    const normalized = requireWindow(window),
      parts = key
        .split("+")
        .map((p) => p.trim())
        .filter(Boolean);
    if (parts.length === 0) throw new TypeError("key is required");
    await this.#request("press_key", {
      window: normalized,
      key: parts.join("+"),
    });
  };
  type_text = async ({ window, text }: T.TypeText.Input) => {
    if (typeof text !== "string") throw new TypeError("text is required");
    await this.#request("type_text", { window: requireWindow(window), text });
  };
  launch_app = async (input: T.LaunchApp.Input) => {
    const app = appIdentifier(
      typeof input === "object" && input != null
        ? Reflect.get(input, "app")
        : undefined,
    );
    if (app == null) throw new TypeError("app is required");
    await this.#request("launch_app", { app });
  };
  list_apps = async (): Promise<T.ListApps.App[]> => {
    const result = await this.#request("list_apps", {});
    return Array.isArray(result)
      ? result
          .map((value) => {
            if (value == null || typeof value !== "object") return null;
            const id = Reflect.get(value, "id");
            if (typeof id !== "string" || id.trim() === "") return null;
            const app: T.ListApps.App = {
              id,
              windows: parseWindows(Reflect.get(value, "windows"), id),
            };
            put(
              app,
              "displayName",
              optionalString(Reflect.get(value, "displayName")),
            );
            put(
              app,
              "lastUsedDate",
              optionalString(Reflect.get(value, "lastUsedDate")),
            );
            put(
              app,
              "useCount",
              optionalNumber(Reflect.get(value, "useCount")),
            );
            const running = Reflect.get(value, "isRunning");
            put(
              app,
              "isRunning",
              typeof running === "boolean" ? running : undefined,
            );
            return app;
          })
          .filter((value) => value != null)
      : [];
  };
  list_windows = async () =>
    parseWindows(await this.#request("list_windows", {}));
  get_window = async (input: T.GetWindow.Input) => {
    if (typeof input !== "object" || input == null || Array.isArray(input))
      throw new TypeError("get_window input must be an object");
    const id = integerId(Reflect.get(input, "id"));
    if (id == null) throw new TypeError("id must be an integer >= 0");
    const app = appIdentifier(Reflect.get(input, "app"));
    const result = parseWindow(
      await this.#request("get_window", app == null ? { id } : { app, id }),
    );
    if (result == null)
      throw new Error("codex-computer-use.exe did not return a window");
    return result;
  };
  perform_secondary_action = async ({
    window,
    action,
    element_index,
  }: T.PerformSecondaryAction.Input) => {
    if (typeof action !== "string" || action.trim() === "")
      throw new TypeError("action is required");
    await this.#request("perform_secondary_action", {
      window: requireWindow(window),
      element_index: elementIndex(element_index),
      action,
    });
  };
  set_value = async ({ window, element_index, value }: T.SetValue.Input) => {
    if (typeof value !== "string") throw new TypeError("value is required");
    await this.#request("set_value", {
      window: requireWindow(window),
      element_index: elementIndex(element_index),
      value,
    });
  };
}
