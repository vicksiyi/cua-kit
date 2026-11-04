import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { createTunnelSetup } from "../packages/browser-extension/src/tunnel_setup";
import { createSiwcServiceClass } from "../packages/browser-extension/src/siwc";
import { createExtensionInstanceIdReader } from "../packages/browser-extension/src/instance_id";
function storage(trace: unknown[], initial: any = {}) {
  const data = structuredClone(initial);
  const area = (name: string) => ({
    async get(key: string) {
      trace.push(["get", name, key]);
      return { [key]: data[name]?.[key] };
    },
    async set(values: any) {
      trace.push(["set", name, structuredClone(values)]);
      Object.assign((data[name] ??= {}), values);
    },
    async remove(key: string) {
      trace.push(["remove", name, key]);
      delete (data[name] ??= {})[key];
    },
  });
  return {
    data,
    local: area("local"),
    session: area("session"),
    sync: area("sync"),
  };
}
test("tunnel registration and refresh match original across auth, cache, invalidation and abort paths", async () => {
  for (const mode of [
    "new",
    "cached",
    "unchanged",
    "refresh",
    "invalid",
    "other-invalid",
    "mismatch",
    "401",
    "403",
    "500",
    "decode",
    "signed-out",
    "create-fail",
    "abort",
  ]) {
    async function scenario(original: boolean) {
      const events: unknown[] = [];
      const controller = new AbortController();
      const account = { id: "account", userId: "user", structure: "personal" };
      const saved = {
        baseUrl: "https://tunnel.invalid",
        tunnelId: "registered",
      };
      const active = {
        ...saved,
        account,
        apiKey: mode === "refresh" ? "old-fixture" : "fixture",
      };
      const initial = {
        local: {
          browserUseTunnels: {
            other: { baseUrl: "https://other.invalid", tunnelId: "other" },
            ...([
              "cached",
              "unchanged",
              "refresh",
              "invalid",
              "other-invalid",
              "mismatch",
            ].includes(mode)
              ? { "user:account": saved }
              : {}),
          },
        },
        session: {
          nodeReplTunnel: [
            "unchanged",
            "refresh",
            "invalid",
            "mismatch",
          ].includes(mode)
            ? {
                ...active,
                ...(mode === "mismatch" ? { tunnelId: "stale" } : {}),
              }
            : undefined,
        },
        sync: { browserUseControlAllowed: true },
      };
      const stores = storage(events, initial);
      const read = async () => {
        events.push("auth");
        if (mode === "abort") controller.abort(Error("cancelled"));
        return ["401", "403", "500"].includes(mode)
          ? { status: Number(mode), error: "http" }
          : mode === "decode"
            ? { status: 200, error: "decode" }
            : {
                status: 200,
                session:
                  mode === "signed-out"
                    ? null
                    : { accessToken: "fixture", account },
              };
      };
      const instance = async () => {
        events.push("instance");
        return "instance";
      };
      const fetchFixture: any = async (url: unknown, init: any) => {
        events.push([
          "fetch",
          url,
          init.credentials,
          init.redirect,
          init.headers,
          JSON.parse(init.body),
        ]);
        return mode === "create-fail"
          ? new Response(null, { status: 503 })
          : Response.json({
              base_url: "https://new-tunnel.invalid",
              tunnel_id: "created",
            });
      };
      const { T_ } = extensionBindings(["T_", "Hn", "Qc"], {
        Pr: read,
        Be: instance,
        chrome: { storage: stores },
        mt: "nodeReplTunnel",
        Gs: "browserUseTunnels",
        qs: "browserUseControlAllowed",
        Es: "https://chatgpt.com/backend-api",
        fetch: fetchFixture,
      });
      const setup = original
        ? T_
        : createTunnelSetup({
            readAuthSession: read as any,
            instanceId: instance,
            storage: stores,
            fetch: fetchFixture,
          });
      const trace: any = { stage: "session" };
      try {
        events.push([
          "result",
          await setup(
            trace,
            controller.signal,
            mode === "invalid"
              ? "registered"
              : mode === "other-invalid"
                ? "different"
                : undefined,
          ),
        ]);
      } catch (error) {
        events.push(["error", (error as Error).message]);
      }
      events.push(["trace", trace], ["stored", stores.data]);
      return events;
    }
    assert.deepEqual(await scenario(false), await scenario(true), mode);
  }
});
test("setup composes real restored session parsing and instance identity without constructor network requests", async () => {
  const events: unknown[] = [];
  const stores = storage(events, {
    local: { extensionInstanceId: "existing-instance" },
  });
  const browser: any = { storage: stores };
  const fetchFixture: any = async (url: string, init: any) => {
    events.push(["url", url]);
    if (url.endsWith("/api/auth/session"))
      return Response.json({
        accessToken: "fixture",
        user: { id: "user" },
        account: { id: "account", structure: "personal" },
      });
    assert.equal(init.headers.Authorization, "Bearer fixture");
    assert.equal(init.headers["ChatGPT-Account-ID"], "account");
    assert.equal(JSON.parse(init.body).instance_id, "existing-instance");
    return Response.json({
      base_url: "https://tunnel.invalid",
      tunnel_id: "id",
    });
  };
  const auth = createSiwcServiceClass({
    chrome: browser,
    crypto: { subtle: crypto.subtle },
    fetch: fetchFixture,
  });
  const instance = createExtensionInstanceIdReader({ chrome: browser, crypto });
  const setup = createTunnelSetup({
    readAuthSession: auth.readAuthSession,
    instanceId: instance,
    storage: stores,
    fetch: fetchFixture,
  });
  assert.equal(events.length, 0);
  assert.equal(await setup({}, new AbortController().signal), "created");
  assert.equal(stores.data.session.nodeReplTunnel.account.id, "account");
  assert.equal(await setup({}, new AbortController().signal), "unchanged");
  assert.equal(
    events.filter(
      (event: any) =>
        Array.isArray(event) &&
        event[0] === "url" &&
        event[1].endsWith("/browser-use/sessions"),
    ).length,
    1,
  );
});
