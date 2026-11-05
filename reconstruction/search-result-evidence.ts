/** Test-only evidence extraction. Never fills in or repairs the agent's answer. */
export function observedSearchLinks(snapshot: string): string[] {
  const links = new Set<string>();
  const headings =
    /heading[^\n]*deepseek[^\n]*\n\s*- link[^\n]*\n\s*- \/url: (https?:\/\/[^\s]+)/gi;
  for (const match of snapshot.matchAll(headings)) {
    const raw = match[1]!;
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    if (url.hostname.endsWith("bing.com") && url.pathname === "/ck/a") {
      const encoded = url.searchParams.get("u");
      // A clipped redirect URL is not sufficient evidence for a destination.
      if (!encoded?.startsWith("a1")) continue;
      const decoded = Buffer.from(encoded.slice(2), "base64url").toString(
        "utf8",
      );
      try {
        if (!["https:", "http:"].includes(new URL(decoded).protocol)) continue;
      } catch {
        continue;
      }
      links.add(decoded);
    }
    links.add(raw);
  }
  // Structured DOM queries may return title/destination instead of AX headings.
  for (const match of snapshot.matchAll(/\{[^{}]*\}/g)) {
    try {
      const row = JSON.parse(match[0]);
      if (typeof row.title !== "string" || !/deepseek/i.test(row.title))
        continue;
      const link = row.dest ?? row.url;
      if (
        typeof link === "string" &&
        ["http:", "https:"].includes(new URL(link).protocol)
      )
        links.add(link);
    } catch {
      /* Not a standalone observed JSON record. */
    }
  }
  return [...links];
}
