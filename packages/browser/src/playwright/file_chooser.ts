import { FileChooserSetFiles } from "../commands/playwright_page";
import type { ClientTransport } from "../runtime/function_agent_transport";
import { appendErrorContext } from "./helpers";
import type { TimeoutOptions } from "./locator";
/** Original Zl. Runtime array item validation remains at the original command/service boundary. */
export class PlaywrightFileChooser {
  #browserId: string;
  #tabId: string;
  #fileChooserId: string;
  #isMultiple: boolean;
  #transport: ClientTransport;
  constructor({
    browserId,
    tabId,
    fileChooserId,
    isMultiple,
    transport,
  }: {
    browserId: string;
    tabId: string;
    fileChooserId: string;
    isMultiple: boolean;
    transport: ClientTransport;
  }) {
    this.#browserId = browserId;
    this.#tabId = tabId;
    this.#fileChooserId = fileChooserId;
    this.#isMultiple = isMultiple;
    this.#transport = transport;
  }
  isMultiple() {
    return this.#isMultiple;
  }
  async setFiles(files: string | string[], { timeoutMs }: TimeoutOptions = {}) {
    if (files == null) throw new Error("fileChooser.setFiles requires files");
    const paths = Array.isArray(files) ? files : [files];
    if (!paths.length)
      throw new Error("fileChooser.setFiles requires at least one file");
    try {
      await this.#transport.send({
        command: FileChooserSetFiles.create({
          browser_id: this.#browserId,
          tab_id: this.#tabId,
          file_chooser_id: this.#fileChooserId,
          files: paths,
          timeout_ms: timeoutMs,
        }),
        timeoutMs,
      });
    } catch (error) {
      throw appendErrorContext(error, "fileChooser.setFiles failed");
    }
  }
}
