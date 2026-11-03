import {
  ContentExportCommand,
  ContentExportGsuiteCommand,
  ContentExportYouTubeTranscriptCommand,
} from "./commands/tab_services";
import type { ClientTransport } from "./runtime/function_agent_transport";
/** Original Ul; result path and export format are not additionally parsed here. */
export class ContentAPI {
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
  async export() {
    return (
      await this.#transport.send({
        command: ContentExportCommand.create({
          browser_id: this.#browserId,
          tab_id: this.#tabId,
        }),
      })
    ).path;
  }
  async exportGsuite(format: "pdf" | "md" | "xlsx" | "csv" | "docx" | "pptx") {
    return (
      await this.#transport.send({
        command: ContentExportGsuiteCommand.create({
          browser_id: this.#browserId,
          tab_id: this.#tabId,
          format,
        }),
      })
    ).path;
  }
  async exportYouTubeTranscript() {
    return (
      await this.#transport.send({
        command: ContentExportYouTubeTranscriptCommand.create({
          browser_id: this.#browserId,
          tab_id: this.#tabId,
        }),
      })
    ).path;
  }
}
