import {
  CreateTabCommand,
  GetTabCommand,
  SelectedTabCommand,
  ListTabsCommand,
  TabsContentCommand,
} from "./commands/tabs";
import type { ClientTransport } from "./runtime/function_agent_transport";

/** Original ol: a caller-supplied factory constructs tabs after transport returns. */
export class Tabs<Tab = unknown> {
  #browserId: string;
  #createTab: (payload: any) => Tab;
  #transport: ClientTransport;
  constructor({
    browserId,
    createTab,
    transport,
  }: {
    browserId: string;
    createTab: (payload: any) => Tab;
    transport: ClientTransport;
  }) {
    this.#browserId = browserId;
    this.#createTab = createTab;
    this.#transport = transport;
  }
  async new() {
    const payload = await this.#transport.send({
      command: CreateTabCommand.create({ browser_id: this.#browserId }),
    });
    return this.#createTab(payload);
  }
  async selected() {
    const payload = await this.#transport.send({
      command: SelectedTabCommand.create({ browser_id: this.#browserId }),
    });
    if (payload.id) return this.#createTab(payload);
  }
  async list() {
    return (
      await this.#transport.send({
        command: ListTabsCommand.create({ browser_id: this.#browserId }),
      })
    ).tabs;
  }
  async content(options: {
    urls: string[];
    contentType: "html" | "text" | "domSnapshot";
    timeoutMs?: number;
  }) {
    const command = TabsContentCommand.create({
      browser_id: this.#browserId,
      urls: options.urls,
      content_type: options.contentType,
      ...(options.timeoutMs === undefined
        ? {}
        : { timeout_ms: options.timeoutMs }),
    });
    // Unlike get/new/selected/list, content validates before the empty-list fast path.
    command.parse();
    return options.urls.length === 0
      ? []
      : (await this.#transport.send({ command })).results;
  }
  async get(id: string) {
    if (!id) throw new Error("tabs.get requires a tab id");
    const payload = await this.#transport.send({
      command: GetTabCommand.create({
        browser_id: this.#browserId,
        tab_id: id,
      }),
    });
    return this.#createTab(payload);
  }
}
