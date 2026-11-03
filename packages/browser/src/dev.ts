import { DevLogsCommand } from "./commands/tab_services";
import type { ClientTransport } from "./runtime/function_agent_transport";
/** Original Vl/Wl/Kl/Jl. warning aliases warn; limit must be a positive integer. */
export class TabDevAPI {
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
  async logs(
    options: { filter?: string; levels?: string[]; limit?: number } = {},
  ) {
    const filter = parseFilter(options.filter),
      levels = parseLevels(options.levels),
      limit = parseLimit(options.limit);
    const payload = {
      browser_id: this.#browserId,
      tab_id: this.#tabId,
      ...(filter !== undefined ? { filter } : {}),
      ...(levels !== undefined ? { levels } : {}),
      ...(limit !== undefined ? { limit } : {}),
    };
    return (
      await this.#transport.send({ command: DevLogsCommand.create(payload) })
    ).logs;
  }
}
function parseFilter(value: unknown) {
  if (value != null) {
    if (typeof value !== "string")
      throw new Error("tab.dev.logs received an invalid filter");
    return value;
  }
}
function parseLevels(value: unknown): string[] | undefined {
  if (value != null) {
    if (!Array.isArray(value) || value.length === 0)
      throw new Error("tab.dev.logs received invalid levels");
    return value.map((level) => {
      if (level === "warning") return "warn";
      if (DevLogsCommand.LogLevelSchema.options.includes(level)) return level;
      throw new Error(`tab.dev.logs received invalid level "${String(level)}"`);
    });
  }
}
function parseLimit(value: unknown): number | undefined {
  if (value != null) {
    if (!Number.isInteger(value) || (value as number) <= 0)
      throw new Error("tab.dev.logs received an invalid limit");
    return value as number;
  }
}
