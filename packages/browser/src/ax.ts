import { decodeBase64 } from "./runtime/base64";
import { StateCommand, ActionCommand } from "./commands/ax";
import type { ClientTransport } from "./runtime/function_agent_transport";
export type Point = [number, number];
export type AxTransport = ClientTransport;
type Mode = "state" | "screenshot" | "both";
type Capture = { mode: Mode; state?: string; screenshot?: Uint8Array };
export class AxClient {
  #browserId: string;
  #tabId: string;
  #transport: AxTransport;
  constructor({
    browserId,
    tabId,
    transport,
  }: {
    browserId: string;
    tabId: string;
    transport: AxTransport;
  }) {
    this.#browserId = browserId;
    this.#tabId = tabId;
    this.#transport = transport;
  }
  async get(mode: Mode = "state", options?: { disableDiffing?: boolean }) {
    const result = await this.#capture(mode, options);
    switch (result.mode) {
      case "state":
        return result.state;
      case "screenshot":
        return result.screenshot;
      case "both":
        return result.screenshot === undefined
          ? { state: result.state }
          : { state: result.state, screenshot: result.screenshot };
    }
  }
  async write(mode: Mode = "state", options?: { disableDiffing?: boolean }) {
    const result = await this.#capture(mode, options);
    if (result.mode !== "screenshot")
      await this.#transport.display(result.state!);
    if (result.mode !== "state" && result.screenshot !== undefined)
      await this.#transport.display(result.screenshot);
  }
  async click(
    target: number | Point,
    options?: {
      mouseButton?: string;
      clickCount?: number;
      key?: string;
      duration?: number;
    },
  ) {
    await this.#action({
      kind: "click",
      target,
      ...(options?.mouseButton === undefined
        ? {}
        : { mouse_button: options.mouseButton }),
      ...(options?.clickCount === undefined
        ? {}
        : { click_count: options.clickCount }),
      ...(options?.key === undefined ? {} : { key: options.key }),
      ...(options?.duration === undefined
        ? {}
        : { duration: options.duration }),
    });
  }
  async drag(from: Point, to: Point) {
    await this.#action({ kind: "drag", from, to });
  }
  async paste(
    index: number | null,
    text: string,
    options?: { format?: "text" | "md" | "html" },
  ) {
    await this.#action({
      kind: "paste",
      element_index: index,
      text,
      format: options?.format,
    });
  }
  async performSecondaryAction(index: number, action: string) {
    await this.#action({
      kind: "perform_secondary_action",
      element_index: index,
      action,
    });
  }
  async pressKey(
    index: number | null,
    key: string,
    options?: { duration?: number },
  ) {
    await this.#action({
      kind: "press_key",
      element_index: index,
      key,
      ...(options?.duration === undefined
        ? {}
        : { duration: options.duration }),
    });
  }
  async scroll(target: number | Point, direction: string, pages?: number) {
    await this.#action({
      kind: "scroll",
      target,
      direction,
      ...(pages === undefined ? {} : { pages }),
    });
  }
  async selectText(
    index: number,
    text: string,
    options?: { prefix?: string; suffix?: string; selectionType?: string },
  ) {
    await this.#action({
      kind: "select_text",
      element_index: index,
      text,
      ...(options?.prefix === undefined ? {} : { prefix: options.prefix }),
      ...(options?.suffix === undefined ? {} : { suffix: options.suffix }),
      ...(options?.selectionType === undefined
        ? {}
        : { selection_type: options.selectionType }),
    });
  }
  async setValue(index: number, value: string) {
    await this.#action({ kind: "set_value", element_index: index, value });
  }
  async typeText(index: number | null, text: string) {
    await this.#action({ kind: "type_text", element_index: index, text });
  }
  async #capture(
    mode: Mode,
    options?: { disableDiffing?: boolean },
  ): Promise<Capture> {
    const result = await this.#transport.send({
      command: StateCommand.create({
        browser_id: this.#browserId,
        tab_id: this.#tabId,
        content:
          mode === "state"
            ? "axState"
            : mode === "screenshot"
              ? "screenshot"
              : "axStateAndScreenshot",
        ...(options?.disableDiffing === undefined
          ? {}
          : { disable_diffing: options.disableDiffing }),
      }),
    });
    if (mode === "state") {
      if (typeof result.state !== "string")
        throw new Error("ax capture returned no accessibility state");
      return { mode, state: result.state };
    }
    if (typeof result.data !== "string") {
      if (
        mode === "both" &&
        typeof result.screenshot_unavailable === "string" &&
        typeof result.state === "string"
      )
        return { mode, state: result.state };
      throw new Error("ax capture returned no screenshot data");
    }
    const screenshot = decodeBase64(result.data);
    if (mode === "screenshot") return { mode, screenshot };
    if (typeof result.state !== "string")
      throw new Error("ax capture returned no accessibility state");
    return { mode, state: result.state, screenshot };
  }
  async #action(action: Record<string, unknown>) {
    await this.#transport.send({
      command: ActionCommand.create({
        browser_id: this.#browserId,
        tab_id: this.#tabId,
        action,
      }),
    });
  }
}
