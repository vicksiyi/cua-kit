import type * as Paste from "../../types/desktop/Paste";
import type * as PressKey from "../../types/desktop/PressKey";
import type * as TypeText from "../../types/desktop/TypeText";
import type * as Move from "../../types/desktop/Move";
import type * as Scroll from "../../types/desktop/Scroll";
import type * as Drag from "../../types/desktop/Drag";
import type * as Click from "../../types/desktop/Click";
import type * as Desktop from "../../types/Desktop";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { codexTurnMetadataFromRequestMeta } from "./internal/codex_turn_metadata";
import type { WindowsComputerUseTransport } from "./internal/computer_use_client_base";

import type { Point } from "../../types/Point";
const stopped = "Computer Use was stopped by the user with the physical Escape key";
const isTimeout = (error: unknown) => error instanceof Error && error.message.startsWith("computer-use request timed out:");
const isStopped = (error: unknown) => error instanceof Error && error.message.startsWith(stopped);

/** Readable restoration of current WindowsDesktopClient, transport supplied by factory. */
export class WindowsDesktopClient implements Desktop.Client {
  readonly target = "windows_desktop" as const;
  #transport: WindowsComputerUseTransport;
  #queue: Promise<unknown> = Promise.resolve();
  #directory?: Promise<string>;
  #closing?: Promise<void>;
  #fatal?: Error;
  #stopped = false;
  #screenshotRequired = false;
  #activeDrag?: string;
  constructor(transport: WindowsComputerUseTransport) { this.#transport = transport; }

  get_screenshot = () => {
    const metadata = codexTurnMetadataFromRequestMeta();
    return this.#enqueue(async () => {
      this.#screenshotRequired = true;
      try {
        const result = await this.#request("desktop_get_screenshot", {}, metadata);
        if (result == null || typeof result !== "object") throw new Error("Windows desktop did not return a screenshot");
        const url = Reflect.get(result, "url");
        if (typeof url !== "string" || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(url)) throw new Error("Windows desktop returned an invalid screenshot");
        const bytes = Uint8Array.from(Buffer.from(url.split(",")[1], "base64"));
        this.#directory ??= fs.mkdtemp(path.join(os.tmpdir(), "sky-desktop-"));
        const filepath = path.join(await this.#directory, `${randomUUID()}.jpg`);
        await fs.writeFile(filepath, bytes, { mode: 0o600 });
        this.#screenshotRequired = false;
        return [{ filepath, bytes, data_url: url }];
      } catch (error) {
        if (this.#activeDrag != null) await this.#cleanupDrag(this.#activeDrag, metadata, error);
        throw error;
      }
    });
  };
  click = async (input: Click.Input) => { await this.#input("desktop_click", input); };
  scroll = async (input: Scroll.Input) => { await this.#input("desktop_scroll", input); };
  move = async (input: Move.Input) => { await this.#input("desktop_move", input); };
  type_text = async (input: TypeText.Input) => { await this.#input("desktop_type_text", input); };
  press_key = async (input: PressKey.Input) => { await this.#input("desktop_press_key", input); };
  paste = async (input: Paste.Input) => { await this.#input("desktop_paste", input); };
  drag = async (input: Drag.Input) => {
    if (input.path.length < 2) throw new Error("drag requires at least two points");
    const [first, ...rest] = input.path;
    const metadata = codexTurnMetadataFromRequestMeta(), id = randomUUID();
    await this.#enqueue(async () => {
      try {
        await this.#request("desktop_mouse_down", { ...first, drag_id: id }, metadata);
        for (const point of rest) await this.#request("desktop_move", { ...point, drag_id: id }, metadata);
        await this.#request("desktop_mouse_up", { drag_id: id }, metadata);
      } catch (error) { await this.#cleanupDrag(id, metadata, error); throw error; }
    });
  };
  drag_handle = () => {
    let state: "idle" | "starting" | "dragging" | "ended" = "idle";
    const id = randomUUID();
    return {
      start: async (point: Point) => {
        if (state !== "idle") throw new Error("drag handle can only be started once");
        state = "starting";
        const metadata = codexTurnMetadataFromRequestMeta();
        try {
          await this.#enqueue(async () => {
            try { await this.#request("desktop_mouse_down", { ...point, drag_id: id }, metadata); }
            catch (error) { await this.#cleanupDrag(id, metadata, error); throw error; }
          });
          state = "dragging";
        } catch (error) { state = "ended"; throw error; }
      },
      move_to: async (point: Point) => {
        if (state !== "dragging") throw new Error("drag handle must be started before moving");
        try { await this.#input("desktop_move", { ...point, drag_id: id }, id); }
        catch (error) { state = "ended"; throw error; }
      },
      end: async () => {
        if (state !== "dragging") throw new Error("drag handle must be started before ending");
        state = "ended";
        await this.#input("desktop_mouse_up", { drag_id: id }, id);
      },
    };
  };
  close = () => {
    const metadata = codexTurnMetadataFromRequestMeta();
    this.#closing ??= this.#queue.then(async () => {
      try {
        if (this.#fatal == null) {
          const result = await this.#transport.request("desktop_close", {}, { codexTurnMetadata: metadata });
          if (result != null && typeof result === "object" && Reflect.get(result, "stopped") === true)
            throw new Error(`${stopped}. Stop your work, do not call further Computer Use tools in this turn, and send a final message noting that the user stopped Computer Use.`);
        }
      } finally {
        try { await this.#transport.close(); }
        finally { const directory = await this.#directory?.catch(() => undefined); if (directory != null) await fs.rm(directory, { recursive: true, force: true }); }
      }
      if (this.#fatal != null) throw this.#fatal;
    });
    return this.#closing;
  };
  #input(method: string, params: Record<string, unknown>, dragID?: string) {
    const metadata = codexTurnMetadataFromRequestMeta();
    return this.#enqueue(async () => {
      try { return await this.#request(method, params, metadata); }
      catch (error) { const id = dragID ?? this.#activeDrag; if (id != null) await this.#cleanupDrag(id, metadata, error); throw error; }
    });
  }
  async #cleanupDrag(id: string, metadata: unknown, error: unknown) {
    if (this.#fatal == null && !isTimeout(error) && !isStopped(error)) {
      try { await this.#request("desktop_mouse_up", { drag_id: id }, metadata); }
      catch (cleanup) {
        if (this.#fatal == null && (isTimeout(cleanup) || (cleanup instanceof Error && cleanup.message.includes("The drag is no longer active")))) {
          if (this.#activeDrag === id) this.#activeDrag = undefined;
          return;
        }
        await this.#failSession("cleanup", error, cleanup);
      }
    }
  }
  async #request(method: string, params: Record<string, unknown>, metadata: unknown): Promise<unknown> {
    if (this.#screenshotRequired && ["desktop_click", "desktop_scroll", "desktop_move", "desktop_mouse_down", "desktop_type_text", "desktop_press_key", "desktop_paste"].includes(method))
      throw new Error("Take a new desktop screenshot before sending input");
    const operation = randomUUID();
    const drag = typeof params.drag_id === "string" ? params.drag_id : this.#activeDrag;
    try {
      const result = await this.#transport.request(method, { ...params, operation_id: operation }, { codexTurnMetadata: metadata });
      if (method === "desktop_mouse_down") this.#activeDrag = drag;
      if (method === "desktop_mouse_up" && this.#activeDrag === drag) this.#activeDrag = undefined;
      return result;
    } catch (error) {
      const escape = isStopped(error);
      if (escape || isTimeout(error)) {
        if (escape) this.#stopped = true;
        try {
          await this.#transport.request(escape ? "desktop_close" : "desktop_cancel", escape ? {} : { operation_id: operation, ...(drag == null ? {} : { drag_id: drag }) }, { codexTurnMetadata: metadata });
          if (escape || this.#activeDrag === drag) this.#activeDrag = undefined;
        } catch (cleanup) { await this.#failSession(escape ? "cleanup" : "cancellation", error, cleanup); }
      }
      throw error;
    }
  }
  async #failSession(kind: string, original: unknown, cleanup: unknown): Promise<never> {
    this.#fatal ??= new Error(`Windows desktop ${kind} failed; the session is closed`);
    try { await this.#transport.close(); } catch { }
    throw new AggregateError([original, cleanup], this.#fatal.message);
  }
  #enqueue<T>(action: () => Promise<T>): Promise<T> {
    if (this.#fatal != null) return Promise.reject(this.#fatal);
    if (this.#stopped) return Promise.reject(new Error(stopped));
    if (this.#closing != null) return Promise.reject(new Error("Windows desktop client is closed"));
    const result = this.#queue.then(() => {
      if (this.#fatal != null) throw this.#fatal;
      if (this.#stopped) throw new Error(stopped);
      return action();
    });
    this.#queue = result.then(() => {}, () => {});
    return result;
  }
}
