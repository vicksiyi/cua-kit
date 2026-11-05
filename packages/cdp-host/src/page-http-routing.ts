import type { Page, Route } from "playwright";
/** One page's HTTP routing lease. Redirect/target policy still requires the CDP layer.
 * Never installs context-wide routes or removes other clients' handlers.
 */
export async function installPageHttpRouting(
  page: Page,
  allowed: (url: string) => boolean,
) {
  let active = true;
  const handler = async (route: Route) => {
    if (!active) {
      await route.fallback();
      return;
    }
    let accepted = false;
    try {
      accepted = allowed(route.request().url());
    } catch {}
    if (accepted) await route.fallback();
    else await route.abort("blockedbyclient");
  };
  await page.route("**/*", handler);
  let closing: Promise<void> | undefined;
  return {
    close: () =>
      (closing ??= (async () => {
        active = false;
        if (!page.isClosed()) await page.unroute("**/*", handler);
      })()),
  };
}
