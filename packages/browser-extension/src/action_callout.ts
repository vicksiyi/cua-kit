/** Restored uk/dk/hk/fk and pk/mk/gk/Pf/xf/No closures. */
const badgeColors = [
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#dc2626",
  "#ea580c",
  "#059669",
  "#0891b2",
  "#4f46e5",
];
export const ACTION_CALLOUT_VERSION_KEY =
  "lastSeenExtensionActionCalloutVersion";
export const ACTION_CALLOUT = {
  badgeBackgroundColor: "#0169cc",
  badgeText: "NEW",
  title:
    "Use the new ChatGPT side chat feature. Open the ChatGPT extension to continue.",
  version: 1,
};
export function normalizeActionBadgeLabel(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const label = input.trim().replace(/\s+/gu, " ");
  return label.length === 0 ? null : label.slice(0, 24);
}
export function getActionBadge(input: unknown) {
  const label = normalizeActionBadgeLabel(input);
  if (label == null) return null;
  let hash = 0;
  for (const character of label)
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const words = label.match(/[A-Za-z0-9]+/gu) ?? [];
  const text = (
    words.length > 1
      ? words.map((word) => word[0]).join("")
      : (words[0] ?? label)
  )
    .slice(0, 4)
    .toUpperCase();
  return { backgroundColor: badgeColors[hash % badgeColors.length], text };
}
export function createActionCallout(
  browser: Pick<typeof chrome, "action" | "runtime" | "storage">,
) {
  let queue: Promise<unknown> = Promise.resolve();
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const pending = queue.then(operation);
    queue = pending.catch(() => {});
    return pending;
  }
  async function isSeen() {
    const version = (
      await browser.storage.local.get(ACTION_CALLOUT_VERSION_KEY)
    )[ACTION_CALLOUT_VERSION_KEY];
    return typeof version === "number" && version >= ACTION_CALLOUT.version;
  }
  async function applyBadge(label: unknown) {
    const badge = getActionBadge(label);
    if (badge == null) {
      await browser.action.setBadgeText({ text: "" });
      return;
    }
    await Promise.all([
      browser.action.setBadgeBackgroundColor({ color: badge.backgroundColor }),
      browser.action.setBadgeText({ text: badge.text }),
    ]);
  }
  return {
    setBadge(label: unknown) {
      return enqueue(() => applyBadge(label));
    },
    show() {
      return enqueue(async () => {
        if (await isSeen()) return;
        await Promise.all([
          browser.action.setTitle({ title: ACTION_CALLOUT.title }),
          browser.action.setBadgeBackgroundColor({
            color: ACTION_CALLOUT.badgeBackgroundColor,
          }),
          browser.action.setBadgeText({ text: ACTION_CALLOUT.badgeText }),
        ]);
      });
    },
    clear(label: unknown = "") {
      return enqueue(async () => {
        if (await isSeen()) return;
        const manifest = browser.runtime.getManifest();
        await Promise.all([
          browser.action.setTitle({
            title: manifest.action?.default_title ?? manifest.name,
          }),
          applyBadge(label),
        ]);
        await browser.storage.local.set({
          [ACTION_CALLOUT_VERSION_KEY]: ACTION_CALLOUT.version,
        });
      });
    },
  };
}
