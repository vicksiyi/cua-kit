import {
  ClipboardReadTextCommand,
  ClipboardWriteTextCommand,
  ClipboardReadCommand,
  ClipboardWriteCommand,
} from "./commands/tab_services";
import type { ClientTransport } from "./runtime/function_agent_transport";
export interface ClipboardEntry {
  mimeType: string;
  text?: string;
  base64?: string;
}
export interface ClipboardItem {
  entries: ClipboardEntry[];
  presentationStyle?: "unspecified" | "inline" | "attachment";
}
/** Original zl; field conversion here does not replace command schema validation downstream. */
export class TabClipboardAPI {
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
  async readText() {
    return (
      await this.#transport.send({
        command: ClipboardReadTextCommand.create({
          browser_id: this.#browserId,
          tab_id: this.#tabId,
        }),
      })
    ).text;
  }
  async writeText(text: string) {
    if (text == null) throw new Error("tab.clipboard.writeText requires text");
    await this.#transport.send({
      command: ClipboardWriteTextCommand.create({
        browser_id: this.#browserId,
        tab_id: this.#tabId,
        text,
      }),
    });
  }
  async read(): Promise<ClipboardItem[]> {
    return (
      await this.#transport.send({
        command: ClipboardReadCommand.create({
          browser_id: this.#browserId,
          tab_id: this.#tabId,
        }),
      })
    ).items.map((item: any) => ({
      entries: item.entries.map((entry: any) => ({
        mimeType: entry.mime_type,
        text: entry.text,
        base64: entry.base64,
      })),
      presentationStyle: item.presentation_style,
    }));
  }
  async write(items: ClipboardItem[]) {
    if (!Array.isArray(items) || items.length === 0)
      throw new Error(
        "tab.clipboard.write requires at least one clipboard item",
      );
    await this.#transport.send({
      command: ClipboardWriteCommand.create({
        browser_id: this.#browserId,
        tab_id: this.#tabId,
        items: items.map((item) => ({
          presentation_style: item.presentationStyle,
          entries: item.entries.map((entry) => ({
            mime_type: entry.mimeType,
            text: entry.text,
            base64: entry.base64,
          })),
        })),
      }),
    });
  }
}
