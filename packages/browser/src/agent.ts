import {
  ListBrowsersCommand,
  GetBrowserCommand,
  GetDefaultBrowserCommand,
  GetBrowserForUrlCommand,
  GetDocumentationCommand,
} from "./commands/browser_inventory";
import type { ClientTransport } from "./runtime/function_agent_transport";

// Inferred types at original factory boundary; no replacement Browser implementation.
export interface BrowserFactoryOptions {
  browserInfo: any;
  onBrowserUsed: () => unknown;
  transport: ClientTransport;
}
interface BrowsersOptions<Browser> {
  createBrowser: (options: BrowserFactoryOptions) => Browser;
  onBrowserUsed?: (info: any) => unknown;
  transport: ClientTransport;
}
/** Original il: browser-use notification runs before factory, and again through callback. */
export class Browsers<Browser = unknown> {
  #createBrowser: BrowsersOptions<Browser>["createBrowser"];
  #onBrowserUsed: BrowsersOptions<Browser>["onBrowserUsed"];
  #transport: ClientTransport;
  constructor({
    createBrowser,
    onBrowserUsed,
    transport,
  }: BrowsersOptions<Browser>) {
    this.#createBrowser = createBrowser;
    this.#onBrowserUsed = onBrowserUsed;
    this.#transport = transport;
  }
  async list() {
    return await this.#transport.send({
      command: ListBrowsersCommand.create(),
    });
  }
  async get(id: string) {
    if (!id) throw new Error("browsers.get requires a browser id");
    const info = await this.#transport.send({
      command: GetBrowserCommand.create({ id }),
    });
    return this.#build(info);
  }
  async getDefault() {
    return this.#build(
      await this.#transport.send({
        command: GetDefaultBrowserCommand.create(),
      }),
    );
  }
  async getForUrl(url: string) {
    return this.#build(
      await this.#transport.send({
        command: GetBrowserForUrlCommand.create({ url }),
      }),
    );
  }
  #build(info: any) {
    this.#onBrowserUsed?.(info);
    return this.#createBrowser({
      browserInfo: info,
      onBrowserUsed: () => this.#onBrowserUsed?.(info),
      transport: this.#transport,
    });
  }
}
/** Original sl. */
export class Documentation {
  #transport: ClientTransport;
  constructor(transport: ClientTransport) {
    this.#transport = transport;
  }
  async get(name: string) {
    return await this.#transport.send({
      command: GetDocumentationCommand.create({ name }),
    });
  }
}
/** Original nl (the browser API Agent object, not an LLM decision loop). */
export class Agent<Browser = unknown> {
  documentation: Documentation;
  browsers: Browsers<Browser>;
  constructor({
    createBrowser,
    onBrowserUsed,
    transport,
  }: BrowsersOptions<Browser>) {
    if (!transport) throw new Error("Agent requires a transport instance");
    this.documentation = new Documentation(transport);
    this.browsers = new Browsers({ createBrowser, onBrowserUsed, transport });
  }
}
