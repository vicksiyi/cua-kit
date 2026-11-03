import { defineCommand } from "./define_command";
import type { PlaywrightService } from "../playwright/service";
import type { LocatorClickRequest } from "../playwright/click";
export interface LocatorCommandPayload extends LocatorClickRequest {
  name?: unknown;
  relative_selector?: string;
  state?: unknown;
}
export interface LocatorCommandContext {
  acquireAuthority(): {
    actInFrame(url: unknown): { assert(): Promise<unknown> };
    observeContent(url: unknown): { assert(): Promise<unknown> };
  };
  security: { currentTabUrl(tabId: number): Promise<unknown> };
  followSessionTab(tabId: number): Promise<unknown>;
  playwright: Pick<
    PlaywrightService,
    | "clickLocator"
    | "countLocator"
    | "readElementState"
    | "evaluateOnPlaywrightSelector"
    | "evaluateOnPlaywrightSelectorAll"
  >;
}
/** Original s2/u2. */
export const PlaywrightLocatorClickCommand = defineCommand(
  "playwright_locator_click",
  async (payload: LocatorCommandPayload, context: LocatorCommandContext) => {
    await context
      .acquireAuthority()
      .actInFrame(await context.security.currentTabUrl(Number(payload.tab_id)))
      .assert();
    await context.followSessionTab(Number(payload.tab_id));
    await context.playwright.clickLocator(payload, 1);
    return {};
  },
);
export const PlaywrightLocatorDblclickCommand = defineCommand(
  "playwright_locator_dblclick",
  async (payload: LocatorCommandPayload, context: LocatorCommandContext) => {
    await context
      .acquireAuthority()
      .actInFrame(await context.security.currentTabUrl(Number(payload.tab_id)))
      .assert();
    await context.followSessionTab(Number(payload.tab_id));
    await context.playwright.clickLocator(payload, 2);
    return {};
  },
);
/** Original a2/c2/d2/p2/m2/f2/w2/_2/v2. */
export const PlaywrightLocatorCountCommand = defineCommand(
  "playwright_locator_count",
  async (payload: LocatorCommandPayload, context: LocatorCommandContext) => {
    await context
      .acquireAuthority()
      .observeContent(
        await context.security.currentTabUrl(Number(payload.tab_id)),
      )
      .assert();
    return { count: await context.playwright.countLocator(payload) };
  },
);
export const PlaywrightLocatorGetAttributeCommand = defineCommand(
  "playwright_locator_get_attribute",
  async (payload: LocatorCommandPayload, context: LocatorCommandContext) => {
    if (typeof payload.name !== "string" || !payload.name)
      throw new Error("playwright_locator_get_attribute requires name");
    const url = await context.security.currentTabUrl(Number(payload.tab_id));
    await context.acquireAuthority().observeContent(url).assert();
    return {
      value: await context.playwright.evaluateOnPlaywrightSelector(
        payload.tab_id,
        payload.selector,
        (element: any, injected: any, { name }: { name: string }) =>
          name.toLowerCase() === "value" &&
          injected.isProtectedCredentialField(element)
            ? null
            : element.getAttribute(name),
        { arg: { name: payload.name }, timeoutMs: payload.timeout_ms },
      ),
    };
  },
);
export const PlaywrightLocatorInnerTextCommand = defineCommand(
  "playwright_locator_inner_text",
  async (payload: LocatorCommandPayload, context: LocatorCommandContext) => {
    await context
      .acquireAuthority()
      .observeContent(
        await context.security.currentTabUrl(Number(payload.tab_id)),
      )
      .assert();
    return {
      value: await context.playwright.evaluateOnPlaywrightSelector(
        payload.tab_id,
        payload.selector,
        (element: any) =>
          "innerText" in element ? String(element.innerText) : "",
        { timeoutMs: payload.timeout_ms },
      ),
    };
  },
);
export const PlaywrightLocatorIsEnabledCommand = defineCommand(
  "playwright_locator_is_enabled",
  async (payload: LocatorCommandPayload, context: LocatorCommandContext) => {
    await context
      .acquireAuthority()
      .observeContent(
        await context.security.currentTabUrl(Number(payload.tab_id)),
      )
      .assert();
    return {
      value: await context.playwright.readElementState(payload, "enabled"),
    };
  },
);
export const PlaywrightLocatorIsVisibleCommand = defineCommand(
  "playwright_locator_is_visible",
  async (payload: LocatorCommandPayload, context: LocatorCommandContext) => {
    await context
      .acquireAuthority()
      .observeContent(
        await context.security.currentTabUrl(Number(payload.tab_id)),
      )
      .assert();
    return {
      value: await context.playwright.readElementState(payload, "visible"),
    };
  },
);
export const PlaywrightLocatorAllTextContentsCommand = defineCommand(
  "playwright_locator_all_text_contents",
  async (payload: LocatorCommandPayload, context: LocatorCommandContext) => {
    await context
      .acquireAuthority()
      .observeContent(
        await context.security.currentTabUrl(Number(payload.tab_id)),
      )
      .assert();
    return {
      values: await context.playwright.evaluateOnPlaywrightSelectorAll(
        payload.tab_id,
        payload.selector,
        (elements: any[]) =>
          elements.map((element) =>
            typeof element.textContent === "string" ? element.textContent : "",
          ),
        { timeoutMs: payload.timeout_ms },
      ),
    };
  },
);
export const PlaywrightLocatorTextContentCommand = defineCommand(
  "playwright_locator_text_content",
  async (payload: LocatorCommandPayload, context: LocatorCommandContext) => {
    await context
      .acquireAuthority()
      .observeContent(
        await context.security.currentTabUrl(Number(payload.tab_id)),
      )
      .assert();
    return {
      value: await context.playwright.evaluateOnPlaywrightSelector(
        payload.tab_id,
        payload.selector,
        (element: any) => element.textContent,
        { timeoutMs: payload.timeout_ms },
      ),
    };
  },
);
export const PlaywrightLocatorReadAllCommand = defineCommand(
  "playwright_locator_read_all",
  async (payload: LocatorCommandPayload, context: LocatorCommandContext) => {
    await context
      .acquireAuthority()
      .observeContent(
        await context.security.currentTabUrl(Number(payload.tab_id)),
      )
      .assert();
    return {
      values: await context.playwright.evaluateOnPlaywrightSelectorAll(
        payload.tab_id,
        payload.selector,
        (
          elements: any[],
          injected: any,
          options: { relativeSelector?: string },
        ) => {
          const reader = {
            read(element: any) {
              return {
                attributes: Object.fromEntries(
                  Array.from(element.attributes as Iterable<Attr>)
                    .filter(
                      (attribute) =>
                        attribute.name.toLowerCase() !== "value" ||
                        !injected.isProtectedCredentialField(element),
                    )
                    .map((attribute) => [attribute.name, attribute.value]),
                ),
                inner_text:
                  "innerText" in element ? String(element.innerText) : "",
                text_content: element.textContent,
              };
            },
          };
          if (!options.relativeSelector)
            return elements.map((element) => reader.read(element));
          const helper = injected,
            parsed = helper.parseSelector(options.relativeSelector);
          return elements.map((element) => {
            const matches = helper.querySelectorAll(parsed, element);
            return matches[0] ? reader.read(matches[0]) : null;
          });
        },
        {
          arg: { relativeSelector: payload.relative_selector },
          timeoutMs: payload.timeout_ms,
        },
      ),
    };
  },
);
export const PlaywrightLocatorWaitForCommand = defineCommand(
  "playwright_locator_wait_for",
  async (payload: LocatorCommandPayload, context: LocatorCommandContext) => {
    await context
      .acquireAuthority()
      .observeContent(
        await context.security.currentTabUrl(Number(payload.tab_id)),
      )
      .assert();
    const state = payload.state ?? "visible";
    if (
      state !== "attached" &&
      state !== "detached" &&
      state !== "visible" &&
      state !== "hidden"
    )
      throw new Error(`Unsupported waitFor state: ${String(state)}`);
    await context.playwright.evaluateOnPlaywrightSelectorAll(
      payload.tab_id,
      payload.selector,
      (elements: any[], injected: any, options: { state: string }) => {
        const element = elements[0] ?? null;
        if (options.state === "attached") {
          if (element) return true;
          throw new Error("Element is not attached");
        }
        if (options.state === "detached") {
          if (!element) return true;
          throw new Error("Element is still attached");
        }
        if (!element) {
          if (options.state === "hidden") return true;
          throw new Error("Element is not attached");
        }
        const result = injected.elementState(element, options.state);
        if (result.received === "error:notconnected")
          throw new Error("Element is not connected");
        if (result.matches) return true;
        throw new Error("Element is not " + options.state);
      },
      { arg: { state }, timeoutMs: payload.timeout_ms },
    );
    return {};
  },
);
