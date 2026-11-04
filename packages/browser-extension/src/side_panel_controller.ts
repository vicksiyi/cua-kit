import { identifyBrowserFamily } from "./browser_platform";
import {
  startSidePanelPage,
  createSidePanelFrame,
  normalizeSidePanelConversationUrl,
  type SidePanelPageOptions,
  type SidePanelPageFactory,
} from "./side_panel_page";
import { googleWorkspaceDocument } from "./google_workspace";
import { createSidePanelSelectionCapture } from "./side_panel_selection_capture";
import { removeSidePanelSelectionObserver } from "./side_panel_selection";
import {
  sidePanelMessageTypes,
  sidePanelCapabilities,
  readSidePanelInstanceId,
  isSideChatPromptPrefill,
  canReadSidePanelTab,
  isSideChatBrowserContext,
  isSidePanelAuthRevalidate,
  isSideChatContextRequest,
  isSideChatOpenInBrowser,
  isSideChatAuthChanged,
  isSideChatMediaPermissionRequest,
  isSideChatCapabilitiesRequest,
  isSideChatTabContextRequest,
  isSideChatLocationChanged,
} from "./side_panel_protocol";
export interface SidePanelControllerHost {
  chrome: Pick<
    typeof chrome,
    "tabs" | "storage" | "runtime" | "action" | "commands" | "scripting"
  >;
  crypto: Pick<Crypto, "randomUUID">;
  navigator: Pick<Navigator, "permissions" | "userAgent">;
  now(): number;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
  setInterval: typeof globalThis.setInterval;
  clearInterval: typeof globalThis.clearInterval;
}
/** Original ge: per-owner-tab frame/auth/context/selection lifecycle. Construction
 * returns the page factory; creating a page installs its original listeners.
 * The caller supplies bound browser timers, as in the actual extension entry. */
export function createSidePanelPageController(
  host: SidePanelControllerHost,
): SidePanelPageFactory {
  const {
    chrome,
    crypto,
    navigator,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  } = host;
  const captureSelection = createSidePanelSelectionCapture(chrome);
  const readInstanceId = () => readSidePanelInstanceId(chrome.runtime);
  const conversationStorageKey = (id: number) =>
    `codexWorkSidePanelConversationUrl:${id}`;
  const invocationStorageKey = (id: number) =>
    `codexWorkSidePanelInvocation:${id}`;
  const {
    context: contextMessage,
    contextInvalidated: contextInvalidatedMessage,
    tabContextChanged: tabContextChangedMessage,
    capabilities: capabilitiesMessage,
    authOpen: authOpenMessage,
    authState: authStateMessage,
  } = sidePanelMessageTypes;
  const loadEventMessage = "CODEX_WORK_SIDE_PANEL_LOAD_EVENT",
    loadTimeoutMs = 15000;
  async function createPanel({
    frameContainer: frameContainer,
    pageDocument: pageDocument,
    tab: ownerTab,
    workModeUrl: workModeUrl,
  }: SidePanelPageOptions) {
    const ownerTabId = ownerTab.id,
      origin = new URL(workModeUrl).origin,
      sessionStorage = chrome?.storage?.session,
      conversationKey = conversationStorageKey(ownerTabId),
      persisted = await sessionStorage?.get(conversationKey).catch(() => {});
    if (!frameContainer.isConnected) return;
    let frame = createSidePanelFrame(
        frameContainer,
        pageDocument,
        normalizeSidePanelConversationUrl({
          value: persisted?.[conversationKey],
          workModeUrl: workModeUrl,
        }) ?? workModeUrl,
      ),
      permissionTabId: number | undefined,
      contextGeneration = 0,
      alive = true,
      active = !frameContainer.hidden,
      disposed = false,
      toolbarGeneration = 0,
      authSection: HTMLElement | undefined,
      authBlocked = false,
      revalidating = false,
      authGeneration = 0,
      hasLoaded = false,
      recoverySection: HTMLElement | undefined,
      loadTimer: ReturnType<typeof setTimeout> | undefined,
      loadStartedAt = host.now(),
      attempt = 0,
      ready = false,
      timedOut = false,
      contextReady = false,
      invocationQueue = Promise.resolve();
    const readToolbarStatus = async () => {
        if (ownerTab.incognito) return { toolbar: { pin: "unknown" } };
        try {
          const [{ isOnToolbar: isOnToolbar }, commands] = await Promise.all([
            chrome.action.getUserSettings(),
            chrome.commands.getAll().catch(() => []),
          ]);
          return {
            toolbar: { pin: isOnToolbar ? "pinned" : "unpinned" },
            sidePanel: {
              toggleShortcut:
                commands.find(
                  ({ name: name }: any) => name === "open-codex-side-panel",
                )?.shortcut || null,
            },
          };
        } catch {
          return { toolbar: { pin: "unknown" } };
        }
      },
      publishToolbarStatus = () => {
        if (!alive || !frame.isConnected) return;
        const generation = ++toolbarGeneration;
        readToolbarStatus().then((status: any) => {
          generation !== toolbarGeneration ||
            !alive ||
            !frame.isConnected ||
            frame.contentWindow?.postMessage(
              { type: "update", status: status },
              origin,
            );
        });
      },
      invocationKey = invocationStorageKey(ownerTabId),
      deliverInvocation = () => {
        const wasBlocked = authBlocked,
          generation = authGeneration;
        invocationQueue = invocationQueue
          .then(async () => {
            if (wasBlocked || authBlocked || generation !== authGeneration) {
              await sessionStorage?.remove(invocationKey);
              return;
            }
            if (!alive || !active || !contextReady) return;
            const stored = await sessionStorage?.get(invocationKey);
            if (authBlocked || generation !== authGeneration) {
              await sessionStorage?.remove(invocationKey);
              return;
            }
            const invocation = stored?.[invocationKey];
            !alive ||
              !active ||
              !contextReady ||
              !frame.isConnected ||
              frame.hidden ||
              !isSideChatPromptPrefill(invocation) ||
              (frame.contentWindow?.postMessage(invocation, origin),
              await sessionStorage?.remove(invocationKey));
          })
          .catch(() => {});
      },
      storageChanged = (changes: any, area: any) => {
        area === "session" &&
          changes[invocationKey]?.newValue != null &&
          deliverInvocation();
      };
    let observerId = crypto.randomUUID(),
      selectionTimer: ReturnType<typeof setInterval> | undefined,
      pollPending = false,
      lastSelection: Awaited<ReturnType<typeof captureSelection>> | void;
    const stopPolling = () => {
        (clearInterval(selectionTimer),
          (selectionTimer = void 0),
          (lastSelection = void 0));
      },
      startPolling = (url: any) => {
        const r = googleWorkspaceDocument(url);
        r == null ||
          r.docType === "spreadsheets" ||
          selectionTimer != null ||
          (selectionTimer = setInterval(() => {
            if (
              pollPending ||
              !alive ||
              !active ||
              frame.hidden ||
              pageDocument.hidden
            )
              return;
            pollPending = true;
            const generation = contextGeneration,
              capturedObserverId = observerId;
            chrome.tabs
              .get(ownerTabId)
              .then(async (tab: any) => {
                if (
                  tab.url !== url ||
                  tab.status === "loading" ||
                  !canReadSidePanelTab(tab)
                )
                  return;
                const selection = await captureSelection(
                  ownerTabId,
                  url,
                  capturedObserverId,
                  () =>
                    alive && !frame.hidden && capturedObserverId === observerId,
                );
                if (capturedObserverId !== observerId || !alive) {
                  removeObserver(capturedObserverId);
                  return;
                }
                if (generation !== contextGeneration) return;
                const previous = lastSelection;
                ((lastSelection = selection),
                  (selection?.documentId !== previous?.documentId ||
                    selection?.result?.selectedText !==
                      previous?.result?.selectedText ||
                    selection?.result?.revision !==
                      previous?.result?.revision) &&
                    invalidateContext());
              })
              .catch(() => {})
              .finally(() => {
                pollPending = false;
              });
          }, 1e3));
      },
      removeObserver = (id: any) => {
        (id === observerId && stopPolling(),
          chrome.scripting
            .executeScript({
              args: [id],
              func: removeSidePanelSelectionObserver,
              target: { tabId: ownerTabId },
            })
            .catch(() => {}));
      },
      invalidateContext = () => {
        (contextGeneration++,
          frame.isConnected &&
            frame.contentWindow?.postMessage(
              { type: contextInvalidatedMessage, protocolVersion: 2 },
              origin,
            ));
      },
      ownerRemoved = (tabId: any) => {
        tabId === ownerTabId &&
          ((alive = false),
          clearTimeout(loadTimer),
          removeObserver(observerId),
          invalidateContext());
      },
      ownerReplaced = (addedTabId: any, removedTabId: any) => {
        ownerRemoved(removedTabId);
      },
      ownerUpdated = (tabId: any, change: any) => {
        tabId !== ownerTabId ||
          (change.url == null && change.status == null) ||
          (removeObserver(observerId),
          (observerId = crypto.randomUUID()),
          invalidateContext());
      },
      resetContext = () => {
        ((contextReady = false),
          removeObserver(observerId),
          (observerId = crypto.randomUUID()),
          invalidateContext());
      },
      frameLoaded = () => {
        alive &&
          (hasLoaded && (clearRecovery(), (attempt += 1), startLoadTimer()),
          (hasLoaded = true),
          resetContext());
      };
    (frame.addEventListener("load", frameLoaded),
      chrome.tabs.onRemoved?.addListener(ownerRemoved),
      chrome.tabs.onDetached?.addListener(ownerRemoved),
      chrome.tabs.onReplaced?.addListener(ownerReplaced),
      chrome.tabs.onUpdated?.addListener(ownerUpdated));
    const publishContext = async (request: any) => {
        const generation = contextGeneration;
        let context = null;
        if (alive && active)
          try {
            const instanceId = await readInstanceId(),
              tab = await chrome.tabs.get(ownerTabId),
              browserContext = { instanceId: instanceId };
            if (
              tab.id === ownerTabId &&
              tab.windowId === ownerTab.windowId &&
              isSideChatBrowserContext(browserContext) &&
              browserContext.instanceId != null
            ) {
              let selectedText = null,
                selectionId = null;
              if (
                !frame.hidden &&
                request.includeSelection === true &&
                tab.status !== "loading" &&
                canReadSidePanelTab(tab)
              ) {
                const capturedObserverId = observerId,
                  selection = await captureSelection(
                    ownerTabId,
                    tab.url,
                    capturedObserverId,
                    () =>
                      alive &&
                      !frame.hidden &&
                      capturedObserverId === observerId,
                  ).catch(() => {});
                if (capturedObserverId !== observerId || !alive) {
                  removeObserver(capturedObserverId);
                  return;
                }
                if (generation !== contextGeneration) return;
                const currentTab = await chrome.tabs.get(ownerTabId);
                if (generation !== contextGeneration) return;
                if (
                  currentTab.url !== tab.url ||
                  currentTab.windowId !== ownerTab.windowId ||
                  currentTab.status === "loading"
                )
                  throw new Error(
                    "The owning tab changed during selection capture",
                  );
                ((lastSelection = selection),
                  startPolling(tab.url),
                  (selectedText = selection?.result?.selectedText ?? null),
                  selection?.result != null &&
                    selectedText != null &&
                    (selectionId = `${selection.documentId}:${selection.result.revision}`));
              }
              context = {
                ...(request.includeSelection === true
                  ? { selectedText: selectedText, selectionId: selectionId }
                  : {}),
                instanceId: browserContext.instanceId,
                tabId: ownerTabId,
                windowId: tab.windowId,
                url: canReadSidePanelTab(tab) ? (tab.url ?? null) : null,
              };
            }
          } catch {}
        (alive || removeObserver(observerId),
          !(generation !== contextGeneration || !frame.isConnected) &&
            frame.contentWindow?.postMessage(
              {
                type: contextMessage,
                protocolVersion: 2,
                requestId: request.requestId,
                context: context,
                capabilities: {
                  [sidePanelCapabilities.browserSideChatOpenInBrowser]: true,
                },
              },
              origin,
            ));
      },
      publishTabContext = (requestId: any, tab: any) => {
        const response = {
          requestId: requestId,
          tabId: ownerTabId,
          type: tabContextChangedMessage,
          url: tab != null && canReadSidePanelTab(tab) ? tab.url : null,
        };
        frame.contentWindow?.postMessage(response, origin);
      },
      publishCapabilities = async () => {
        const instanceId = await readInstanceId().catch(() => null);
        if (!frame.isConnected) return;
        const message = {
          browserContext: { instanceId: instanceId },
          capabilities: {
            [sidePanelCapabilities.browserSideChatTabContextRead]: true,
            [sidePanelCapabilities.browserTabMentionsSearch]:
              alive && !ownerTab.incognito ? true : void 0,
          },
          type: capabilitiesMessage,
        };
        frame.contentWindow?.postMessage(message, origin);
      },
      requestTabContext = async (requestId: any) => {
        const generation = contextGeneration;
        let tab: any;
        try {
          alive && active && (tab = await chrome?.tabs?.get?.(ownerTabId));
        } catch {}
        generation === contextGeneration &&
          frame.isConnected &&
          publishTabContext(requestId, tab);
      },
      reportLoad = (event: any) => {
        chrome.runtime
          .sendMessage({
            type: loadEventMessage,
            event: event,
            attempt: attempt,
            elapsedMs: Math.max(0, host.now() - loadStartedAt),
            timedOut: timedOut,
          })
          .catch(() => {});
      },
      clearRecovery = () => {
        (recoverySection?.remove(),
          (recoverySection = void 0),
          (frame.hidden = authSection != null));
      },
      markReady = () => {
        ready ||
          ((ready = true),
          clearTimeout(loadTimer),
          reportLoad("ready"),
          clearRecovery());
      },
      openAuth = (action: any, button: any) => {
        if (!alive || ownerTab.windowId == null) return;
        const message = {
          action: action,
          ownerTabId: ownerTabId,
          ownerWindowId: ownerTab.windowId,
          type: authOpenMessage,
        };
        ((authBlocked = true),
          (authGeneration += 1),
          deliverInvocation(),
          (button.disabled = true),
          chrome.runtime
            .sendMessage(message)
            .then((response: any) => {
              (response?.ok !== true || action === "open") &&
                (button.disabled = false);
            })
            .catch(() => {
              button.disabled = false;
            }));
      },
      startLoadTimer = () => {
        (clearTimeout(loadTimer),
          (loadStartedAt = host.now()),
          (ready = false),
          (timedOut = false),
          (loadTimer = setTimeout(() => {
            if (!alive || !frame.isConnected) return;
            ((timedOut = true),
              reportLoad("timeout"),
              authSection?.remove(),
              (authSection = void 0));
            const section = pageDocument.createElement("section");
            ((section.className =
              "work-sidepanel__auth work-sidepanel__recovery"),
              section.setAttribute("role", "status"));
            const title = pageDocument.createElement("h1");
            title.textContent = "ChatGPT couldn’t load";
            const description = pageDocument.createElement("p");
            description.textContent =
              "Try again, or open ChatGPT in a tab. If prompted, sign in, then retry the side panel.";
            const retryButton = pageDocument.createElement("button");
            ((retryButton.type = "button"),
              (retryButton.textContent = "Try again"),
              retryButton.addEventListener("click", () => {
                (reportLoad("retry"), reloadFrame(frame.src));
              }));
            const openButton = pageDocument.createElement("button");
            ((openButton.type = "button"),
              (openButton.textContent = "Open ChatGPT"),
              openButton.addEventListener("click", () => {
                (reportLoad("open_chatgpt"), openAuth("open", openButton));
              }),
              section.append(title, description, retryButton, openButton),
              frameContainer.append(section),
              (recoverySection = section),
              (frame.hidden = true));
          }, loadTimeoutMs)));
      },
      reloadFrame = (url: any) => {
        alive &&
          (clearRecovery(),
          authSection?.remove(),
          (authSection = void 0),
          resetContext(),
          (hasLoaded = false),
          frame.removeEventListener("load", frameLoaded),
          (frame = createSidePanelFrame(frameContainer, pageDocument, url)),
          (revalidating = false),
          frame.addEventListener("load", frameLoaded),
          (attempt += 1),
          startLoadTimer());
      },
      showAuth = (state: any) => {
        if (
          ((authBlocked = state !== "signed_in"),
          authBlocked && (authGeneration += 1),
          state === "signed_in")
        ) {
          (authSection?.remove(),
            (authSection = void 0),
            (frame.hidden = false));
          return;
        }
        (removeObserver(observerId),
          (observerId = crypto.randomUUID()),
          invalidateContext(),
          authSection?.remove());
        const section = pageDocument.createElement("section");
        section.className = "work-sidepanel__auth";
        const title = pageDocument.createElement("h1");
        title.textContent =
          state === "logout_requested"
            ? "Log out of ChatGPT?"
            : state === "expired"
              ? "Your session has expired"
              : "Log in to ChatGPT";
        const description = pageDocument.createElement("p");
        description.textContent =
          state === "logout_requested"
            ? "Continue in a ChatGPT tab to log out."
            : "Log in to use ChatGPT in the side panel";
        const button = pageDocument.createElement("button");
        ((button.type = "button"),
          (button.textContent =
            state === "logout_requested"
              ? "Log out in ChatGPT"
              : "Continue to ChatGPT"),
          button.addEventListener("click", () => {
            openAuth(state === "logout_requested" ? "logout" : "login", button);
          }),
          section.append(title, description, button),
          frameContainer.append(section),
          (frame.hidden = true),
          (authSection = section));
      },
      selectionChanged = (message: any, sender: any) => {
        !alive ||
          sender.id !== chrome.runtime.id ||
          sender.tab?.id !== ownerTabId ||
          sender.frameId !== 0 ||
          typeof message != "object" ||
          message == null ||
          !("type" in message) ||
          message.type !== "CODEX_SIDE_CHAT_SELECTION_CHANGED" ||
          !("observerId" in message) ||
          message.observerId !== observerId ||
          invalidateContext();
      },
      authRevalidate = (message: any, sender: any) => {
        sender.id !== chrome.runtime.id ||
          !isSidePanelAuthRevalidate(message) ||
          message.ownerTabId !== ownerTabId ||
          ((revalidating = true),
          (authBlocked = true),
          (authGeneration += 1),
          deliverInvocation(),
          Promise.resolve(sessionStorage?.get(conversationKey))
            .then((stored: any) => {
              reloadFrame(
                normalizeSidePanelConversationUrl({
                  value: stored?.[conversationKey],
                  workModeUrl: workModeUrl,
                }) ?? workModeUrl,
              );
            })
            .catch(() => {
              reloadFrame(workModeUrl);
            }));
      },
      message = (event: any) => {
        if (
          !alive ||
          revalidating ||
          event.origin !== origin ||
          event.source !== frame.contentWindow
        )
          return;
        if (isSideChatContextRequest(event.data)) {
          (markReady(),
            publishContext(event.data),
            publishToolbarStatus(),
            (contextReady = true),
            deliverInvocation());
          return;
        }
        if (isSideChatOpenInBrowser(event.data)) {
          if (!active || !frame.isConnected) return;
          let request: any;
          try {
            request = new URL(event.data.url);
          } catch {
            return;
          }
          if (request.origin !== origin) return;
          (request.searchParams.delete("surface"),
            chrome.tabs
              .create({
                url: request.href,
                active: true,
                openerTabId: ownerTabId,
                windowId: ownerTab.windowId,
              })
              .catch(() => {}));
          return;
        }
        if (isSideChatAuthChanged(event.data)) {
          if (
            (markReady(),
            showAuth(event.data.state),
            event.data.state !== "signed_in" && deliverInvocation(),
            ownerTab.windowId != null &&
              (event.data.state === "signed_in" ||
                event.data.state === "signed_out"))
          ) {
            const request = {
              ownerTabId: ownerTabId,
              ownerWindowId: ownerTab.windowId,
              state: event.data.state,
              type: authStateMessage,
            };
            chrome.runtime.sendMessage(request).catch(() => {});
          }
          return;
        }
        if (isSideChatMediaPermissionRequest(event.data)) {
          if (!active) return;
          const request = event.data;
          Promise.all(
            [
              ...(request.audio ? ["microphone"] : []),
              ...(request.video ? ["camera"] : []),
            ].map((permissions: any) =>
              navigator.permissions.query({ name: permissions }),
            ),
          )
            .then(async (permissions: any) => {
              if (
                !alive ||
                !active ||
                permissions.some(
                  (permission: any) => permission.state === "denied",
                ) ||
                permissions.every(
                  (permission: any) => permission.state === "granted",
                )
              )
                return;
              const restoreOwnerTab = async () => {
                if (!(
                  !alive ||
                  !permissions.every(
                    ({ state: permission }: any) => permission === "granted",
                  )
                )) {
                  if (!active) {
                    const [permission] = await chrome.tabs.query({
                      active: true,
                      windowId: ownerTab.windowId,
                    });
                    if (
                      permissionTabId == null ||
                      permission?.id !== permissionTabId
                    )
                      return;
                  }
                  alive &&
                    (await chrome.tabs.update(ownerTabId, { active: true }));
                }
              };
              permissions.forEach((permission: any) => {
                permission.addEventListener(
                  "change",
                  () => {
                    restoreOwnerTab().catch(() => {});
                  },
                  { once: true },
                );
              });
              const permissionUrl = new URL(
                chrome.runtime.getURL("microphone-permission.html"),
              );
              (request.video && permissionUrl.searchParams.set("camera", "1"),
                request.audio ||
                  permissionUrl.searchParams.set("microphone", "0"),
                (permissionTabId = (
                  await chrome.tabs.create({ url: permissionUrl.href })
                ).id));
            })
            .catch(() => {});
          return;
        }
        if (isSideChatCapabilitiesRequest(event.data)) {
          publishCapabilities();
          return;
        }
        if (isSideChatTabContextRequest(event.data)) {
          requestTabContext(event.data.requestId);
          return;
        }
        if (!isSideChatLocationChanged(event.data)) return;
        const conversationUrl = normalizeSidePanelConversationUrl({
          value: event.data.url,
          workModeUrl: workModeUrl,
        });
        conversationUrl != null &&
          sessionStorage
            ?.set({ [conversationKey]: conversationUrl })
            .catch(() => {});
      };
    (startLoadTimer(),
      chrome.runtime.onMessage?.addListener(authRevalidate),
      chrome.runtime.onMessage?.addListener(selectionChanged),
      chrome.storage.onChanged?.addListener(storageChanged),
      chrome.action?.onUserSettingsChanged?.addListener(publishToolbarStatus),
      pageDocument.defaultView?.addEventListener("focus", publishToolbarStatus),
      pageDocument.defaultView?.addEventListener("message", message));
    const dispose = () => {
      disposed ||
        ((disposed = true),
        pageDocument.defaultView?.removeEventListener("pagehide", dispose),
        (alive = false),
        clearTimeout(loadTimer),
        removeObserver(observerId),
        invalidateContext(),
        frame.removeEventListener("load", frameLoaded),
        chrome.tabs.onRemoved?.removeListener(ownerRemoved),
        chrome.tabs.onDetached?.removeListener(ownerRemoved),
        chrome.tabs.onReplaced?.removeListener(ownerReplaced),
        chrome.tabs.onUpdated?.removeListener(ownerUpdated),
        pageDocument.defaultView?.removeEventListener("message", message),
        chrome.runtime.onMessage?.removeListener(authRevalidate),
        chrome.runtime.onMessage?.removeListener(selectionChanged),
        chrome.storage.onChanged?.removeListener(storageChanged),
        chrome.action?.onUserSettingsChanged?.removeListener(
          publishToolbarStatus,
        ),
        pageDocument.defaultView?.removeEventListener(
          "focus",
          publishToolbarStatus,
        ),
        permissionTabId != null &&
          chrome.tabs.remove(permissionTabId).catch(() => {}));
    };
    return (
      pageDocument.defaultView?.addEventListener("pagehide", dispose, {
        once: true,
      }),
      {
        dispose: dispose,
        setActive(e: any) {
          active === e ||
            !alive ||
            ((active = e),
            removeObserver(observerId),
            (observerId = crypto.randomUUID()),
            invalidateContext(),
            e && (publishToolbarStatus(), deliverInvocation()));
        },
      }
    );
  }
  return createPanel;
}

/** Compose rt/it/ge with the restored page controller instead of a caller stub. */
export function startAssembledSidePanelPage(
  host: SidePanelControllerHost,
  options: Parameters<typeof startSidePanelPage>[1] = {},
) {
  return startSidePanelPage(
    {
      chrome: host.chrome,
      isEdge: () =>
        identifyBrowserFamily(host.navigator.userAgent ?? "", false) === "edge",
      createPanel: createSidePanelPageController(host),
    },
    options,
  );
}
