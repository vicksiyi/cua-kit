import { browserDetails, type ProviderBrowserInfo } from "../browser_info";
import type { EnvironmentSource } from "../capability_filter";
import {
  GetBrowserCommand,
  GetDefaultBrowserCommand,
  GetBrowserForUrlCommand,
  GetDocumentationCommand,
  ListBrowsersCommand,
} from "../../commands/browser_inventory";
import { BrowserDocumentation } from "../../commands/browser_session";
/** Structural provider/documentation boundaries inferred from original call sites. */
export interface BrowserContext {
  refresh(): unknown | Promise<unknown>;
  get(id: string): Promise<{ id: string; info: ProviderBrowserInfo }>;
  getForUrl(url: string): Promise<{ id: string; info: ProviderBrowserInfo }>;
  getDefault(): Promise<{ id: string; info: ProviderBrowserInfo }>;
  list(): unknown | Promise<unknown>;
}
export interface ServiceDocumentation {
  read(name: string): unknown | Promise<unknown>;
  readBrowser(
    info: Awaited<ReturnType<typeof browserDetails>>,
  ): unknown | Promise<unknown>;
}
/** Original xx. */
export async function getBrowser(
  payload: { id: string },
  context: BrowserContext,
  runtime: EnvironmentSource,
) {
  await context.refresh();
  const browser = await context.get(payload.id);
  return browserDetails(runtime, browser.id, browser.info);
}
export namespace getBrowser {
  export const type = GetBrowserCommand.commandType;
}
/** Original Ex: no refresh before documentation lookup. */
export async function getBrowserDocumentation(
  payload: { browser_id: string },
  context: BrowserContext,
  runtime: EnvironmentSource,
  documentation: ServiceDocumentation,
) {
  const browser = await context.get(payload.browser_id);
  return await documentation.readBrowser(
    await browserDetails(runtime, browser.id, browser.info),
  );
}
export namespace getBrowserDocumentation {
  export const type = BrowserDocumentation.commandType;
}
/** Original Tx. */
export async function getBrowserForUrl(
  payload: { url: string },
  context: BrowserContext,
  runtime: EnvironmentSource,
) {
  await context.refresh();
  const browser = await context.getForUrl(payload.url);
  return browserDetails(runtime, browser.id, browser.info);
}
export namespace getBrowserForUrl {
  export const type = GetBrowserForUrlCommand.commandType;
}
/** Original Cx. */
export async function getDefaultBrowser(
  payload: unknown,
  context: BrowserContext,
  runtime: EnvironmentSource,
) {
  await context.refresh();
  const browser = await context.getDefault();
  return browserDetails(runtime, browser.id, browser.info);
}
export namespace getDefaultBrowser {
  export const type = GetDefaultBrowserCommand.commandType;
}
/** Original Ax. */
export async function getDocumentation(
  payload: { name: string },
  context: BrowserContext,
  runtime: EnvironmentSource,
  documentation: ServiceDocumentation,
) {
  return await documentation.read(payload.name);
}
export namespace getDocumentation {
  export const type = GetDocumentationCommand.commandType;
}
/** Original Px: list is returned raw after refresh. */
export async function listBrowsers(payload: unknown, context: BrowserContext) {
  await context.refresh();
  return context.list();
}
export namespace listBrowsers {
  export const type = ListBrowsersCommand.commandType;
}
/** Original c6: browser-independent handlers, separate from per-browser l6 command table. */
export const browserInventoryCommands = {
  [GetBrowserCommand.commandType]: getBrowser,
  [GetDefaultBrowserCommand.commandType]: getDefaultBrowser,
  [BrowserDocumentation.commandType]: getBrowserDocumentation,
  [GetDocumentationCommand.commandType]: getDocumentation,
  [GetBrowserForUrlCommand.commandType]: getBrowserForUrl,
  [ListBrowsersCommand.commandType]: listBrowsers,
};
