const conversationQueryKeys = new Set([
  "messageId",
  "onboarding_conversation",
  "owner_user_id",
  "surface",
  "tab",
  "temporary-chat",
]);
/** Original ne. This is persisted conversation URL validation, not a general URL permission gate. */
export function normalizeSidePanelConversationUrl({
  value,
  workModeUrl,
}: {
  value: unknown;
  workModeUrl: string | null;
}) {
  if (workModeUrl == null || typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      url.origin !== new URL(workModeUrl).origin ||
      url.hash.length > 0 ||
      url.username.length > 0 ||
      url.password.length > 0
    )
      return null;
    for (const key of url.searchParams.keys())
      if (!conversationQueryKeys.has(key)) return null;
    const surfaces = url.searchParams.getAll("surface");
    if (
      surfaces.length > 1 ||
      (surfaces[0] != null && surfaces[0] !== "browser_side_chat")
    )
      return null;
    url.searchParams.set("surface", "browser_side_chat");
    return url.href;
  } catch {
    return null;
  }
}
/** Original D: retain the original explicit allow/sandbox policy. */
export function createSidePanelFrame(
  container: Element,
  pageDocument: Document,
  url: string,
) {
  const frame = pageDocument.createElement("iframe"),
    origin = new URL(url).origin;
  frame.setAttribute(
    "allow",
    `autoplay ${origin}; camera ${origin}; clipboard-write ${origin}; microphone ${origin}`,
  );
  frame.setAttribute(
    "sandbox",
    [
      "allow-downloads",
      "allow-forms",
      "allow-modals",
      "allow-orientation-lock",
      "allow-pointer-lock",
      "allow-popups",
      "allow-popups-to-escape-sandbox",
      "allow-presentation",
      "allow-same-origin",
      "allow-same-site-none-cookies",
      "allow-scripts",
      "allow-storage-access-by-user-activation",
    ].join(" "),
  );
  frame.src = url;
  frame.title = "ChatGPT";
  container.replaceChildren(frame);
  return frame;
}
export interface SidePanelPageController {
  setActive(active: boolean): void;
  dispose(): void;
}
export interface SidePanelPageOptions {
  frameContainer: HTMLElement;
  pageDocument: Document;
  tab: chrome.tabs.Tab & { id: number };
  workModeUrl: string;
}
export type SidePanelPageFactory = (
  options: SidePanelPageOptions,
) => Promise<SidePanelPageController | undefined>;
/** Original it: Edge's window-scoped panel retains one page per tab. */
export async function startWindowSidePanelPage(
  host: {
    chrome: Pick<typeof chrome, "tabs">;
    createPanel: SidePanelPageFactory;
  },
  {
    frameContainer,
    pageDocument,
    windowId,
    workModeUrl,
  }: {
    frameContainer: HTMLElement;
    pageDocument: Document;
    windowId: number;
    workModeUrl: string;
  },
) {
  const panels = new Map<
    number,
    { container: HTMLDivElement; panel: ReturnType<SidePanelPageFactory> }
  >();
  let generation = 0,
    disposed = false;
  const refresh = async () => {
    const current = ++generation;
    for (const { container, panel } of panels.values()) {
      container.hidden = true;
      panel.then((value) => value?.setActive(!container.hidden));
    }
    const [tab] = await host.chrome.tabs.query({ active: true, windowId });
    if (disposed || generation !== current || tab?.id == null) return;
    let entry = panels.get(tab.id);
    if (entry == null) {
      const container = pageDocument.createElement("div");
      container.className = "work-sidepanel__frame";
      frameContainer.append(container);
      entry = {
        container,
        panel: host.createPanel({
          frameContainer: container,
          pageDocument,
          tab: { ...tab, id: tab.id },
          workModeUrl,
        }),
      };
      panels.set(tab.id, entry);
    }
    entry.container.hidden = false;
    (await entry.panel)?.setActive(!disposed && !entry.container.hidden);
  };
  const changed = () => {
    refresh().catch(() => {});
  };
  const activated = (info: chrome.tabs.OnActivatedInfo) => {
    if (info.windowId === windowId) changed();
  };
  const removed = (id: number) => {
    const entry = panels.get(id);
    if (entry != null) {
      panels.delete(id);
      entry.container.remove();
      entry.panel.then((panel) => panel?.dispose());
      changed();
    }
  };
  const attached = (_id: number, info: chrome.tabs.OnAttachedInfo) => {
    if (info.newWindowId === windowId) changed();
  };
  const replaced = (_added: number, removedId: number) => removed(removedId);
  const dispose = () => {
    disposed = true;
    generation++;
    pageDocument.defaultView?.removeEventListener("pagehide", dispose);
    const tabs = host.chrome.tabs;
    tabs.onActivated.removeListener(activated);
    tabs.onRemoved.removeListener(removed);
    tabs.onDetached.removeListener(removed);
    tabs.onAttached.removeListener(attached);
    tabs.onReplaced.removeListener(replaced);
    for (const { container, panel } of panels.values()) {
      container.remove();
      panel.then((value) => value?.dispose());
    }
    panels.clear();
  };
  const tabs = host.chrome.tabs;
  tabs.onActivated.addListener(activated);
  tabs.onRemoved.addListener(removed);
  tabs.onDetached.addListener(removed);
  tabs.onAttached.addListener(attached);
  tabs.onReplaced.addListener(replaced);
  pageDocument.defaultView?.addEventListener("pagehide", dispose, {
    once: true,
  });
  try {
    await refresh();
  } catch (error) {
    dispose();
    throw error;
  }
}
/** Original rt. Per-tab page implementation remains an explicit dependency until
 * the complete ge message/auth/selection lifecycle has been restored. */
export function startSidePanelPage(
  host: {
    chrome?: Pick<typeof chrome, "tabs">;
    isEdge(): boolean;
    createPanel: SidePanelPageFactory;
  },
  {
    document: pageDocument = document,
    workModeUrl = "https://chatgpt.com/?surface=browser_side_chat",
  }: { document?: Document; workModeUrl?: string | null } = {},
) {
  const container = pageDocument.querySelector<HTMLElement>(
    "#work-sidepanel-frame-container",
  );
  if (container == null) throw new Error("Work side panel root not found");
  if (workModeUrl == null) return;
  const pending = host.chrome?.tabs?.query?.({
    active: true,
    currentWindow: true,
  });
  if (pending == null) {
    createSidePanelFrame(container, pageDocument, workModeUrl);
    return;
  }
  return pending
    .then(([tab]) => {
      if (tab?.id == null) {
        createSidePanelFrame(container, pageDocument, workModeUrl);
        return;
      }
      return host.isEdge()
        ? startWindowSidePanelPage(
            { chrome: host.chrome!, createPanel: host.createPanel },
            {
              frameContainer: container,
              pageDocument,
              windowId: tab.windowId,
              workModeUrl,
            },
          )
        : host
            .createPanel({
              frameContainer: container,
              pageDocument,
              tab: { ...tab, id: tab.id },
              workModeUrl,
            })
            .then(() => {});
    })
    .catch(() => {
      createSidePanelFrame(container, pageDocument, workModeUrl);
    });
}
