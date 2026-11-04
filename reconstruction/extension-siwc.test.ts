import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";
import { extensionBindings } from "./extension-source";
import {
  createSiwcServiceClass,
  parseSiwcGrant,
  validateSiwcGrant,
} from "../packages/browser-extension/src/siwc";
const now = 1800000000250;
const clock = { now: () => now, parse: Date.parse };
const request = { tabId: 7, session_id: "session", turn_id: "turn" };
function fixture(original: boolean) {
  const trace: any[] = [];
  const state = {
    urls: ["https://page.test/a"],
    incognito: false,
    status: 200,
    body: {
      accessToken: "fixture-token",
      account: { id: "account", structure: "personal" },
      user: { id: "user", email: "fixture@example.test" },
    } as any,
    grantStatus: 200,
    setSuccess: true,
    changeAfterSet: false,
    authFailure: false,
    setGate: undefined as Promise<void> | undefined,
  };
  const timeout = (ms: number) => {
    trace.push(["timeout", ms]);
    return new AbortController().signal;
  };
  const fetch = async (url: string, options: any) => {
    trace.push(["fetch", url, { ...options, signal: "signal" }]);
    if (url.endsWith("/api/auth/session")) {
      if (state.authFailure) throw Error("private auth failure");
      return new Response(JSON.stringify(state.body), {
        status: state.status,
        headers: { "Retry-After": "3" },
      });
    }
    return {
      ok: state.grantStatus === 200,
      body: {
        cancel: async () => {
          trace.push(["cancel"]);
        },
      },
      json: async () => ({
        credential_type:
          "urn:openai:params:authapi:grant-type:siwc_browser_bootstrap",
        browser_bootstrap_grant: "fixture-grant",
        expires_at: now / 1000 + 999.75,
        expires_in: 1000,
      }),
    };
  };
  const chrome: any = {
    tabs: {
      get: async (id: number) => {
        trace.push(["tab", id]);
        return { incognito: state.incognito };
      },
    },
  };
  const session = {
    async getCommittedTabUrl(id: number) {
      trace.push(["url", id]);
      return state.urls.length > 1 ? state.urls.shift() : state.urls[0];
    },
    async executeCdp(command: any) {
      trace.push(["cdp", command]);
      if (command.method === "Network.setCookie") {
        await state.setGate;
        if (state.changeAfterSet)
          state.body = { ...state.body, user: { id: "other" } };
        return { success: state.setSuccess };
      }
      return {};
    },
  };
  const activate = async (r: any) => {
    trace.push(["activate", r]);
    return session;
  };
  let Service: any, read: any;
  if (original) {
    const bindings = extensionBindings(
      ["Kp", "Oc", "Zp", "Jp", "Pc", "Qc", "el", "Pr", "fy", "Ft", "xu", "py"],
      {
        chrome,
        fetch,
        crypto: webcrypto,
        Date: clock,
        AbortSignal: { timeout, any: AbortSignal.any },
        Jc: 15000,
        Ss: 0,
        Or: "https://chatgpt.com",
        Xt: "https://chatgpt.com",
        Pu: Promise.resolve(),
      },
    );
    Service = bindings.py;
    read = bindings.Pr;
  } else {
    const restored = createSiwcServiceClass({
      chrome,
      fetch: fetch as any,
      crypto: webcrypto as any,
      now: () => now,
      timeout,
    });
    Service = restored.SiwcService;
    read = restored.readAuthSession;
  }
  return {
    state,
    trace,
    service: new Service(activate),
    second: new Service(activate),
    read,
  };
}
const outcome = async (fn: () => any) => {
  try {
    return { value: await fn() };
  } catch (error) {
    return { error: (error as Error).message };
  }
};
test("SIWC original and restored account, grant, cookie and failure traces agree", async () => {
  for (const scenario of [
    "account",
    "grant",
    "cookie",
    "incognito",
    "opaque",
    "navigate",
    "path-change",
    "expected",
    "auth-error",
    "grant-http",
    "cookie-failed",
    "rollback",
  ]) {
    const results: any[] = [];
    for (const original of [true, false]) {
      const f = fixture(original);
      if (scenario === "incognito") f.state.incognito = true;
      if (scenario === "opaque") f.state.urls = ["data:text/plain,x"];
      if (scenario === "navigate")
        f.state.urls = ["https://page.test/a", "https://other.test/"];
      if (scenario === "path-change")
        f.state.urls = ["https://page.test/a", "https://page.test/b"];
      if (scenario === "auth-error") f.state.authFailure = true;
      if (scenario === "grant-http") f.state.grantStatus = 403;
      if (scenario === "cookie-failed") f.state.setSuccess = false;
      if (scenario === "rollback") f.state.changeAfterSet = true;
      const input = {
        ...request,
        ...(scenario === "expected" ? { expectedAccount: {} } : {}),
      };
      const result = await outcome(() =>
        ["cookie", "cookie-failed", "rollback"].includes(scenario)
          ? f.service.installSiwcBrowserGrantCookie({
              ...input,
              grant: {
                browserBootstrapGrant: "fixture-grant",
                expiresAt: Math.floor(now / 1000) + 100,
              },
            })
          : ["grant", "grant-http", "expected"].includes(scenario)
            ? f.service.issueSiwcBrowserGrant(input)
            : f.service.getSiwcAccountContext(input),
      );
      results.push({ result, trace: f.trace });
    }
    assert.deepEqual(results[1], results[0], scenario);
  }
});
test("auth session decoding and retry-after match inspected reader", async () => {
  for (const body of [
    {},
    [],
    null,
    { error: "expired" },
    { accessToken: " " },
    {
      accessToken: "token",
      account: { id: "a", structure: "invalid" },
      user: { id: "u" },
    },
  ]) {
    const results = [];
    for (const original of [true, false]) {
      const f = fixture(original);
      f.state.body = body;
      results.push(await f.read());
    }
    assert.deepEqual(results[1], results[0]);
  }
  const a = fixture(true),
    b = fixture(false);
  a.state.status = b.state.status = 429;
  assert.deepEqual(await b.read(), await a.read());
});
test("grant validation preserves bounds, integer and credential semantics", () => {
  const original = extensionBindings(["Oc", "Pc", "Jp"], { Date: clock });
  for (const expiresAt of [
    now / 1000,
    Math.floor(now / 1000),
    Math.floor(now / 1000) + 1,
    Math.floor(now / 1000) + 120,
    Math.floor(now / 1000) + 121,
    Infinity,
    NaN,
  ]) {
    for (const token of ["", "x", null]) {
      const grant = { browserBootstrapGrant: token, expiresAt };
      const sync = (fn: Function) => {
        try {
          return fn();
        } catch (e) {
          return (e as Error).message;
        }
      };
      assert.deepEqual(
        sync(() => validateSiwcGrant(grant as any, now)),
        sync(() => original.Pc(grant)),
      );
      const raw = {
        credential_type:
          "urn:openai:params:authapi:grant-type:siwc_browser_bootstrap",
        browser_bootstrap_grant: token,
        expires_at: expiresAt,
        expires_in: 3,
      };
      assert.deepEqual(
        sync(() => parseSiwcGrant(raw, () => now)),
        sync(() => original.Jp(raw)),
      );
    }
  }
});
test("cookie queue spans service instances and recovers after rollback failure", async () => {
  const results = [];
  for (const original of [true, false]) {
    const f = fixture(original);
    let release!: () => void;
    f.state.setGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.state.changeAfterSet = true;
    const input = {
      ...request,
      grant: {
        browserBootstrapGrant: "fixture",
        expiresAt: Math.floor(now / 1000) + 50,
      },
    };
    const first = outcome(() => f.service.installSiwcBrowserGrantCookie(input));
    const second = outcome(() => f.second.installSiwcBrowserGrantCookie(input));
    while (!f.trace.some((row) => row[0] === "cdp"))
      await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.trace.filter((row) => row[0] === "activate").length, 1);
    release();
    results.push({
      outcomes: await Promise.all([first, second]),
      trace: f.trace,
    });
  }
  assert.deepEqual(results[1], results[0]);
  assert.ok(results[1].outcomes[0].error);
  assert.deepEqual(results[1].outcomes[1], { value: undefined });
});
