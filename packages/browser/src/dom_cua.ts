import {
  DomCuaClick,
  DomCuaDoubleClick,
  DomCuaScroll,
  DomCuaType,
  DomCuaKeypress,
  DomCuaDownloadMedia,
  DomCuaGetVisibleDom,
} from "./commands/cua_input";
import type { ClientTransport } from "./runtime/function_agent_transport";
/** Original ql with Dl/Ll node-id validation helpers. */
export class DomCUAAPI {
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
  async get_visible_dom() {
    return this.#transport.send({
      command: DomCuaGetVisibleDom.create({
        browser_id: this.#browserId,
        tab_id: this.#tabId,
      }),
    });
  }
  async click(options: { node_id: string }) {
    const id = requireNodeId(options?.node_id, "dom_cua.click");
    await this.#transport.send({
      command: DomCuaClick.create({
        browser_id: this.#browserId,
        tab_id: this.#tabId,
        node_id: id,
      }),
    });
  }
  async double_click(options: { node_id: string }) {
    const id = requireNodeId(options?.node_id, "dom_cua.double_click");
    await this.#transport.send({
      command: DomCuaDoubleClick.create({
        browser_id: this.#browserId,
        tab_id: this.#tabId,
        node_id: id,
      }),
    });
  }
  async scroll({ node_id, x, y }: { node_id?: string; x: number; y: number }) {
    if (typeof x !== "number" || typeof y !== "number")
      throw new Error("dom_cua.scroll requires x and y numbers");
    const id =
      node_id === undefined
        ? undefined
        : parseNodeId(node_id, "dom_cua.scroll");
    await this.#transport.send({
      command: DomCuaScroll.create({
        browser_id: this.#browserId,
        tab_id: this.#tabId,
        node_id: id,
        scroll_x: x,
        scroll_y: y,
      }),
    });
  }
  async type({ text }: { text: string }) {
    if (typeof text !== "string") throw new Error("dom_cua.type requires text");
    await this.#transport.send({
      command: DomCuaType.create({
        browser_id: this.#browserId,
        tab_id: this.#tabId,
        text,
      }),
    });
  }
  async keypress(options: { keys: string[] }) {
    if (!Array.isArray(options?.keys) || options.keys.length === 0)
      throw new Error("dom_cua.keypress requires a non-empty keys array");
    await this.#transport.send({
      command: DomCuaKeypress.create({
        browser_id: this.#browserId,
        tab_id: this.#tabId,
        keys: options.keys,
      }),
    });
  }
  async downloadMedia(options: { node_id: string; timeoutMs?: number }) {
    const id = requireNodeId(options?.node_id, "dom_cua.downloadMedia");
    await this.#transport.send({
      command: DomCuaDownloadMedia.create({
        browser_id: this.#browserId,
        tab_id: this.#tabId,
        node_id: id,
        timeout_ms: options.timeoutMs,
      }),
      timeoutMs: options.timeoutMs,
    });
  }
}
function requireNodeId(value: unknown, method: string): string {
  if (value === undefined) throw new Error(`${method} requires a node_id`);
  return parseNodeId(value, method);
}
function parseNodeId(value: unknown, method: string): string {
  const result = DomCuaClick.DomNodeIdSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      `${method} ${result.error.issues[0]?.message ?? "has an invalid node_id"}`,
    );
  return result.data;
}
