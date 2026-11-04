import type { createSiwcServiceClass } from "./siwc";
import { readTunnelConfiguration } from "./tunnel_polling";
type ReadSession = ReturnType<typeof createSiwcServiceClass>["readAuthSession"];
interface StorageArea {
  get(key: string): Promise<Record<string, any>>;
  set(value: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}
export interface TunnelSetupTrace {
  stage?: string;
  http_status?: number;
  tunnel_id?: string;
  [key: string]: unknown;
}
export type TunnelSetupOutcome =
  "failed" | "invalid_session" | "unchanged" | "created" | "refreshed";
/** Original T_. Session auth is the restored Pr reader; no hidden credentials,
 * alternate login path or permissive session fallback. */
export function createTunnelSetup(host: {
  readAuthSession: ReadSession;
  instanceId(): Promise<string>;
  storage: {
    local: StorageArea;
    session: StorageArea;
    sync: Pick<StorageArea, "remove">;
  };
  fetch: typeof fetch;
}) {
  return async function setup(
    trace: TunnelSetupTrace,
    signal: AbortSignal,
    invalidTunnelId?: string,
  ): Promise<TunnelSetupOutcome> {
    const auth = await host.readAuthSession(signal);
    signal.throwIfAborted();
    trace.http_status = auth.status;
    if ("error" in auth && auth.error === "http") {
      if (auth.status === 401 || auth.status === 403) {
        await host.storage.session.remove("nodeReplTunnel");
        return "invalid_session";
      }
      return "failed";
    }
    trace.stage = "session_decode";
    if ("error" in auth) throw new Error("Failed to decode ChatGPT session.");
    if (auth.session == null) {
      await host.storage.session.remove("nodeReplTunnel");
      await host.storage.sync.remove("browserUseControlAllowed");
      return "invalid_session";
    }
    const { accessToken, account } = auth.session;
    trace.http_status = undefined;
    trace.stage = "read_configuration";
    const instanceId = await host.instanceId();
    const stored = await host.storage.local.get("browserUseTunnels");
    const active = await readTunnelConfiguration(host.storage.session);
    signal.throwIfAborted();
    let registrations = stored.browserUseTunnels ?? {};
    const accountKey = `${account.userId}:${account.id}`;
    let registration = registrations[accountKey];
    let created = false;
    const invalid =
      invalidTunnelId != null && registration?.tunnelId === invalidTunnelId;
    if (invalid) {
      registration = undefined;
      registrations = Object.fromEntries(
        Object.entries(registrations).filter(([key]) => key !== accountKey),
      );
      signal.throwIfAborted();
      await host.storage.local.set({ browserUseTunnels: registrations });
    }
    signal.throwIfAborted();
    if (
      active != null &&
      active.tunnelId !== registration?.tunnelId &&
      !invalid
    )
      await host.storage.session.remove("nodeReplTunnel");
    if (registration == null) {
      trace.stage = "create_tunnel";
      const response = await host.fetch(
        "https://chatgpt.com/backend-api/browser-use/sessions",
        {
          body: JSON.stringify({
            device_name: "Chrome",
            instance_id: instanceId,
          }),
          credentials: "include",
          redirect: "error",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "ChatGPT-Account-ID": account.id,
            "Content-Type": "application/json",
          },
          method: "POST",
          signal,
        },
      );
      trace.http_status = response.status;
      if (!response.ok)
        throw new Error(
          `Browser-use tunnel creation failed with status ${response.status}`,
        );
      const body = await response.json();
      registration = { baseUrl: body.base_url, tunnelId: body.tunnel_id };
      created = true;
      trace.tunnel_id = registration.tunnelId;
      trace.stage = "save_registration";
      trace.http_status = undefined;
      signal.throwIfAborted();
      await host.storage.local.set({
        browserUseTunnels: { ...registrations, [accountKey]: registration },
      });
    }
    trace.tunnel_id = registration.tunnelId;
    trace.stage = "configure_polling";
    if (
      active?.apiKey === accessToken &&
      active.baseUrl === registration.baseUrl &&
      active.tunnelId === registration.tunnelId &&
      active.account.id === account.id &&
      active.account.userId === account.userId &&
      active.account.structure === account.structure
    )
      return "unchanged";
    signal.throwIfAborted();
    await host.storage.session.set({
      nodeReplTunnel: {
        account,
        apiKey: accessToken,
        baseUrl: registration.baseUrl,
        tunnelId: registration.tunnelId,
      },
    });
    return created ? "created" : "refreshed";
  };
}
