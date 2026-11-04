import type { ChatAccount, createChatApiClass } from "./chat_api";
export const BROWSER_PLUGIN_CONNECTOR_ID = "connector_openai_browser";
const pluginHeaders = { "OAI-Product-Sku": "TPP" };
export type BrowserPluginApi = Pick<
  InstanceType<ReturnType<typeof createChatApiClass>>,
  "request"
>;
/** Original JC. Preserve service response truthiness and short-circuit order. */
export async function ensureBrowserPlugin(
  api: BrowserPluginApi,
): Promise<boolean> {
  const { plugin_id: pluginId, plugin } = await api.request<any>(
    `/ps/plugins/canonical-app/${BROWSER_PLUGIN_CONNECTOR_ID}`,
    { headers: pluginHeaders },
  );
  if (
    pluginId == null ||
    plugin?.id !== pluginId ||
    plugin.status !== "ENABLED" ||
    plugin.installation_policy === "NOT_AVAILABLE" ||
    !(
      await api.request<any>(
        `/ps/plugins/${encodeURIComponent(pluginId)}/ensure`,
        { method: "POST", headers: pluginHeaders },
      )
    ).enabled
  )
    return false;
  await api.request("/aip/connectors/links/noauth", {
    method: "POST",
    headers: { ...pluginHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      connector_id: BROWSER_PLUGIN_CONNECTOR_ID,
      name: "Browser",
      action_names: [],
      ensure_exists: true,
    }),
  });
  return true;
}
export const PLUGIN_SETUP_IDENTITY_KEY = "browserPluginSetupIdentity";
export const PLUGIN_SETUP_NEGATIVE_KEY = "browserPluginSetupNegativeResult";
type AccountIdentity = Pick<ChatAccount, "userId" | "id">;
export function browserPluginIdentity(account: AccountIdentity) {
  return JSON.stringify([account.userId, account.id]);
}
export function parsePluginNegativeResult(input: unknown) {
  if (typeof input !== "object" || input == null) return;
  const { identity, notBeforeMs } = input as {
    identity: unknown;
    notBeforeMs: unknown;
  };
  if (
    typeof identity === "string" &&
    typeof notBeforeMs === "number" &&
    Number.isFinite(notBeforeMs)
  )
    return { identity, notBeforeMs };
}
/** Original YC: one load per cache; clear does not reset that load promise. */
export function createBrowserPluginCache(host: {
  storage: Pick<typeof chrome.storage.session, "get" | "set" | "remove">;
  now(): number;
}) {
  let loading: Promise<void> | undefined;
  let complete: string | undefined;
  let negative: ReturnType<typeof parsePluginNegativeResult>;
  return {
    async load() {
      loading ??= host.storage
        .get([PLUGIN_SETUP_IDENTITY_KEY, PLUGIN_SETUP_NEGATIVE_KEY])
        .catch(() => ({}) as Record<string, unknown>)
        .then((value) => {
          const identity = value[PLUGIN_SETUP_IDENTITY_KEY];
          complete = typeof identity === "string" ? identity : undefined;
          negative = parsePluginNegativeResult(
            value[PLUGIN_SETUP_NEGATIVE_KEY],
          );
        });
      await loading;
    },
    isComplete(account: AccountIdentity) {
      return complete === browserPluginIdentity(account);
    },
    shouldSkip(account: AccountIdentity) {
      const identity = browserPluginIdentity(account);
      return (
        complete === identity ||
        (negative?.identity === identity && host.now() < negative.notBeforeMs)
      );
    },
    record(account: AccountIdentity, installed: boolean) {
      const identity = browserPluginIdentity(account);
      if (installed) {
        complete = identity;
        host.storage
          .set({ [PLUGIN_SETUP_IDENTITY_KEY]: identity })
          .catch(() => {});
      } else {
        negative = { identity, notBeforeMs: host.now() + 1800000 };
        host.storage
          .set({ [PLUGIN_SETUP_NEGATIVE_KEY]: negative })
          .catch(() => {});
      }
    },
    clear() {
      complete = undefined;
      negative = undefined;
      host.storage
        .remove([PLUGIN_SETUP_IDENTITY_KEY, PLUGIN_SETUP_NEGATIVE_KEY])
        .catch(() => {});
    },
    clearNegative() {
      negative = undefined;
      host.storage.remove(PLUGIN_SETUP_NEGATIVE_KEY).catch(() => {});
    },
  };
}
