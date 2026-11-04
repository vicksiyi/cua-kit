import { browserFamilies, isBrowserFamily } from "@core/browser/browserFamily";
export { browserFamilies };
export type ExtensionBrowserFamily = keyof typeof browserFamilies;
const newTabPaths = ["newtab/", "new-tab-page/", "new-tab-page-third-party/"];

/** Original Jt: Brave presence wins; otherwise the rightmost user-agent token wins. */
export function identifyBrowserFamily(
  userAgent: string,
  brave = false,
): ExtensionBrowserFamily {
  if (brave) {
    const family = Object.keys(browserFamilies).find(
      (value) => value === "brave",
    );
    if (family != null && isBrowserFamily(family))
      return family as ExtensionBrowserFamily;
  }
  let family: ExtensionBrowserFamily = "chrome",
    lastPosition = -1;
  for (const candidate of Object.keys(browserFamilies).filter(
    isBrowserFamily,
  ) as ExtensionBrowserFamily[]) {
    for (const identifier of browserFamilies[candidate].userAgentIdentifiers) {
      const position = userAgent.lastIndexOf(identifier);
      if (position > lastPosition) {
        family = candidate;
        lastPosition = position;
      }
    }
  }
  return family;
}
/** Original Cn/dc: internal schemes are prefix checks, new-tab URLs require exact trailing-slash paths. */
export function isBrowserInternalTab(family: string, url: any) {
  return (
    url != null &&
    browserFamilies[family as ExtensionBrowserFamily].internalUrlSchemes.some(
      (scheme) => url.startsWith(`${scheme}://`),
    )
  );
}
export function isBrowserNewTab(family: string, url: any) {
  return (
    url != null &&
    browserFamilies[family as ExtensionBrowserFamily].internalUrlSchemes.some(
      (scheme) => newTabPaths.some((path) => url === `${scheme}://${path}`),
    )
  );
}
/** Original Rr/Km. Non-strings use the build default; unknown strings are rejected. */
export function extensionBuildChannel(
  value: unknown,
): "dev" | "internal" | "prod" {
  if (typeof value !== "string") return "prod";
  switch (value) {
    case "dev":
    case "internal":
    case "prod":
      return value;
    default:
      throw new Error(
        `Unsupported extension build channel "${value}". Use "dev", "internal", or "prod".`,
      );
  }
}
