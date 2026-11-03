import { DownloadPath } from "../commands/playwright_page";
import type { ClientTransport } from "../runtime/function_agent_transport";
import type { TimeoutOptions } from "./locator";
/** Original $l. */
export class PlaywrightDownload {
  #browserId: string;
  #tabId: string;
  #downloadId: string;
  #transport: ClientTransport;
  constructor({
    browserId,
    tabId,
    downloadId,
    transport,
  }: {
    browserId: string;
    tabId: string;
    downloadId: string;
    transport: ClientTransport;
  }) {
    this.#browserId = browserId;
    this.#tabId = tabId;
    this.#downloadId = downloadId;
    this.#transport = transport;
  }
  async path({ timeoutMs }: TimeoutOptions = {}) {
    return (
      (
        await this.#transport.send({
          command: DownloadPath.create({
            browser_id: this.#browserId,
            tab_id: this.#tabId,
            download_id: this.#downloadId,
            timeout_ms: timeoutMs,
          }),
          timeoutMs,
        })
      ).path ?? null
    );
  }
}
