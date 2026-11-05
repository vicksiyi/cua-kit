import type { Page } from "playwright";
import { installPageHttpRouting } from "./page-http-routing";

/** Attached browsers must not inherit the owned browser's context-wide routes. */
export async function createPageNetworkLease(page: Page) {
  let predicate: ((url: string) => boolean) | undefined;
  let released = false;
  const http = await installPageHttpRouting(
    page,
    (url) => predicate?.(url) === true,
  );
  try {
    await page.routeWebSocket("**/*", (socket) => {
      // No routeWebSocket removal API exists in this Playwright build. Keep a
      // transparent pass-through after release until this client disconnects.
      if (released) socket.connectToServer();
      else socket.close();
    });
  } catch (error) {
    await http.close();
    throw error;
  }
  return {
    setPolicy(allowed: (url: string) => boolean) {
      if (released) throw Error("Page network lease is released");
      predicate = allowed;
    },
    async close() {
      if (released) return;
      released = true;
      predicate = undefined;
      await http.close();
    },
  };
}
