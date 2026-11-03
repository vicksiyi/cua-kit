import * as commands from "../commands/playwright_locator";
import type { ClientTransport } from "../runtime/function_agent_transport";
import { CollectionReadCache } from "./collection_read_cache";
import {
  appendRelativeSelector,
  escapeTextForSelector,
  roleSelector,
  textSelector,
  labelSelector,
  placeholderSelector,
  testIdSelector,
  type TextMatcher,
  type ExactOptions,
} from "./selectors";
import {
  appendErrorContext,
  classifyActionError,
  locatorEvaluationScript,
} from "./helpers";

export interface TimeoutOptions {
  timeoutMs?: number;
}
export interface ClickOptions extends TimeoutOptions {
  modifiers?: string[];
  button?: string;
  force?: boolean;
}
export interface FilterOptions {
  hasText?: TextMatcher;
  hasNotText?: TextMatcher;
  has?: PlaywrightLocator;
  hasNot?: PlaywrightLocator;
  visible?: boolean;
}
export interface LocatorOptions {
  browserId: string;
  tabId: string;
  selector: string;
  transport: ClientTransport;
  collectionReadCache?: CollectionReadCache;
  collectionReadIndex?: number;
  collectionRelativeSelector?: string;
}
const browserAuthSelectorDetails = Symbol("browserAuthSelectorDetails");
/** Original kl/xl. Private target identity is shared with browserAuth, not structural duck typing. */
export class PlaywrightLocator {
  #browserId: string;
  #tabId: string;
  #selector: string;
  #transport: ClientTransport;
  #collectionReadCache: CollectionReadCache | undefined;
  #collectionReadIndex: number | undefined;
  #collectionRelativeSelector: string | undefined;
  constructor({
    browserId,
    tabId,
    selector,
    transport,
    collectionReadCache,
    collectionReadIndex,
    collectionRelativeSelector,
  }: LocatorOptions) {
    this.#browserId = browserId;
    this.#tabId = tabId;
    this.#selector = selector;
    this.#transport = transport;
    this.#collectionReadCache = collectionReadCache;
    this.#collectionReadIndex = collectionReadIndex;
    this.#collectionRelativeSelector = collectionRelativeSelector;
  }
  static browserAuthSelector(locator: PlaywrightLocator) {
    return locator[browserAuthSelectorDetails]();
  }
  [browserAuthSelectorDetails]() {
    return {
      browserId: this.#browserId,
      selector: this.#selector,
      tabId: this.#tabId,
    };
  }
  async click(options: ClickOptions = {}) {
    try {
      await this.#transport.send({
        command: commands.LocatorClick.create({
          browser_id: this.#browserId,
          tab_id: this.#tabId,
          selector: this.#selector,
          modifiers: options.modifiers,
          button: options.button,
          force: options.force,
          timeout_ms: options.timeoutMs,
        }),
        timeoutMs: options.timeoutMs,
      });
      this.#collectionReadCache?.clear();
    } catch (error) {
      throw await this.actionError(
        error,
        "click",
        `waiting on click for selector ${this.#selector}`,
      );
    }
  }
  async dblclick(options: ClickOptions = {}) {
    try {
      await this.#transport.send({
        command: commands.LocatorDoubleClick.create({
          browser_id: this.#browserId,
          tab_id: this.#tabId,
          selector: this.#selector,
          modifiers: options.modifiers,
          button: options.button,
          force: options.force,
          timeout_ms: options.timeoutMs,
        }),
        timeoutMs: options.timeoutMs,
      });
      this.#collectionReadCache?.clear();
    } catch (error) {
      throw await this.actionError(
        error,
        "dblclick",
        `waiting on dblclick for selector ${this.#selector}`,
      );
    }
  }
  async selectOption(
    values:
      | string
      | { value?: string; label?: string; index?: number }
      | Array<string | { value?: string; label?: string; index?: number }>,
    { timeoutMs }: TimeoutOptions = {},
  ) {
    const selections = (() => {
      const entries = Array.isArray(values) ? values : [values];
      if (!entries.length)
        throw new Error("locator.selectOption requires at least one value");
      return entries.map((entry) => {
        if (typeof entry === "string") return { value: entry };
        if (!entry || typeof entry !== "object")
          throw new Error(
            "locator.selectOption requires a string or { value?, label?, index? }",
          );
        const selection: { value?: string; label?: string; index?: number } =
          {};
        if (entry.value !== undefined) {
          if (typeof entry.value !== "string")
            throw new Error("locator.selectOption value must be a string");
          selection.value = entry.value;
        }
        if (entry.label !== undefined) {
          if (typeof entry.label !== "string")
            throw new Error("locator.selectOption label must be a string");
          selection.label = entry.label;
        }
        if (entry.index !== undefined) {
          if (!Number.isInteger(entry.index) || entry.index < 0)
            throw new Error(
              "locator.selectOption index must be a non-negative integer",
            );
          selection.index = entry.index;
        }
        if (
          selection.value === undefined &&
          selection.label === undefined &&
          selection.index === undefined
        )
          throw new Error(
            "locator.selectOption requires value, label, or index for each selection",
          );
        return selection;
      });
    })();
    try {
      await this.#transport.send({
        command: commands.LocatorSelectOption.create({
          browser_id: this.#browserId,
          tab_id: this.#tabId,
          selector: this.#selector,
          selections,
          timeout_ms: timeoutMs,
        }),
        timeoutMs,
      });
      this.#collectionReadCache?.clear();
    } catch (error) {
      throw await this.actionError(
        error,
        "selectOption",
        `locator.selectOption failed for selector ${this.#selector}`,
      );
    }
  }
  async fill(value: string, { timeoutMs }: TimeoutOptions = {}) {
    if (value == null) throw new Error("locator.fill requires a value");
    try {
      await this.#transport.send({
        command: commands.LocatorFill.create({
          browser_id: this.#browserId,
          tab_id: this.#tabId,
          selector: this.#selector,
          value,
          replace: true,
          timeout_ms: timeoutMs,
        }),
        timeoutMs,
      });
      this.#collectionReadCache?.clear();
    } catch (error) {
      throw await this.actionError(
        error,
        "fill",
        `locator.fill failed for selector ${this.#selector}`,
      );
    }
  }
  async type(value: string, { timeoutMs }: TimeoutOptions = {}) {
    if (value == null) throw new Error("locator.type requires a value");
    try {
      await this.#transport.send({
        command: commands.LocatorFill.create({
          browser_id: this.#browserId,
          tab_id: this.#tabId,
          selector: this.#selector,
          value,
          replace: false,
          timeout_ms: timeoutMs,
        }),
        timeoutMs,
      });
      this.#collectionReadCache?.clear();
    } catch (error) {
      throw await this.actionError(
        error,
        "type",
        `locator.type failed for selector ${this.#selector}`,
      );
    }
  }
  async pressSequentially(value: string, options: TimeoutOptions = {}) {
    if (value == null)
      throw new Error("locator.pressSequentially requires a value");
    try {
      await this.#transport.send({
        command: commands.LocatorPressSequentially.create({
          browser_id: this.#browserId,
          tab_id: this.#tabId,
          selector: this.#selector,
          value,
          ...(options.timeoutMs == null
            ? {}
            : { timeout_ms: options.timeoutMs }),
        }),
        timeoutMs: options.timeoutMs,
      });
      this.#collectionReadCache?.clear();
    } catch (error) {
      throw await this.actionError(
        error,
        "pressSequentially",
        `locator.pressSequentially failed for selector ${this.#selector}`,
      );
    }
  }
  async press(value: string, { timeoutMs }: TimeoutOptions = {}) {
    if (value == null) throw new Error("locator.press requires a value");
    try {
      await this.#transport.send({
        command: commands.LocatorPress.create({
          browser_id: this.#browserId,
          tab_id: this.#tabId,
          selector: this.#selector,
          value,
          timeout_ms: timeoutMs,
        }),
        timeoutMs,
      });
      this.#collectionReadCache?.clear();
    } catch (error) {
      throw await this.actionError(
        error,
        "press",
        `locator.press failed for selector ${this.#selector}`,
      );
    }
  }
  async setChecked(
    checked: boolean,
    options: TimeoutOptions & { force?: boolean } = {},
  ) {
    if (typeof checked !== "boolean")
      throw new Error("locator.setChecked requires a boolean");
    try {
      await this.#transport.send({
        command: commands.LocatorSetChecked.create({
          browser_id: this.#browserId,
          tab_id: this.#tabId,
          selector: this.#selector,
          checked,
          force: options.force,
          timeout_ms: options.timeoutMs,
        }),
        timeoutMs: options.timeoutMs,
      });
      this.#collectionReadCache?.clear();
    } catch (error) {
      throw await this.actionError(
        error,
        "setChecked",
        `locator.setChecked(${checked}) failed for selector ${this.#selector}`,
      );
    }
  }
  async check(options: TimeoutOptions & { force?: boolean } = {}) {
    await this.setChecked(true, options);
  }
  async uncheck(options: TimeoutOptions & { force?: boolean } = {}) {
    await this.setChecked(false, options);
  }
  async waitFor({ state, timeoutMs }: TimeoutOptions & { state: string }) {
    if (!state) throw new Error("locator.waitFor requires a state");
    try {
      await this.#transport.send({
        command: commands.LocatorWaitFor.create({
          browser_id: this.#browserId,
          tab_id: this.#tabId,
          selector: this.#selector,
          state,
          timeout_ms: timeoutMs,
        }),
        timeoutMs,
      });
    } catch (error) {
      throw await this.actionError(
        error,
        "waitFor",
        `locator.waitFor(${state}) timed out for selector ${this.#selector}`,
      );
    }
  }
  async count(): Promise<number> {
    return (
      await this.#transport.send({
        command: commands.LocatorCount.create({
          browser_id: this.#browserId,
          tab_id: this.#tabId,
          selector: this.#selector,
        }),
      })
    ).count;
  }
  async all() {
    const count = await this.count(),
      cache = new CollectionReadCache({
        browserId: this.#browserId,
        tabId: this.#tabId,
        selector: this.#selector,
        transport: this.#transport,
      });
    return Array.from(
      { length: count },
      (_, index) =>
        new PlaywrightLocator({
          browserId: this.#browserId,
          tabId: this.#tabId,
          selector: `${this.#selector} >> nth=${index}`,
          transport: this.#transport,
          collectionReadCache: cache,
          collectionReadIndex: index,
        }),
    );
  }
  async textContent({ timeoutMs }: TimeoutOptions = {}) {
    const cached = await this.cachedRead(timeoutMs);
    return cached
      ? cached.text_content
      : (
          await this.#transport.send({
            command: commands.LocatorTextContent.create({
              browser_id: this.#browserId,
              tab_id: this.#tabId,
              selector: this.#selector,
              timeout_ms: timeoutMs,
            }),
            timeoutMs,
          })
        ).value;
  }
  async innerText({ timeoutMs }: TimeoutOptions = {}) {
    const cached = await this.cachedRead(timeoutMs);
    return cached
      ? cached.inner_text
      : (
          await this.#transport.send({
            command: commands.LocatorInnerText.create({
              browser_id: this.#browserId,
              tab_id: this.#tabId,
              selector: this.#selector,
              timeout_ms: timeoutMs,
            }),
            timeoutMs,
          })
        ).value;
  }
  async getAttribute(name: string, { timeoutMs }: TimeoutOptions = {}) {
    if (!name) throw new Error("locator.getAttribute requires a name");
    const cached = await this.cachedRead(timeoutMs);
    return cached
      ? Object.prototype.hasOwnProperty.call(cached.attributes, name)
        ? (cached.attributes[name] ?? null)
        : null
      : (
          await this.#transport.send({
            command: commands.LocatorGetAttribute.create({
              browser_id: this.#browserId,
              tab_id: this.#tabId,
              selector: this.#selector,
              name,
              timeout_ms: timeoutMs,
            }),
            timeoutMs,
          })
        ).value;
  }
  async isVisible() {
    return (
      await this.#transport.send({
        command: commands.LocatorIsVisible.create({
          browser_id: this.#browserId,
          tab_id: this.#tabId,
          selector: this.#selector,
        }),
      })
    ).value;
  }
  async isEnabled() {
    return (
      await this.#transport.send({
        command: commands.LocatorIsEnabled.create({
          browser_id: this.#browserId,
          tab_id: this.#tabId,
          selector: this.#selector,
        }),
      })
    ).value;
  }
  async allTextContents({ timeoutMs }: TimeoutOptions = {}) {
    return (
      await this.#transport.send({
        command: commands.LocatorAllTextContents.create({
          browser_id: this.#browserId,
          tab_id: this.#tabId,
          selector: this.#selector,
          timeout_ms: timeoutMs,
        }),
        timeoutMs,
      })
    ).values;
  }
  async evaluate(
    pageFunction: string | Function,
    arg?: unknown,
    options?: TimeoutOptions,
  ) {
    return (
      await this.#transport.send({
        command: commands.PlaywrightEvaluate.create({
          browser_id: this.#browserId,
          script: locatorEvaluationScript(pageFunction, arg, "single"),
          selector: this.#selector,
          tab_id: this.#tabId,
          timeout_ms: options?.timeoutMs,
        }),
        timeoutMs: options?.timeoutMs,
      })
    ).value;
  }
  async evaluateAll(
    pageFunction: string | Function,
    arg?: unknown,
    options?: TimeoutOptions,
  ) {
    return (
      await this.#transport.send({
        command: commands.PlaywrightEvaluate.create({
          browser_id: this.#browserId,
          script: locatorEvaluationScript(pageFunction, arg, "all"),
          selector: this.#selector,
          selector_mode: "all",
          tab_id: this.#tabId,
          timeout_ms: options?.timeoutMs,
        }),
        timeoutMs: options?.timeoutMs,
      })
    ).value;
  }
  async actionError(error: unknown, action: string, context: string) {
    try {
      const diagnostics = await this.evaluateAll(
        (elements: any[]) => ({
          matchCount: elements.length,
          visibleCount: elements.reduce(
            (count, element) => count + +(element.getClientRects().length > 0),
            0,
          ),
          matches: elements
            .slice(0, 5)
            .map((element) => ({
              tag: element.tagName.toLowerCase(),
              role: element.getAttribute("role"),
              type: element.getAttribute("type"),
              ariaLabel: element.getAttribute("aria-label"),
              text: element.textContent?.trim().slice(0, 120) ?? "",
              visible: element.getClientRects().length > 0,
              disabled: "disabled" in element && !!element.disabled,
            })),
        }),
        undefined,
        { timeoutMs: 1000 },
      );
      return appendErrorContext(
        error,
        `${context}\nLocator diagnostics: ${JSON.stringify({ kind: classifyActionError(error, diagnostics), action, locator: this.#selector, ...diagnostics, truncated: diagnostics.matchCount > diagnostics.matches.length })}`,
      );
    } catch {
      return appendErrorContext(error, context);
    }
  }
  async downloadMedia({ timeoutMs = 120000 }: TimeoutOptions = {}) {
    try {
      const result = await this.#transport.send({
        command: commands.LocatorDownloadMedia.create({
          browser_id: this.#browserId,
          tab_id: this.#tabId,
          selector: this.#selector,
          timeout_ms: timeoutMs,
        }),
        timeoutMs,
      });
      this.#collectionReadCache?.clear();
      return result.path;
    } catch (error) {
      throw await this.actionError(
        error,
        "downloadMedia",
        `locator.downloadMedia failed for selector ${this.#selector}`,
      );
    }
  }
  locator(selector: string, options: FilterOptions = {}) {
    if (!selector) throw new Error("locator.locator requires a selector");
    return new PlaywrightLocator({
      browserId: this.#browserId,
      tabId: this.#tabId,
      selector: `${this.#selector} >> ${selector}`,
      transport: this.#transport,
      collectionReadCache: this.#collectionReadCache,
      collectionReadIndex: this.#collectionReadIndex,
      collectionRelativeSelector:
        this.#collectionReadCache && this.#collectionReadIndex !== undefined
          ? appendRelativeSelector(this.#collectionRelativeSelector, selector)
          : undefined,
    }).filter(options);
  }
  first() {
    return new PlaywrightLocator({
      browserId: this.#browserId,
      tabId: this.#tabId,
      selector: `${this.#selector} >> ${"nth=0"}`,
      transport: this.#transport,
      collectionReadCache: this.#collectionReadCache,
      collectionReadIndex: this.#collectionReadIndex,
      collectionRelativeSelector:
        this.#collectionReadCache && this.#collectionReadIndex !== undefined
          ? appendRelativeSelector(this.#collectionRelativeSelector, "nth=0")
          : undefined,
    });
  }
  last() {
    return new PlaywrightLocator({
      browserId: this.#browserId,
      tabId: this.#tabId,
      selector: `${this.#selector} >> ${"nth=-1"}`,
      transport: this.#transport,
      collectionReadCache: this.#collectionReadCache,
      collectionReadIndex: this.#collectionReadIndex,
      collectionRelativeSelector:
        this.#collectionReadCache && this.#collectionReadIndex !== undefined
          ? appendRelativeSelector(this.#collectionRelativeSelector, "nth=-1")
          : undefined,
    });
  }
  nth(index: number) {
    if (typeof index !== "number")
      throw new Error("locator.nth requires a numeric index");
    return new PlaywrightLocator({
      browserId: this.#browserId,
      tabId: this.#tabId,
      selector: `${this.#selector} >> ${`nth=${index}`}`,
      transport: this.#transport,
      collectionReadCache: this.#collectionReadCache,
      collectionReadIndex: this.#collectionReadIndex,
      collectionRelativeSelector:
        this.#collectionReadCache && this.#collectionReadIndex !== undefined
          ? appendRelativeSelector(
              this.#collectionRelativeSelector,
              `nth=${index}`,
            )
          : undefined,
    });
  }
  and(other: PlaywrightLocator) {
    if (!(other instanceof PlaywrightLocator))
      throw new Error("locator.and requires a PlaywrightLocator");
    if (other.#browserId !== this.#browserId || other.#tabId !== this.#tabId)
      throw new Error("Locators must belong to the same tab");
    return new PlaywrightLocator({
      browserId: this.#browserId,
      tabId: this.#tabId,
      selector: `${this.#selector} >> internal:and=${JSON.stringify(other.#selector)}`,
      transport: this.#transport,
    });
  }
  or(other: PlaywrightLocator) {
    if (!(other instanceof PlaywrightLocator))
      throw new Error("locator.or requires a PlaywrightLocator");
    if (other.#browserId !== this.#browserId || other.#tabId !== this.#tabId)
      throw new Error("Locators must belong to the same tab");
    return new PlaywrightLocator({
      browserId: this.#browserId,
      tabId: this.#tabId,
      selector: `${this.#selector} >> internal:or=${JSON.stringify(other.#selector)}`,
      transport: this.#transport,
    });
  }
  filter(options: FilterOptions = {}) {
    const parts = [this.#selector];
    if (options.hasText !== undefined)
      parts.push(
        `internal:has-text=${escapeTextForSelector(options.hasText, false)}`,
      );
    if (options.hasNotText !== undefined)
      parts.push(
        `internal:has-not-text=${escapeTextForSelector(options.hasNotText, false)}`,
      );
    if (options.has !== undefined) {
      this.assertCompatibleLocator(options.has, "locator.filter has");
      parts.push(`internal:has=${JSON.stringify(options.has.#selector)}`);
    }
    if (options.hasNot !== undefined) {
      this.assertCompatibleLocator(options.hasNot, "locator.filter hasNot");
      parts.push(
        `internal:has-not=${JSON.stringify(options.hasNot.#selector)}`,
      );
    }
    if (options.visible !== undefined) {
      if (typeof options.visible !== "boolean")
        throw new Error("locator.filter visible must be a boolean");
      parts.push(`visible=${options.visible}`);
    }
    const suffix = parts.slice(1).join(" >> "),
      keepCache =
        this.#collectionReadCache &&
        this.#collectionReadIndex !== undefined &&
        (!suffix || this.#collectionRelativeSelector !== undefined);
    return new PlaywrightLocator({
      browserId: this.#browserId,
      tabId: this.#tabId,
      selector: parts.join(" >> "),
      transport: this.#transport,
      collectionReadCache: keepCache ? this.#collectionReadCache : undefined,
      collectionReadIndex: keepCache ? this.#collectionReadIndex : undefined,
      collectionRelativeSelector: keepCache
        ? appendRelativeSelector(this.#collectionRelativeSelector, suffix)
        : undefined,
    });
  }
  getByRole(role: string, options: ExactOptions & { name?: TextMatcher } = {}) {
    const selector = roleSelector(role, options);
    return new PlaywrightLocator({
      browserId: this.#browserId,
      tabId: this.#tabId,
      selector: `${this.#selector} >> ${selector}`,
      transport: this.#transport,
      collectionReadCache: this.#collectionReadCache,
      collectionReadIndex: this.#collectionReadIndex,
      collectionRelativeSelector:
        this.#collectionReadCache && this.#collectionReadIndex !== undefined
          ? appendRelativeSelector(this.#collectionRelativeSelector, selector)
          : undefined,
    });
  }
  getByText(text: TextMatcher, options: ExactOptions = {}) {
    const selector = textSelector(text, options);
    return new PlaywrightLocator({
      browserId: this.#browserId,
      tabId: this.#tabId,
      selector: `${this.#selector} >> ${selector}`,
      transport: this.#transport,
      collectionReadCache: this.#collectionReadCache,
      collectionReadIndex: this.#collectionReadIndex,
      collectionRelativeSelector:
        this.#collectionReadCache && this.#collectionReadIndex !== undefined
          ? appendRelativeSelector(this.#collectionRelativeSelector, selector)
          : undefined,
    });
  }
  getByLabel(text: TextMatcher, options: ExactOptions = {}) {
    const selector = labelSelector(text, options);
    return new PlaywrightLocator({
      browserId: this.#browserId,
      tabId: this.#tabId,
      selector: `${this.#selector} >> ${selector}`,
      transport: this.#transport,
      collectionReadCache: this.#collectionReadCache,
      collectionReadIndex: this.#collectionReadIndex,
      collectionRelativeSelector:
        this.#collectionReadCache && this.#collectionReadIndex !== undefined
          ? appendRelativeSelector(this.#collectionRelativeSelector, selector)
          : undefined,
    });
  }
  getByPlaceholder(text: TextMatcher, options: ExactOptions = {}) {
    const selector = placeholderSelector(text, options);
    return new PlaywrightLocator({
      browserId: this.#browserId,
      tabId: this.#tabId,
      selector: `${this.#selector} >> ${selector}`,
      transport: this.#transport,
      collectionReadCache: this.#collectionReadCache,
      collectionReadIndex: this.#collectionReadIndex,
      collectionRelativeSelector:
        this.#collectionReadCache && this.#collectionReadIndex !== undefined
          ? appendRelativeSelector(this.#collectionRelativeSelector, selector)
          : undefined,
    });
  }
  getByTestId(testId: TextMatcher) {
    const selector = testIdSelector(testId);
    return new PlaywrightLocator({
      browserId: this.#browserId,
      tabId: this.#tabId,
      selector: `${this.#selector} >> ${selector}`,
      transport: this.#transport,
      collectionReadCache: this.#collectionReadCache,
      collectionReadIndex: this.#collectionReadIndex,
      collectionRelativeSelector:
        this.#collectionReadCache && this.#collectionReadIndex !== undefined
          ? appendRelativeSelector(this.#collectionRelativeSelector, selector)
          : undefined,
    });
  }
  async cachedRead(timeoutMs?: number) {
    return this.#collectionReadCache && this.#collectionReadIndex !== undefined
      ? await this.#collectionReadCache.read({
          index: this.#collectionReadIndex,
          relativeSelector: this.#collectionRelativeSelector,
          timeoutMs,
        })
      : null;
  }
  assertCompatibleLocator(other: PlaywrightLocator, context: string) {
    if (!(other instanceof PlaywrightLocator))
      throw new Error(`${context} requires a PlaywrightLocator`);
    if (other.#browserId !== this.#browserId || other.#tabId !== this.#tabId)
      throw new Error("Locators must belong to the same tab");
  }
}
