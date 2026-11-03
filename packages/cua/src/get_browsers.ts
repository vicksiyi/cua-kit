import { get_browser_tabs } from "./get_browser_tabs";
import type * as T from "./tinysky_alt/types";
export async function get_browsers(provider: T.Browsers) {
  const infos: T.BrowserInfo[] = await provider.list();
  const requests = infos.map(async (info: T.BrowserInfo) => {
    try {
      const browser = await provider.get(info.id);
      const tabs = await get_browser_tabs(browser);
      return { browser: { ...info, tabs }, error: undefined };
    } catch (error) {
      return {
        browser: { ...info, tabs: [] },
        error: `Browser ${info.id}: ${String(error)}`,
      };
    }
  });
  const results = await Promise.all(requests);
  const browsers = results.map((result) => result.browser),
    errors: string[] = [];
  for (const result of results)
    if (result.error !== undefined) errors.push(result.error);
  return { browsers, errors };
}
