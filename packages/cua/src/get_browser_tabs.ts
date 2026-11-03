import type * as T from "./tinysky_alt/types";
export async function get_browser_tabs(browser: T.Browser) {
  let userTabs = Promise.resolve<any[]>([]); // @oai/browser declarations are not shipped beside this bundled artifact.
  if (browser.user?.openTabs)
    userTabs = browser.user.openTabs().catch((error: unknown) => {
      console.error(error);
      return [];
    });
  const managedTabs = browser.tabs.list();
  const [user, managed] = await Promise.all([userTabs, managedTabs]);
  const merged = new Map();
  for (const tab of user) merged.set(tab.id, tab);
  for (const tab of managed) merged.set(tab.id, tab);
  return Array.from(merged.values());
}
