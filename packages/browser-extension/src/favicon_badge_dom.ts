import { isFaviconBadgeUrl } from "./content_runtime";
type Badge = "active" | "deliverable" | "handoff";
interface BadgedLink {
  badgedHref: string;
  createdByCodex: boolean;
  originalHref: string | null;
  link: HTMLLinkElement;
}
const badgeSelector = 'link[data-codex-favicon-badge="true"]';
const iconSelector = 'link[rel~="icon"], link[rel="shortcut icon"]';
const cursorPath =
  "M3.04536 4.45259C2.7582 3.60299 3.60299 2.7582 4.45259 3.04536L14.1828 6.33403C15.1637 6.66558 15.0872 8.08006 14.0715 8.39045L10.2994 9.54319C9.93919 9.65327 9.65327 9.93919 9.54319 10.2994L8.39046 14.0715C8.08007 15.0872 6.66558 15.1637 6.33404 14.1828L3.04536 4.45259Z";
function badgeShape(badge: Badge): string {
  switch (badge) {
    case "active":
      return `<path d="${cursorPath}" fill="black" stroke="white" stroke-width="1.5" stroke-linejoin="round" paint-order="stroke fill" transform="translate(-2 -2) scale(2.1)" />`;
    case "deliverable":
      return '<circle cx="24" cy="24" r="7" fill="#22c55e" />';
    case "handoff":
      return '<circle cx="24" cy="24" r="7" fill="#facc15" />';
  }
}
function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
function badgeUrl(badge: Badge, icon: string) {
  const opacity = badge === "active" ? ' opacity="0.3"' : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" data-codex-favicon-badge="codex-favicon-badge" width="32" height="32" viewBox="0 0 32 32"><image href="${escapeAttribute(icon)}" width="32" height="32"${opacity} />${badgeShape(badge)}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
/** Original content-script Et/Rt and complete DOM restoration/rendering closure. */
export function createFaviconBadgeDom(host: {
  document: Document;
  setTimeout: typeof globalThis.setTimeout;
}) {
  const document = host.document;
  const schedule = host.setTimeout;
  let active: BadgedLink[] = [],
    deferred: Array<[HTMLLinkElement, string]> = [];
  function clearMetadata(link: HTMLLinkElement) {
    delete link.dataset.codexFaviconBadge;
    delete link.dataset.codexFaviconBadgeCreated;
    delete link.dataset.codexOriginalFaviconHref;
  }
  function restoreLink(
    link: HTMLLinkElement,
    created: boolean,
    href: string | null,
  ) {
    if (created) {
      if (!deferred.some(([candidate]) => candidate === link)) link.remove();
      return;
    }
    if (href == null) link.removeAttribute("href");
    else link.href = href;
  }
  function flushDeferred() {
    const previous = deferred;
    deferred = [];
    for (const [link, rel] of previous) {
      if (isFaviconBadgeUrl(link.getAttribute("href"))) link.remove();
      else if (link.rel === "apple-touch-icon") link.rel = rel;
    }
  }
  function restoreAll() {
    const previous = active;
    active = [];
    for (const { badgedHref, createdByCodex, originalHref, link } of previous) {
      const href = link.getAttribute("href"),
        ours = href === badgedHref || isFaviconBadgeUrl(href);
      clearMetadata(link);
      if (ours) restoreLink(link, createdByCodex, originalHref);
    }
    for (const link of document.querySelectorAll<HTMLLinkElement>(
      badgeSelector,
    )) {
      if (!isFaviconBadgeUrl(link.getAttribute("href"))) {
        clearMetadata(link);
        continue;
      }
      const created = link.dataset.codexFaviconBadgeCreated === "true",
        href = link.dataset.codexOriginalFaviconHref ?? null;
      clearMetadata(link);
      restoreLink(link, created, href);
    }
  }
  function prepareLinks(href: string): BadgedLink[] {
    const links = [...document.querySelectorAll<HTMLLinkElement>(iconSelector)];
    if (links.length > 0)
      return links.map((link) => ({
        badgedHref: href,
        createdByCodex: false,
        originalHref: link.getAttribute("href"),
        link,
      }));
    const link = document.createElement("link");
    link.rel = "icon";
    let head = document.head;
    if (!head) {
      head = document.createElement("head");
      document.documentElement.prepend(head);
    }
    head.appendChild(link);
    return [
      { badgedHref: href, createdByCodex: true, originalHref: null, link },
    ];
  }
  function clear(): Promise<void> {
    if (deferred.length === 0) {
      for (const link of document.querySelectorAll<HTMLLinkElement>(
        badgeSelector,
      ))
        if (isFaviconBadgeUrl(link.getAttribute("href"))) {
          deferred.push([link, link.rel]);
          link.rel = "apple-touch-icon";
        }
      restoreAll();
    }
    return new Promise((resolve) => {
      schedule(() => {
        flushDeferred();
        resolve();
      }, 0);
    });
  }
  function apply(
    badge: Badge | null | undefined,
    icon: string | null | undefined,
  ): Promise<void> {
    if (badge == null || icon == null) return clear();
    flushDeferred();
    restoreAll();
    active = prepareLinks(badgeUrl(badge, icon));
    for (const { badgedHref, createdByCodex, originalHref, link } of active) {
      link.href = badgedHref;
      link.dataset.codexFaviconBadge = "true";
      if (createdByCodex) link.dataset.codexFaviconBadgeCreated = "true";
      else delete link.dataset.codexFaviconBadgeCreated;
      if (originalHref == null) delete link.dataset.codexOriginalFaviconHref;
      else link.dataset.codexOriginalFaviconHref = originalHref;
    }
    return Promise.resolve();
  }
  return { apply };
}
/** Original Fn/Gn/je message guards, including its permissive object definition. */
export function isContentPing(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as any).type === "CONTENT_PING"
  );
}
export function isFaviconBadgeMessage(value: unknown): value is {
  badge: Badge | null | undefined;
  faviconDataUrl: string | null | undefined;
} {
  if (
    typeof value !== "object" ||
    value === null ||
    (value as any).type !== "TAB_FAVICON_BADGE"
  )
    return false;
  const message = value as any;
  return message.badge == null
    ? message.faviconDataUrl == null
    : typeof message.faviconDataUrl === "string" &&
        (message.badge === "active" ||
          message.badge === "deliverable" ||
          message.badge === "handoff");
}
/** Original Un. Overlay setup remains an explicit dependency until its closure is restored. */
export function createContentMessageInitializer(host: {
  chrome: typeof chrome;
  ensureOverlay(): unknown;
  badges: ReturnType<typeof createFaviconBadgeDom>;
}) {
  let initialized = false;
  return function initialize() {
    if (initialized) {
      host.ensureOverlay();
      return;
    }
    initialized = true;
    host.ensureOverlay();
    host.chrome.runtime.onMessage.addListener((message, _sender, reply) => {
      if (isContentPing(message)) {
        reply({ ok: true });
        return true;
      }
      if (isFaviconBadgeMessage(message)) {
        host.badges
          .apply(message.badge, message.faviconDataUrl)
          .then(() => reply({ ok: true }));
        return true;
      }
      return false;
    });
  };
}
