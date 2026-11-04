import { SIDE_PANEL_PATH } from "./side_panel_tabs";
export const SIDE_PANEL_AUTH_OPERATIONS_KEY =
  "codexWorkSidePanelAuthOperations";
type AuthAction = "login" | "logout" | "open";
interface Owner {
  ownerTabId: number;
  ownerWindowId: number;
}
interface AuthOpen extends Owner {
  type: "CODEX_WORK_SIDE_PANEL_AUTH_OPEN";
  action: AuthAction;
}
interface AuthState extends Owner {
  type: "CODEX_WORK_SIDE_PANEL_AUTH_STATE";
  state: "signed_in" | "signed_out";
}
interface AuthOperation extends Owner {
  action: AuthAction;
  authTabId: number;
  expiresAt: number;
}
function validId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
export function isSidePanelAuthOpen(input: unknown): input is AuthOpen {
  if (typeof input !== "object" || input == null) return false;
  const value = input as AuthOpen;
  return (
    value.type === "CODEX_WORK_SIDE_PANEL_AUTH_OPEN" &&
    (value.action === "login" ||
      value.action === "logout" ||
      value.action === "open") &&
    validId(value.ownerTabId) &&
    validId(value.ownerWindowId)
  );
}
export function isSidePanelAuthState(input: unknown): input is AuthState {
  if (typeof input !== "object" || input == null) return false;
  const value = input as AuthState;
  return (
    value.type === "CODEX_WORK_SIDE_PANEL_AUTH_STATE" &&
    (value.state === "signed_in" || value.state === "signed_out") &&
    validId(value.ownerTabId) &&
    validId(value.ownerWindowId)
  );
}
export function isSidePanelAuthOperation(
  input: unknown,
): input is AuthOperation {
  if (typeof input !== "object" || input == null) return false;
  const value = input as AuthOperation;
  return (
    (value.action === "login" ||
      value.action === "logout" ||
      value.action === "open") &&
    validId(value.authTabId) &&
    typeof value.expiresAt === "number" &&
    Number.isFinite(value.expiresAt) &&
    validId(value.ownerTabId) &&
    validId(value.ownerWindowId)
  );
}
/** Original Yk/Qk/Jf/Xf/Wt/eR. Registers tab listeners when enabled. */
export function createSidePanelAuthHandler(
  host: {
    chrome: Pick<typeof chrome, "runtime" | "tabs" | "windows" | "storage">;
    now(): number;
  },
  workUrl: string | null | undefined,
  onAuthState?: () => void,
) {
  if (workUrl == null)
    return (
      _message: unknown,
      _sender: chrome.runtime.MessageSender,
      _reply: (value: { ok: boolean }) => void,
    ) => false;
  const browser = host.chrome;
  const workOrigin = new URL(workUrl).origin;
  const panelUrl = browser.runtime.getURL(SIDE_PANEL_PATH);
  let queue = Promise.resolve();
  function enqueue<T>(operation: () => Promise<T>) {
    const pending = queue.then(operation, operation);
    queue = pending.then(
      () => {},
      () => {},
    );
    return pending;
  }
  async function getOperations(): Promise<Record<string, AuthOperation>> {
    const value = (
      await browser.storage.session.get(SIDE_PANEL_AUTH_OPERATIONS_KEY)
    )[SIDE_PANEL_AUTH_OPERATIONS_KEY];
    return typeof value === "object" && value != null && !Array.isArray(value)
      ? (Object.fromEntries(
          Object.entries(value).filter(([, operation]) =>
            isSidePanelAuthOperation(operation),
          ),
        ) as Record<string, AuthOperation>)
      : {};
  }
  const setOperations = (operations: Record<string, AuthOperation>) =>
    browser.storage.session.set({
      [SIDE_PANEL_AUTH_OPERATIONS_KEY]: operations,
    });
  async function revalidate(operation: AuthOperation) {
    if (
      (await browser.tabs.get(operation.ownerTabId)).windowId !==
      operation.ownerWindowId
    )
      return;
    await browser.tabs.update(operation.ownerTabId, { active: true });
    await browser.windows.update(operation.ownerWindowId, { focused: true });
    await browser.runtime
      .sendMessage({
        ownerTabId: operation.ownerTabId,
        type: "CODEX_WORK_SIDE_PANEL_AUTH_REVALIDATE",
      })
      .catch(() => {});
  }
  async function open(message: AuthOpen) {
    if (
      (await browser.tabs.get(message.ownerTabId)).windowId !==
      message.ownerWindowId
    )
      throw Error("Work side panel no longer owns its browser tab");
    const operations = await getOperations();
    const existing = operations[String(message.ownerTabId)];
    if (
      existing != null &&
      (existing.action === message.action || message.action === "open") &&
      existing.ownerWindowId === message.ownerWindowId &&
      existing.expiresAt > host.now()
    ) {
      try {
        if (
          (await browser.tabs.get(existing.authTabId)).windowId ===
          message.ownerWindowId
        ) {
          await browser.tabs.update(existing.authTabId, { active: true });
          await browser.windows.update(message.ownerWindowId, {
            focused: true,
          });
          return;
        }
      } catch {}
    }
    const url = new URL(
      message.action === "open"
        ? "/"
        : message.action === "logout"
          ? "/auth/logout"
          : "/auth/login",
      workOrigin,
    );
    if (message.action === "login") url.searchParams.set("next", "/");
    const tab = await browser.tabs.create({
      active: true,
      openerTabId: message.ownerTabId,
      url: url.href,
      windowId: message.ownerWindowId,
    });
    if (tab.id == null)
      throw Error("The authentication tab has no browser tab identifier");
    operations[String(message.ownerTabId)] = {
      action: message.action,
      authTabId: tab.id,
      expiresAt: host.now() + 600000,
      ownerTabId: message.ownerTabId,
      ownerWindowId: message.ownerWindowId,
    };
    await setOperations(operations);
  }
  browser.tabs.onUpdated.addListener((tabId, change, tab) => {
    const url = tab.url;
    if (change.status !== "complete" || url == null) return;
    enqueue(async () => {
      const operations = await getOperations();
      const operation = Object.values(operations).find(
        (item) => item.authTabId === tabId,
      );
      if (operation == null) return;
      if (operation.expiresAt <= host.now()) {
        Reflect.deleteProperty(operations, String(operation.ownerTabId));
        await setOperations(operations);
        return;
      }
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return;
      }
      if (
        parsed.origin !== workOrigin ||
        (parsed.pathname.startsWith("/auth/") &&
          !(
            operation.action === "logout" &&
            (parsed.pathname === "/auth/login" ||
              parsed.pathname === "/auth/login/")
          ))
      )
        return;
      await revalidate(operation).catch(() => {});
    }).catch(() => {});
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    enqueue(async () => {
      const operations = await getOperations();
      const operation = Object.values(operations).find(
        (item) => item.authTabId === tabId || item.ownerTabId === tabId,
      );
      if (operation == null) return;
      Reflect.deleteProperty(operations, String(operation.ownerTabId));
      await setOperations(operations);
      if (operation.authTabId === tabId)
        await revalidate(operation).catch(() => {});
    }).catch(() => {});
  });
  return (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    reply: (value: { ok: boolean }) => void,
  ) => {
    if (!isSidePanelAuthOpen(message) && !isSidePanelAuthState(message))
      return false;
    if (sender.id !== browser.runtime.id || sender.url !== panelUrl) {
      reply({ ok: false });
      return false;
    }
    if (isSidePanelAuthState(message)) onAuthState?.();
    enqueue(async () => {
      if (isSidePanelAuthOpen(message)) await open(message);
      else {
        const operations = await getOperations();
        const operation = operations[String(message.ownerTabId)];
        if (
          operation == null ||
          operation.ownerWindowId !== message.ownerWindowId ||
          operation.expiresAt <= host.now() ||
          message.state !==
            (operation.action === "logout" ? "signed_out" : "signed_in")
        )
          throw Error("Work side-panel authentication is not complete");
        Reflect.deleteProperty(operations, String(operation.ownerTabId));
        await setOperations(operations);
        await browser.tabs.remove(operation.authTabId).catch(() => {});
      }
      reply({ ok: true });
    }).catch(() => reply({ ok: false }));
    return true;
  };
}
