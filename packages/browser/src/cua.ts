import {
  CuaClick,
  CuaScroll,
  CuaDoubleClick,
  CuaType,
  CuaKeypress,
  CuaDrag,
  CuaMove,
  CuaDownloadMedia,
} from "./commands/cua_input";
import type { ClientTransport } from "./runtime/function_agent_transport";
type Position = { x: number; y: number };
/** Original Gl (current installed client). Local typeof checks deliberately do not replace command schema parsing. */
export class CUAAPI {
  #browserId: string;
  #tabId: string;
  #transport: ClientTransport;
  constructor({
    browserId,
    tabId,
    transport,
  }: {
    browserId: string;
    tabId: string;
    transport: ClientTransport;
  }) {
    this.#browserId = browserId;
    this.#tabId = tabId;
    this.#transport = transport;
  }
  async click(options: Position & { button?: number; keypress?: string[] }) {
    if (typeof options?.x !== "number" || typeof options?.y !== "number")
      throw new Error("cua.click requires x and y");
    await this.#transport.send({
      command: CuaClick.create({
        browser_id: this.#browserId,
        tab_id: this.#tabId,
        x: options.x,
        y: options.y,
        button: options.button,
        keys: options.keypress,
      }),
    });
  }
  async scroll(
    options: Position & {
      scrollX: number;
      scrollY: number;
      keypress?: string[];
    },
  ) {
    if (
      typeof options?.x !== "number" ||
      typeof options?.y !== "number" ||
      typeof options?.scrollX !== "number" ||
      typeof options?.scrollY !== "number"
    )
      throw new Error("cua.scroll requires x, y, scrollX, and scrollY");
    await this.#transport.send({
      command: CuaScroll.create({
        browser_id: this.#browserId,
        tab_id: this.#tabId,
        x: options.x,
        y: options.y,
        scroll_x: options.scrollX,
        scroll_y: options.scrollY,
        keys: options.keypress,
      }),
    });
  }
  async double_click(options: Position & { keypress?: string[] }) {
    if (typeof options?.x !== "number" || typeof options?.y !== "number")
      throw new Error("cua.double_click requires x and y");
    await this.#transport.send({
      command: CuaDoubleClick.create({
        browser_id: this.#browserId,
        tab_id: this.#tabId,
        x: options.x,
        y: options.y,
        keys: options.keypress,
      }),
    });
  }
  async type(options: { text: string }) {
    if (typeof options?.text !== "string")
      throw new Error("cua.type requires text");
    await this.#transport.send({
      command: CuaType.create({
        browser_id: this.#browserId,
        tab_id: this.#tabId,
        text: options.text,
      }),
    });
  }
  async keypress(options: { keys: string[]; duration?: number }) {
    if (!Array.isArray(options?.keys) || options.keys.length === 0)
      throw new Error("cua.keypress requires a non-empty keys array");
    const duration = CuaKeypress.PayloadSchema.shape.duration.parse(
      options.duration,
    );
    await this.#transport.send({
      command: CuaKeypress.create({
        browser_id: this.#browserId,
        tab_id: this.#tabId,
        keys: options.keys,
        duration,
      }),
      timeoutMs: duration ? Math.ceil(1000 * duration) + 2000 : undefined,
    });
  }
  async drag(options: { path: Position[]; keys?: string[] }) {
    if (
      !Array.isArray(options?.path) ||
      options.path.length === 0 ||
      options.path.some(
        (point) => typeof point?.x !== "number" || typeof point?.y !== "number",
      )
    )
      throw new Error("cua.drag requires a non-empty path of {x, y} points");
    await this.#transport.send({
      command: CuaDrag.create({
        browser_id: this.#browserId,
        tab_id: this.#tabId,
        path: options.path,
        keys: options.keys,
      }),
    });
  }
  async move(options: Position & { keys?: string[] }) {
    if (typeof options?.x !== "number" || typeof options?.y !== "number")
      throw new Error("cua.move requires x and y");
    await this.#transport.send({
      command: CuaMove.create({
        browser_id: this.#browserId,
        tab_id: this.#tabId,
        x: options.x,
        y: options.y,
        keys: options.keys,
      }),
    });
  }
  async downloadMedia(options: Position & { timeoutMs?: number }) {
    if (typeof options?.x !== "number" || typeof options?.y !== "number")
      throw new Error("cua.downloadMedia requires x and y");
    await this.#transport.send({
      command: CuaDownloadMedia.create({
        browser_id: this.#browserId,
        tab_id: this.#tabId,
        x: options.x,
        y: options.y,
        timeout_ms: options.timeoutMs,
      }),
      timeoutMs: options.timeoutMs,
    });
  }
}
