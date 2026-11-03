import {
  UserClaimTabCommand,
  UserGetTabContextCommand,
  UserOpenTabsCommand,
} from "./commands/browser_user";
import { decodeBase64 } from "./runtime/base64";
import type { ClientTransport } from "./runtime/function_agent_transport";
/** Original ll. Document payloads become byte arrays only after original schema parsing. */
export class BrowserUser<Tab = unknown> {
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
  async openTabs() {
    return (
      await this.#transport.send({
        command: UserOpenTabsCommand.create({ browser_id: this.#browserId }),
      })
    ).tabs;
  }
  async getTabContext(tab: string | { id: string }) {
    const response = await this.#transport.send({
      command: UserGetTabContextCommand.create({
        browser_id: this.#browserId,
        tab_id: resolveUserTabId(tab, "getTabContext"),
      }),
    });
    const context = UserGetTabContextCommand.ResultSchema.parse(response);
    return context.kind !== "document"
      ? context
      : {
          data: decodeBase64(context.dataBase64),
          fileName: context.fileName,
          kind: context.kind,
          mimeType: context.mimeType,
          title: context.title,
          url: context.url,
        };
  }
  async claimTab(tab: string | { id: string }) {
    const id = resolveUserTabId(tab, "claimTab");
    const response = await this.#transport.send({
      command: UserClaimTabCommand.create({
        browser_id: this.#browserId,
        tab_id: id,
      }),
    });
    return this.#createTab(response);
  }
}
/** Original ul: empty string is rejected, but an object's empty id is returned unchanged. */
function resolveUserTabId(
  tab: string | { id: string },
  method: string,
): string {
  if (typeof tab === "string") {
    if (tab.length === 0)
      throw new Error(`browser.user.${method} received an empty tab id`);
    return tab;
  }
  if (tab && typeof tab === "object" && typeof tab.id === "string")
    return tab.id;
  throw new Error(
    `browser.user.${method} expects a tab returned by browser.user.openTabs() or a tab id`,
  );
}
