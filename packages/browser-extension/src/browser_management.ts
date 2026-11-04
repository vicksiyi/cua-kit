/** Restored KS/DS/NS and helpers. One instance owns the shared serialized audit queue. */
export interface BrowserManagementCall {
  namespace: string;
  method: string;
  args: any[];
}
type Api = Pick<
  typeof chrome,
  "tabs" | "tabGroups" | "windows" | "bookmarks" | "storage"
>;
const isObject = (value: any): value is Record<string, any> => {
  if (value == null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
};
export function createBrowserManagement(api: Api, now = Date.now) {
  const auditKey = "BROWSER_MANAGEMENT_AUDIT_TRAIL",
    maxChanges = 50,
    retentionMs = 4320 * 60 * 1000;
  let queue: Promise<unknown> = Promise.resolve();
  async function serial<T>(operation: () => Promise<T>): Promise<T> {
    const pending = queue.then(operation);
    queue = pending.then(
      () => {},
      () => {},
    );
    return await pending;
  }
  async function readChanges() {
    const stored = await api.storage.session.get(auditKey),
      cutoff = now() - retentionMs;
    return ((stored[auditKey] ?? []) as any[])
      .filter((entry: any) => entry.createdAt >= cutoff)
      .slice(-maxChanges);
  }
  async function tabLayout(includeUrls: number[] = []): Promise<any> {
    const [tabs, groups] = await Promise.all([
      api.tabs.query({}),
      api.tabGroups?.query?.({}).catch(() => []) ?? [],
    ]);
    const regular = tabs.filter((tab) => !tab.incognito),
      groupIds = new Set(regular.map((tab) => tab.groupId));
    return {
      tabLayout: {
        tabs: regular.flatMap(
          ({ autoDiscardable, groupId, id, index, pinned, url, windowId }) =>
            id == null
              ? []
              : [
                  {
                    autoDiscardable,
                    groupId,
                    id,
                    index,
                    pinned,
                    windowId,
                    ...(includeUrls.includes(id) ? { url } : {}),
                  },
                ],
        ),
        groups: groups
          .filter((group) => groupIds.has(group.id))
          .map(({ collapsed, color, id, title, windowId }) => ({
            collapsed,
            color,
            id,
            title,
            windowId,
          })),
      },
    };
  }
  async function snapshot(call: BrowserManagementCall): Promise<any> {
    switch (call.namespace) {
      case "bookmarks": {
        if (typeof call.args[0] !== "string") return {};
        const [bookmark] = await api.bookmarks.get(call.args[0]);
        if (bookmark == null)
          throw Error(`Chrome bookmark ${call.args[0]} is unavailable`);
        const { id, index, parentId, title, url } = bookmark;
        return { bookmarks: [{ id, index, parentId, title, url }] };
      }
      case "tabs":
        return tabLayout(
          call.method === "remove"
            ? Array.isArray(call.args[0])
              ? call.args[0]
              : [call.args[0]]
            : [],
        );
      case "tabGroups":
        return tabLayout();
      case "windows": {
        const before: any = {
          windows: (await api.windows.getAll({ windowTypes: ["normal"] }))
            .filter((win) => !win.incognito)
            .flatMap(({ focused, height, id, left, state, top, width }) =>
              id == null
                ? []
                : [{ focused, height, id, left, state, top, width }],
            ),
        };
        if (
          call.method === "create" &&
          isObject(call.args[0]) &&
          Object.hasOwn(call.args[0], "tabId")
        )
          before.tabLayout = (await tabLayout()).tabLayout;
        return before;
      }
      default:
        throw Error(
          `Unhandled browser management namespace: ${call.namespace}`,
        );
    }
  }
  function auditable(call: BrowserManagementCall, before: any) {
    if (call.namespace === "bookmarks") return true;
    if (call.namespace === "windows")
      return (
        call.method === "create" ||
        (before.windows?.some(({ id }: any) => id === call.args[0]) ?? false)
      );
    const tabs = before.tabLayout?.tabs ?? [];
    if (call.namespace === "tabGroups")
      return tabs.some(({ groupId }: any) => groupId === call.args[0]);
    const first = call.args[0],
      ids = isObject(first) ? first.tabIds : first;
    return (Array.isArray(ids) ? ids : [ids]).every((id) =>
      tabs.some((tab: any) => tab.id === id),
    );
  }
  async function audit(
    call: BrowserManagementCall,
    execute: () => Promise<any>,
  ) {
    return serial(async () => {
      const changes = await readChanges().catch(() => {});
      if (changes == null) return await execute();
      const before = await snapshot(call).catch(() => {});
      if (before == null) return await execute();
      const result = await execute();
      if (!auditable(call, before)) return result;
      const entry: any = {
        args: call.args,
        before,
        createdAt: now(),
        method: call.method,
        namespace: call.namespace,
      };
      if (typeof result === "number") entry.result = result;
      else if (isObject(result) && typeof result.id === "string")
        entry.result = { id: result.id };
      else if (
        call.namespace === "windows" &&
        isObject(result) &&
        typeof result.id === "number"
      )
        entry.result = result.id;
      changes.push(entry);
      await api.storage.session
        .set({ [auditKey]: changes.slice(-maxChanges) })
        .catch(() => {});
      return result;
    });
  }
  function options(value: any, method: string) {
    if (!isObject(value))
      throw Error(`Chrome API ${method} requires a plain options object`);
    return value;
  }
  function properties(
    value: any,
    allowed: Set<string>,
    method: string,
    empty = false,
  ) {
    const result = options(value, method),
      keys = Object.keys(result);
    if ((!empty && keys.length === 0) || keys.some((key) => !allowed.has(key)))
      throw Error(`Chrome API ${method} contains an unsupported property`);
    return result;
  }
  function validId(value: any, label: string): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
      throw Error(`Chrome API requires an explicit valid ${label}`);
    return value;
  }
  function tabIds(value: any) {
    const ids = Array.isArray(value) ? value : [value];
    if (!ids.length) throw Error("Chrome API requires at least one tab ID");
    return ids.map((id) => validId(id, "tab ID"));
  }
  async function group(id: number) {
    const value = await api.tabGroups.get(id);
    if (value.shared)
      throw Error(
        `Chrome API cannot modify shared tab group ${id} without permission to share`,
      );
    return value;
  }
  async function validateGroups(tabs: chrome.tabs.Tab[]) {
    const ids = new Set(tabs.map((tab) => tab.groupId));
    ids.delete(-1);
    await Promise.all([...ids].map(group));
  }
  async function readTabs(ids: number[]) {
    const tabs = await Promise.all(
      [...new Set(ids)].map((id) => api.tabs.get(id)),
    );
    await validateGroups(tabs);
    return tabs;
  }
  async function validateWindows(ids: Iterable<number>) {
    await validateGroups(
      (
        await Promise.all(
          [...ids].map((windowId) => api.tabs.query({ windowId })),
        )
      ).flat(),
    );
  }
  async function normalWindow(id: number, method: string) {
    const window = await api.windows.get(id);
    if (window.type !== "normal" || window.incognito)
      throw Error(
        `Chrome API ${method} requires a normal non-incognito window`,
      );
  }
  function windowState(state: any, method: string) {
    if (state === "locked-fullscreen")
      throw Error(`Chrome API ${method} cannot lock a window in fullscreen`);
  }
  const windowKeys = new Set([
    "focused",
    "height",
    "left",
    "state",
    "top",
    "width",
  ]);
  async function createWindow(call: BrowserManagementCall) {
    if (call.args.length > 1)
      throw Error("Chrome API windows.create accepts at most one argument");
    const value = properties(
      call.args.length === 0 ? {} : call.args[0],
      new Set([...windowKeys, "tabId", "type"]),
      "windows.create",
      true,
    );
    if (value.type !== undefined && value.type !== "normal")
      throw Error("Chrome API windows.create only supports normal windows");
    windowState(value.state, "windows.create");
    if (!Object.hasOwn(value, "tabId")) return value;
    const tab = await api.tabs.get(validId(value.tabId, "tab ID"));
    if (tab.pinned)
      throw Error(
        "Chrome API windows.create cannot move a pinned tab without changing its pinning",
      );
    await normalWindow(tab.windowId, "windows.create");
    await validateWindows([tab.windowId]);
    return value;
  }
  async function groupOptions(call: BrowserManagementCall) {
    const value = options(call.args[0], "tabs.group"),
      tabs = await readTabs(tabIds(value.tabIds));
    let creation: any, windowId: number;
    if (Object.hasOwn(value, "groupId"))
      windowId = (await group(validId(value.groupId, "group ID"))).windowId;
    else {
      creation =
        value.createProperties === undefined
          ? {}
          : options(value.createProperties, "tabs.group createProperties");
      windowId =
        creation.windowId === undefined
          ? tabs[0].windowId
          : validId(creation.windowId, "createProperties.windowId");
    }
    if (tabs.some((tab) => tab.windowId !== windowId))
      throw Error(
        "Chrome API tabs.group cannot move tabs between windows; group tabs separately by window. Use tabs.move only for user-requested transfers.",
      );
    return creation === undefined
      ? value
      : { ...value, createProperties: { ...creation, windowId } };
  }
  function bookmarkUrl(call: BrowserManagementCall) {
    const value = options(
      call.args[call.method === "create" ? 0 : 1],
      `bookmarks.${call.method}`,
    );
    if (Object.hasOwn(value, "url")) {
      try {
        if (typeof value.url === "string") {
          const { protocol } = new URL(value.url);
          if (protocol === "http:" || protocol === "https:") return;
        }
      } catch {}
      throw Error(
        `Chrome API bookmarks.${call.method} requires a valid http or https URL`,
      );
    }
  }
  async function validateGroup(call: BrowserManagementCall) {
    const id = validId(call.args[0], "group ID");
    if (call.method === "update")
      properties(
        call.args[1],
        new Set(["collapsed", "color", "title"]),
        "tabGroups.update",
      );
    await group(id);
  }
  type Rule = {
    audit?: boolean;
    validate?: (call: BrowserManagementCall) => unknown;
  };
  const rules: Record<string, Record<string, Rule>> = {
    bookmarks: {
      create: { audit: true, validate: bookmarkUrl },
      get: {},
      getChildren: {},
      getSubTree: {},
      getTree: {},
      move: { audit: true },
      remove: { audit: true },
      search: {},
      update: { audit: true, validate: bookmarkUrl },
    },
    tabGroups: {
      get: {},
      move: { audit: true, validate: validateGroup },
      query: {},
      update: { audit: true, validate: validateGroup },
    },
    tabs: {
      get: {},
      group: { audit: true },
      query: {},
      remove: {
        audit: true,
        validate: async (call) => {
          await readTabs(tabIds(call.args[0]));
        },
      },
      ungroup: {
        audit: true,
        validate: async (call) => {
          await readTabs(tabIds(call.args[0]));
        },
      },
      move: {
        audit: true,
        validate: async (call) => {
          const ids = tabIds(call.args[0]),
            value = options(call.args[1], "tabs.move"),
            tabs = await Promise.all(ids.map((id) => api.tabs.get(id))),
            windows = new Set(tabs.map((tab) => tab.windowId));
          if (Object.hasOwn(value, "windowId"))
            windows.add(validId(value.windowId, "window ID"));
          await validateWindows(windows);
        },
      },
      update: {
        audit: true,
        validate: async (call) => {
          const value = properties(
              call.args[1],
              new Set(["autoDiscardable", "pinned"]),
              "tabs.update",
            ),
            id = validId(call.args[0], "tab ID");
          if (value.pinned === true) await readTabs([id]);
        },
      },
    },
    windows: {
      create: { audit: true },
      get: {},
      getAll: {},
      getCurrent: {},
      getLastFocused: {},
      update: {
        audit: true,
        validate: async (call) => {
          const id = validId(call.args[0], "window ID");
          windowState(
            properties(call.args[1], windowKeys, "windows.update").state,
            "windows.update",
          );
          await normalWindow(id, "windows.update");
        },
      },
    },
  };
  async function executeBrowserManagement(call: BrowserManagementCall) {
    if (
      !Object.hasOwn(rules, call.namespace) ||
      !Object.hasOwn(rules[call.namespace], call.method)
    )
      throw Error(
        `Chrome API chrome.${call.namespace}.${call.method} is not allowed`,
      );
    const rule = rules[call.namespace][call.method];
    const execute = async () => {
      if (call.namespace === "windows" && call.method === "create") {
        const value = await createWindow(call),
          creation: any = { ...value, incognito: false };
        if (!Object.hasOwn(value, "tabId")) creation.url = "about:blank";
        return await api.windows.create(creation);
      }
      await rule.validate?.(call);
      const namespace = (api as any)[call.namespace];
      if (namespace == null || !Object.hasOwn(namespace, call.method))
        throw Error(
          `Chrome API chrome.${call.namespace}.${call.method} is unavailable`,
        );
      const method = Reflect.get(namespace, call.method);
      if (typeof method !== "function")
        throw Error(
          `Chrome API chrome.${call.namespace}.${call.method} is unavailable`,
        );
      const args =
        call.namespace === "tabs" && call.method === "group"
          ? [await groupOptions(call), ...call.args.slice(1)]
          : call.args;
      return Reflect.apply(method, namespace, args);
    };
    return rule.audit ? await audit(call, execute) : await execute();
  }
  return {
    executeBrowserManagement,
    getBrowserManagementAuditTrail: () =>
      serial(async () => ({ changes: (await readChanges()).toReversed() })),
  };
}
