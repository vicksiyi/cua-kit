import type { ClientTransport } from "../runtime/function_agent_transport";
import { PlaywrightLocator } from "./locator";
import {
  roleSelector,
  textSelector,
  labelSelector,
  placeholderSelector,
  testIdSelector,
  type TextMatcher,
  type ExactOptions,
} from "./selectors";
/** Original Ol. Each nested frame inserts an enter-frame selector segment. */
export class PlaywrightFrameLocator {
  #browserId: string;
  #tabId: string;
  #frameSelector: string;
  #transport: ClientTransport;
  constructor({
    browserId,
    tabId,
    frameSelector,
    transport,
  }: {
    browserId: string;
    tabId: string;
    frameSelector: string;
    transport: ClientTransport;
  }) {
    this.#browserId = browserId;
    this.#tabId = tabId;
    this.#frameSelector = frameSelector;
    this.#transport = transport;
  }
  locator(selector: string) {
    if (!selector) throw new Error("frameLocator.locator requires a selector");
    const combined = `${this.#frameSelector} >> internal:control=enter-frame >> ${selector}`;
    return new PlaywrightLocator({
      browserId: this.#browserId,
      tabId: this.#tabId,
      selector: combined,
      transport: this.#transport,
    });
  }
  frameLocator(selector: string) {
    if (!selector)
      throw new Error("frameLocator.frameLocator requires a selector");
    return new PlaywrightFrameLocator({
      browserId: this.#browserId,
      tabId: this.#tabId,
      frameSelector: `${this.#frameSelector} >> internal:control=enter-frame >> ${selector}`,
      transport: this.#transport,
    });
  }
  getByRole(role: string, options: ExactOptions & { name?: TextMatcher } = {}) {
    return this.locator(roleSelector(role, options));
  }
  getByText(text: TextMatcher, options: ExactOptions = {}) {
    return this.locator(textSelector(text, options));
  }
  getByLabel(text: TextMatcher, options: ExactOptions = {}) {
    return this.locator(labelSelector(text, options));
  }
  getByPlaceholder(text: TextMatcher, options: ExactOptions = {}) {
    return this.locator(placeholderSelector(text, options));
  }
  getByTestId(testId: TextMatcher) {
    return this.locator(testIdSelector(testId));
  }
}
