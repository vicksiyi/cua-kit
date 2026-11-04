import { isIP } from "node:net";
import { publicBrowserType } from "../browser_info";
import { isBrowserFamily } from "../browser_family";
/** Original NA/hb. Dot never aliases the ordinary IAB surface. */
export function findDirectoryBrowser(browsers: any[], requested: string) {
  return browsers.find((browser) => {
    const info = "info" in browser ? browser.info : browser;
    if (browser.id === "dot" || requested === "dot")
      return browser.id === requested;
    if (["extension", "iab", "cdp", "mcpapps"].includes(requested))
      return publicBrowserType(info.type) === requested;
    return isBrowserFamily(requested)
      ? info.type === "extension" && (info.family ?? "chrome") === requested
      : browser.id === requested;
  });
}
export function matchesBrowserPreference(info: any, preference: any) {
  return (
    preference != null &&
    info.type === "extension" &&
    info.metadata?.extensionInstanceId === preference.extensionInstanceId
  );
}
export function selectDefaultBrowser(browsers: any[], preference: any) {
  return (
    browsers.find(({ info }) => info.type === "iab") ??
    browsers.find(({ info }) => matchesBrowserPreference(info, preference)) ??
    browsers.find(({ info }) => info.type === "extension") ??
    browsers[0]
  );
}
export function isLocalBrowserUrl(url: URL) {
  const host = url.hostname.toLowerCase();
  return (
    url.protocol === "file:" ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host === "::1"
  );
}
export function hostnameHierarchyMatches(left: string, right: string) {
  const a = left.toLowerCase().replace(/\.$/, ""),
    b = right.toLowerCase().replace(/\.$/, "");
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.includes(".") && isIP(short) === 0 && long.endsWith(`.${short}`);
}
function preferred(candidates: any[]) {
  return (
    candidates.find((browser) => browser.type === "iab") ??
    candidates.find((browser) => browser.matchesPreferredExtension) ??
    candidates[0]
  );
}
function withoutHash(url: URL) {
  const copy = new URL(url);
  copy.hash = "";
  return copy.href;
}
function matching(candidates: any[], target: URL, kind: string) {
  return candidates.filter(({ openTabUrls }) =>
    openTabUrls.some((value: string) => {
      let url;
      try {
        url = new URL(value);
      } catch {
        return false;
      }
      switch (kind) {
        case "exact":
          return withoutHash(url) === withoutHash(target);
        case "originPathname":
          return (
            url.origin === target.origin && url.pathname === target.pathname
          );
        case "hostname":
          return url.hostname === target.hostname;
        case "hostnameHierarchy":
          return hostnameHierarchyMatches(url.hostname, target.hostname);
      }
    }),
  );
}
/** Original rce. Match quality wins before IAB/preferred-extension tie breaking. */
export function chooseBrowserForUrl(candidates: any[], input: string | URL) {
  const url = typeof input === "string" ? new URL(input) : input;
  if (candidates.length === 1) return candidates[0]?.id;
  const iab = candidates.filter((browser) => browser.type === "iab"),
    extensions = candidates.filter((browser) => browser.type === "extension");
  if (isLocalBrowserUrl(url) && iab.length > 0) return preferred(iab)?.id;
  const eligible = [...iab, ...extensions];
  return (
    preferred(matching(eligible, url, "exact"))?.id ??
    preferred(matching(eligible, url, "originPathname"))?.id ??
    preferred(matching(eligible, url, "hostname"))?.id ??
    preferred(matching(eligible, url, "hostnameHierarchy"))?.id ??
    preferred(iab)?.id ??
    preferred(extensions)?.id ??
    candidates[0]?.id
  );
}
/** Original Wx. The race timer is cleared on both fulfillment and rejection. */
export async function browserBackendDeadline<T>(
  pending: Promise<T>,
  timeoutMs = 5000,
  label = "browser backend info",
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(`Timed out after ${timeoutMs}ms waiting for ${label}.`),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
/** Original oce: synchronous provider invocation errors precede the catch. */
export async function openBrowserTabUrls(api: any, type: string) {
  if (type !== "iab" && type !== "extension") return [];
  const pending = type === "extension" ? api.getUserTabs() : api.getTabs();
  try {
    return (
      await browserBackendDeadline<any[]>(pending, 1000, "open browser tabs")
    ).flatMap(({ url }) => (typeof url === "string" ? [url] : []));
  } catch {
    return [];
  }
}
export async function selectBrowserForUrl(
  browsers: any[],
  input: string,
  preference: any,
) {
  const url = new URL(input);
  if (browsers.length === 1) return browsers[0];
  if (isLocalBrowserUrl(url)) {
    const iab = browsers.find(({ info }) => info.type === "iab");
    if (iab != null) return iab;
  }
  const candidates = await Promise.all(
    browsers.map(async (browser) => ({
      id: browser.id,
      matchesPreferredExtension: matchesBrowserPreference(
        browser.info,
        preference,
      ),
      openTabUrls: await openBrowserTabUrls(browser.api, browser.info.type),
      type: browser.info.type,
    })),
  );
  const selected = chooseBrowserForUrl(candidates, url);
  return browsers.find((browser) => browser.id === selected);
}
