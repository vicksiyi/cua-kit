import * as commands from "../commands/playwright_page";
import { PlaywrightEvaluate } from "../commands/playwright_locator";
import { NavigateTabBack, NavigateTabForward } from "../commands/tab_control";
import type { ClientTransport } from "../runtime/function_agent_transport";
import { decodeBase64 } from "../runtime/base64";
import { pageEvaluationScript, requireCoordinates } from "./helpers";
import { PlaywrightLocator, type TimeoutOptions } from "./locator";
import { PlaywrightFrameLocator } from "./frame_locator";
import { PlaywrightDownload } from "./download";
import { PlaywrightFileChooser } from "./file_chooser";
import {
  roleSelector,
  textSelector,
  labelSelector,
  placeholderSelector,
  testIdSelector,
  type TextMatcher,
  type ExactOptions,
} from "./selectors";
export interface ElementPoint {
  x: number;
  y: number;
  includeNonInteractable?: boolean;
}
/** Original Nl. Client-side routing only; the service executes the browser operations. */
export class PlaywrightAPI {
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
  async goBack() {
    await this.#transport.send({
      command: NavigateTabBack.create({
        browser_id: this.#browserId,
        tab_id: this.#tabId,
      }),
    });
  }
  async goForward() {
    await this.#transport.send({
      command: NavigateTabForward.create({
        browser_id: this.#browserId,
        tab_id: this.#tabId,
      }),
    });
  }
  async evaluate(
    pageFunction: string | Function,
    arg?: unknown,
    options?: TimeoutOptions,
  ) {
    return (
      await this.#transport.send({
        command: PlaywrightEvaluate.create({
          browser_id: this.#browserId,
          script: pageEvaluationScript(pageFunction, arg),
          tab_id: this.#tabId,
          timeout_ms: options?.timeoutMs,
        }),
        timeoutMs: options?.timeoutMs,
      })
    ).value;
  }
  locator(selector: string) {
    if (!selector) throw new Error("playwright.locator requires a selector");
    return new PlaywrightLocator({
      browserId: this.#browserId,
      tabId: this.#tabId,
      selector,
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
  frameLocator(selector: string) {
    if (!selector)
      throw new Error("playwright.frameLocator requires a selector");
    return new PlaywrightFrameLocator({
      browserId: this.#browserId,
      tabId: this.#tabId,
      frameSelector: selector,
      transport: this.#transport,
    });
  }
  async waitForURL(
    url: string,
    options: TimeoutOptions & { waitUntil?: string } = {},
  ) {
    if (!url) throw new Error("playwright.waitForURL requires a url");
    await this.#transport.send({
      command: commands.WaitForUrl.create({
        browser_id: this.#browserId,
        tab_id: this.#tabId,
        url,
        wait_until: options.waitUntil,
        timeout_ms: options.timeoutMs,
      }),
      timeoutMs: options.timeoutMs,
    });
  }
  async waitForLoadState(options: TimeoutOptions & { state?: string } = {}) {
    await this.#transport.send({
      command: commands.WaitForLoadState.create({
        browser_id: this.#browserId,
        tab_id: this.#tabId,
        state: options.state,
        timeout_ms: options.timeoutMs,
      }),
      timeoutMs: options.timeoutMs,
    });
  }
  async waitForTimeout(timeoutMs: number) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 0)
      throw new Error(
        "playwright.waitForTimeout requires a non-negative integer",
      );
    await this.#transport.send({
      command: commands.WaitForTimeout.create({
        browser_id: this.#browserId,
        tab_id: this.#tabId,
        timeout_ms: timeoutMs,
      }),
      timeoutMs: timeoutMs + 2000,
    });
  }
  waitForEvent(event: string, options: TimeoutOptions = {}) {
    const waiting = this.#waitForEvent(event, options);
    waiting.catch(() => {});
    return waiting;
  }
  async #waitForEvent(event: string, options: TimeoutOptions) {
    if (event === "download") {
      const timeoutMs = options.timeoutMs ?? 120000,
        result = await this.#transport.send({
          command: commands.WaitForDownload.create({
            browser_id: this.#browserId,
            tab_id: this.#tabId,
            timeout_ms: timeoutMs,
          }),
          timeoutMs,
        });
      return new PlaywrightDownload({
        browserId: this.#browserId,
        tabId: this.#tabId,
        downloadId: result.download_id,
        transport: this.#transport,
      });
    }
    if (event === "filechooser") {
      const result = await this.#transport.send({
        command: commands.WaitForFileChooser.create({
          browser_id: this.#browserId,
          tab_id: this.#tabId,
          timeout_ms: options.timeoutMs,
        }),
        timeoutMs: options.timeoutMs,
      });
      return new PlaywrightFileChooser({
        browserId: this.#browserId,
        tabId: this.#tabId,
        fileChooserId: result.file_chooser_id,
        isMultiple: result.is_multiple,
        transport: this.#transport,
      });
    }
    throw new Error(
      "playwright.waitForEvent only supports 'download' and 'filechooser'",
    );
  }
  async expectNavigation<T>(
    action: () => T | PromiseLike<T>,
    options: TimeoutOptions & { url?: string; waitUntil?: string } = {},
  ) {
    const waiting = options.url
        ? this.waitForURL(options.url, {
            timeoutMs: options.timeoutMs,
            waitUntil: options.waitUntil,
          })
        : this.waitForLoadState({
            timeoutMs: options.timeoutMs,
            state: options.waitUntil,
          }),
      running = Promise.resolve().then(action),
      [result] = await Promise.all([running, waiting]);
    return result;
  }
  async elementInfo(point: ElementPoint) {
    const coords = requireCoordinates("playwright.elementInfo", point);
    return await this.#transport.send({
      command: commands.ElementInfo.create({
        browser_id: this.#browserId,
        tab_id: this.#tabId,
        x: coords.x,
        y: coords.y,
        include_non_interactable: point.includeNonInteractable,
      }),
    });
  }
  async elementScreenshot(point: ElementPoint) {
    const coords = requireCoordinates("playwright.elementScreenshot", point),
      result = await this.#transport.send({
        command: commands.ElementScreenshot.create({
          browser_id: this.#browserId,
          tab_id: this.#tabId,
          x: coords.x,
          y: coords.y,
          include_non_interactable: point.includeNonInteractable,
        }),
      });
    return decodeBase64(result.data);
  }
  async domSnapshot() {
    return (
      await this.#transport.send({
        command: commands.DomSnapshot.create({
          browser_id: this.#browserId,
          tab_id: this.#tabId,
        }),
      })
    ).dom_snapshot;
  }
}
