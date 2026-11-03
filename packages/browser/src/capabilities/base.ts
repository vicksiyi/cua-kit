import type { ClientTransport } from "../runtime/function_agent_transport";
export interface CapabilityInfo {
  id: string;
  description: string;
  [key: string]: unknown;
}
export interface DocumentationApi {
  get(name: string): Promise<unknown>;
}
export interface BrowserCapabilityOptions {
  browserId: string;
  documentation: DocumentationApi;
  info: CapabilityInfo;
  transport: ClientTransport;
}
export interface TabCapabilityOptions extends BrowserCapabilityOptions {
  tabId: string;
}
/** Original Gl. Public fields are assignments, not emitted TS initializers. */
export class BrowserCapability {
  declare transport: ClientTransport;
  declare browserId: string;
  declare documentationApi: DocumentationApi;
  declare info: CapabilityInfo;
  constructor(
    transport: ClientTransport,
    browserId: string,
    documentation: DocumentationApi,
    info: CapabilityInfo,
  ) {
    this.transport = transport;
    this.browserId = browserId;
    this.documentationApi = documentation;
    this.info = info;
  }
  get id() {
    return this.info.id;
  }
  async documentation() {
    return await this.documentationApi.get(`capabilities/browser/${this.id}`);
  }
}
/** Original Hl. */
export class TabCapability {
  declare transport: ClientTransport;
  declare browserId: string;
  declare tabId: string;
  declare documentationApi: DocumentationApi;
  declare info: CapabilityInfo;
  constructor(
    transport: ClientTransport,
    browserId: string,
    tabId: string,
    documentation: DocumentationApi,
    info: CapabilityInfo,
  ) {
    this.transport = transport;
    this.browserId = browserId;
    this.tabId = tabId;
    this.documentationApi = documentation;
    this.info = info;
  }
  get id() {
    return this.info.id;
  }
  async documentation() {
    return await this.documentationApi.get(`capabilities/tab/${this.id}`);
  }
}
/** Original Yl. The definition's static info overrides the caller's supplied info. */
export function defineBrowserCapability<C extends BrowserCapability>({
  capability,
  info,
  internalOnly,
}: {
  capability: new (options: BrowserCapabilityOptions) => C;
  info: CapabilityInfo;
  internalOnly?: boolean;
}) {
  return {
    capability,
    create: (options: BrowserCapabilityOptions) =>
      new capability({ ...options, info }),
    id: info.id,
    info,
    ...(internalOnly == null ? {} : { internalOnly }),
  };
}
/** Original Xl, separate tab-specific registration helper. */
export function defineTabCapability<C extends TabCapability>({
  capability,
  info,
  internalOnly,
}: {
  capability: new (options: TabCapabilityOptions) => C;
  info: CapabilityInfo;
  internalOnly?: boolean;
}) {
  return {
    capability,
    create: (options: TabCapabilityOptions) =>
      new capability({ ...options, info }),
    id: info.id,
    info,
    ...(internalOnly == null ? {} : { internalOnly }),
  };
}
/** Original Ql; lookup intentionally uses the supplied object's normal property semantics. */
export class Capabilities<
  C extends { info: CapabilityInfo } = { info: CapabilityInfo },
> {
  #capabilities: Record<string, C>;
  constructor(capabilities: Record<string, C>) {
    this.#capabilities = capabilities;
  }
  async get(id: string) {
    const capability = this.#capabilities[id];
    if (!capability) throw new Error(`Capability is not available: ${id}`);
    return capability;
  }
  async list() {
    return Object.values(this.#capabilities).map(
      (capability) => capability.info,
    );
  }
}
