import { Documentation } from "./agent";
import { Tab } from "./tab";
import { Tabs } from "./tabs";
import { BrowserUser } from "./browser_user";
import {
  Capabilities,
  type BrowserCapability,
  type CapabilityInfo,
} from "./capabilities/base";
import { browserCapabilityFactories } from "./capabilities/browser";
import {
  BrowserDocumentation,
  BrowserHistory,
  NameSession,
} from "./commands/browser_session";
import type { ClientTransport } from "./runtime/function_agent_transport";
export interface BrowserOptions {
  capabilities?: { browser?: CapabilityInfo[]; tab?: CapabilityInfo[] };
  onBrowserUsed?: () => unknown;
  transport: ClientTransport;
  browserId: string;
}
export interface HistoryOptions {
  queries?: string[] | null;
  limit?: number | null;
  from?: Date | string | number | null;
  to?: Date | string | number | null;
}
/** Original fm. Private id is retained for history; mutable public id is used by documentation/nameSession. */
export class Browser {
  #browserId: string;
  #onBrowserUsed: (() => unknown) | undefined;
  #transport: ClientTransport;
  declare browserId: string;
  declare capabilities: Capabilities<BrowserCapability>;
  declare tabs: Tabs<Tab>;
  declare user: BrowserUser<Tab>;
  constructor({
    capabilities,
    onBrowserUsed,
    transport,
    browserId,
  }: BrowserOptions) {
    this.#browserId = browserId;
    this.#onBrowserUsed = onBrowserUsed;
    this.#transport = transport;
    this.browserId = browserId;
    const documentation = new Documentation(transport),
      instances: Record<string, BrowserCapability> = {};
    for (const info of capabilities?.browser ?? []) {
      const create = browserCapabilityFactories.get(info.id);
      if (create != null)
        instances[info.id] = create({
          browserId,
          documentation,
          info,
          transport,
        });
    }
    this.capabilities = new Capabilities(instances);
    const createTab = (tabPayload: any) =>
      new Tab({
        browserId,
        capabilities: capabilities?.tab,
        documentation,
        transport,
        tabPayload,
      });
    this.tabs = new Tabs({ browserId, createTab, transport });
    this.user = new BrowserUser({ browserId, createTab, transport });
  }
  async documentation() {
    this.#onBrowserUsed?.();
    return await this.#transport.send({
      command: BrowserDocumentation.create({ browser_id: this.browserId }),
    });
  }
  async history(options: HistoryOptions = {}) {
    if (
      options === null ||
      Array.isArray(options) ||
      typeof options !== "object"
    )
      throw new Error("browser.history expects an options object");
    const payload: BrowserHistory.Payload = { browser_id: this.#browserId },
      queries = historyQueries(options.queries),
      limit = historyLimit(options.limit),
      from = historyDate(options.from, "from"),
      to = historyDate(options.to, "to");
    if (queries !== undefined) payload.queries = queries;
    if (limit !== undefined) payload.limit = limit;
    if (from !== undefined) payload.from = from;
    if (to !== undefined) payload.to = to;
    return (
      await this.#transport.send({ command: BrowserHistory.create(payload) })
    ).items;
  }
  async nameSession(name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("browser.nameSession requires a name");
    await this.#transport.send({
      command: NameSession.create({
        browser_id: this.browserId,
        name: trimmed,
      }),
    });
  }
}
/** Original gm/wm/vm: conversion and validation order are observable. */
function historyDate(value: HistoryOptions["from"], field: string) {
  if (value == null) return;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new Error(`browser.history received an invalid ${field} date`);
  return date.toISOString();
}
function historyQueries(value: HistoryOptions["queries"]) {
  if (value == null) return;
  if (!Array.isArray(value) || value.length === 0)
    throw new Error("browser.history received invalid queries");
  const queries: string[] = [];
  for (const query of value) {
    if (typeof query !== "string")
      throw new Error("browser.history received invalid queries");
    queries.push(query);
  }
  return queries;
}
function historyLimit(value: HistoryOptions["limit"]) {
  if (value != null) {
    if (!Number.isInteger(value) || value <= 0)
      throw new Error("browser.history received an invalid limit");
    return value;
  }
}
