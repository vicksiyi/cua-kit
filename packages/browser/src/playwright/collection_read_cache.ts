import { PlaywrightLocatorReadAll } from "../commands/playwright_read_all";
import type { ClientTransport } from "../runtime/function_agent_transport";

/** Original Sl. One in-flight/result promise per relative selector, shared by all() locators.
 * Timeouts and item indices are intentionally not part of the cache key.
 */
export class CollectionReadCache {
  #browserId: string;
  #tabId: string;
  #selector: string;
  #transport: ClientTransport;
  #reads = new Map<
    string,
    Promise<Array<PlaywrightLocatorReadAll.Item | null>>
  >();
  constructor({
    browserId,
    tabId,
    selector,
    transport,
  }: {
    browserId: string;
    tabId: string;
    selector: string;
    transport: ClientTransport;
  }) {
    this.#browserId = browserId;
    this.#tabId = tabId;
    this.#selector = selector;
    this.#transport = transport;
  }
  clear() {
    this.#reads.clear();
  }
  async read({
    index,
    relativeSelector,
    timeoutMs,
  }: {
    index: number;
    relativeSelector?: string;
    timeoutMs?: number;
  }): Promise<PlaywrightLocatorReadAll.Item | null> {
    const key = relativeSelector ?? "";
    let read = this.#reads.get(key);
    if (!read) {
      read = this.#fetch(relativeSelector, timeoutMs).catch((error) => {
        this.#reads.delete(key);
        throw error;
      });
      this.#reads.set(key, read);
    }
    return (await read)[index] ?? null;
  }
  async #fetch(
    relativeSelector: string | undefined,
    timeoutMs: number | undefined,
  ): Promise<Array<PlaywrightLocatorReadAll.Item | null>> {
    return (
      await this.#transport.send({
        command: PlaywrightLocatorReadAll.create({
          browser_id: this.#browserId,
          tab_id: this.#tabId,
          selector: this.#selector,
          relative_selector: relativeSelector,
          timeout_ms: timeoutMs,
        }),
        timeoutMs,
      })
    ).values;
  }
}
