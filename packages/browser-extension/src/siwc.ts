/** Restored background bindings Qc/el/Pr and Kp/Oc/Zp/Jp/Pc/py/xu. */
export const SIWC_COOKIE = "__Host-siwc-browser-bootstrap";
export const SIWC_UNAVAILABLE =
  "Sign in with ChatGPT is unavailable or the account or page changed.";
export interface SiwcAccountContext {
  accountKey: string;
  authLifetimeId: string;
  authOrigin: string;
  pageOrigin: string;
}
export interface SiwcGrant {
  browserBootstrapGrant: string;
  expiresAt: number;
}
export interface SiwcRequest {
  tabId: number;
  session_id: string;
  turn_id: string;
  expectedAccount?: SiwcAccountContext;
}
export interface SiwcSession {
  getCommittedTabUrl(tabId: number): Promise<string | null | undefined>;
  executeCdp(request: {
    target: { tabId: number };
    method: string;
    commandParams: Record<string, unknown>;
  }): Promise<any>;
}
export function sameSiwcAccount(
  expected: SiwcAccountContext,
  actual: SiwcAccountContext,
) {
  return (
    actual.accountKey === expected.accountKey &&
    actual.authLifetimeId === expected.authLifetimeId &&
    actual.authOrigin === expected.authOrigin &&
    actual.pageOrigin === expected.pageOrigin
  );
}
export function validateSiwcGrant(grant: SiwcGrant, now = Date.now()) {
  const seconds = now / 1000;
  if (
    grant == null ||
    typeof grant.browserBootstrapGrant !== "string" ||
    !grant.browserBootstrapGrant ||
    !Number.isInteger(grant.expiresAt) ||
    grant.expiresAt <= seconds ||
    grant.expiresAt > seconds + 120
  )
    throw new Error("Invalid or expired SIWC browser grant");
}
export function parseSiwcGrant(value: any, now = Date.now): SiwcGrant {
  if (
    value == null ||
    typeof value !== "object" ||
    !("credential_type" in value) ||
    value.credential_type !==
      "urn:openai:params:authapi:grant-type:siwc_browser_bootstrap" ||
    !("browser_bootstrap_grant" in value) ||
    typeof value.browser_bootstrap_grant !== "string" ||
    !("expires_at" in value) ||
    typeof value.expires_at !== "number" ||
    !Number.isInteger(value.expires_at) ||
    !("expires_in" in value) ||
    typeof value.expires_in !== "number" ||
    !Number.isInteger(value.expires_in) ||
    value.expires_in <= 0
  )
    throw new Error("Invalid or expired SIWC browser grant");
  const grant = {
    browserBootstrapGrant: value.browser_bootstrap_grant,
    expiresAt: Math.min(value.expires_at, Math.floor(now() / 1000) + 120),
  };
  validateSiwcGrant(grant, now());
  return grant;
}
export function parseChatAccount(account: any, userId: string) {
  if (
    !account.id.trim() ||
    !userId.trim() ||
    (account.structure !== "workspace" && account.structure !== "personal")
  )
    throw new Error("Invalid ChatGPT account.");
  return {
    id: account.id as string,
    userId,
    structure: account.structure as "workspace" | "personal",
  };
}
export function readRetryAfter(response: Response, now = Date.now()) {
  const value = response.headers.get("Retry-After")?.trim();
  if (value == null) return;
  if (/^\d+$/u.test(value)) return Number(value) * 1000;
  if (!/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)/u.test(value)) return;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : undefined;
}
/** Each factory represents one extension runtime; cookie serialization is shared by all its instances. */
export function createSiwcServiceClass(host: {
  chrome: Pick<typeof chrome, "tabs">;
  crypto: Pick<Crypto, "subtle">;
  fetch: typeof globalThis.fetch;
  now?: () => number;
  timeout?: typeof AbortSignal.timeout;
  onAuthRequest?: () => void;
}) {
  const now = host.now ?? Date.now;
  const timeout = host.timeout ?? AbortSignal.timeout.bind(AbortSignal);
  const chatOrigin = "https://chatgpt.com";
  let cookieQueue: Promise<unknown> = Promise.resolve();
  let authRequestCount = 0;
  async function readAuthSession(signal?: AbortSignal, origin = chatOrigin) {
    authRequestCount++;
    host.onAuthRequest?.();
    const bounded = timeout(15000);
    const response = await host.fetch(`${origin}/api/auth/session`, {
      cache: "no-store",
      credentials: "include",
      redirect: "error",
      signal: signal == null ? bounded : AbortSignal.any([signal, bounded]),
    });
    const status = response.status;
    if (!response.ok)
      return {
        status,
        error: "http",
        retryAfterMs: readRetryAfter(response, now()),
      };
    let value: any;
    try {
      value = await response.json();
    } catch {
      return { status, error: "decode" };
    }
    if (
      typeof value === "object" &&
      value != null &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    )
      return { status, session: null };
    try {
      return value.error != null || !value.accessToken.trim()
        ? { status, error: "decode" }
        : {
            status,
            session: {
              accessToken: value.accessToken as string,
              account: parseChatAccount(value.account, value.user.id),
              ...(typeof value.user.email === "string"
                ? { email: value.user.email }
                : {}),
            },
          };
    } catch {
      return { status, error: "decode" };
    }
  }
  /** Original Xc: cancellation only stops this waiter, never the shared fetch. */
  function createCachedAuthReader() {
    let pending: ReturnType<typeof readAuthSession> | undefined;
    let generation: number | undefined;
    let cachedOrigin: string | undefined;
    return async (signal?: AbortSignal, origin = chatOrigin) => {
      signal?.throwIfAborted();
      if (
        pending == null ||
        generation !== authRequestCount ||
        cachedOrigin !== origin
      ) {
        pending = readAuthSession(undefined, origin);
        generation = authRequestCount;
        cachedOrigin = origin;
      }
      const current = pending;
      if (signal == null) return current;
      let onAbort = () => {};
      try {
        return await Promise.race([
          current,
          new Promise<never>((_, reject) => {
            onAbort = () => reject(signal.reason);
            signal.addEventListener("abort", onAbort, { once: true });
          }),
        ]);
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
    };
  }
  async function readContext(
    session: SiwcSession,
    request: SiwcRequest,
    expected?: SiwcAccountContext,
  ) {
    const committed = await session.getCommittedTabUrl(request.tabId);
    if (
      committed == null ||
      (await host.chrome.tabs.get(request.tabId)).incognito
    )
      throw new Error(SIWC_UNAVAILABLE);
    const origin = new URL(committed).origin;
    const auth = await readAuthSession(undefined, chatOrigin);
    if (origin === "null" || "error" in auth || auth.session == null)
      throw new Error(SIWC_UNAVAILABLE);
    const { account, accessToken } = auth.session;
    const digest = await host.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        JSON.stringify(["chrome", chatOrigin, account.userId, account.id]),
      ),
    );
    const context = {
      accountKey: Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join(""),
      authLifetimeId: `${request.session_id}:${request.turn_id}`,
      authOrigin: "https://auth.openai.com",
      pageOrigin: origin,
    };
    if (
      new URL((await session.getCommittedTabUrl(request.tabId)) ?? "")
        .origin !== origin ||
      (expected != null && !sameSiwcAccount(expected, context))
    )
      throw new Error(SIWC_UNAVAILABLE);
    return { account: context, accessToken };
  }
  class SiwcService {
    constructor(
      private activateSession: (request: SiwcRequest) => Promise<SiwcSession>,
    ) {}
    getSiwcAccountContext(request: SiwcRequest) {
      return this.runSiwcRequest(
        request,
        undefined,
        async (_, account) => account,
      );
    }
    issueSiwcBrowserGrant(request: SiwcRequest) {
      return this.runSiwcRequest(
        request,
        request.expectedAccount,
        async (_, account, token) => {
          const response = await host.fetch(
            `${account.authOrigin}/oauth/siwc/browser-grants`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
              credentials: "omit",
              cache: "no-store",
              redirect: "error",
              signal: timeout(20000),
            },
          );
          if (!response.ok) {
            await response.body?.cancel();
            throw new Error(SIWC_UNAVAILABLE);
          }
          return parseSiwcGrant(await response.json(), now);
        },
      );
    }
    installSiwcBrowserGrantCookie(request: SiwcRequest & { grant: SiwcGrant }) {
      const operation = cookieQueue.then(() =>
        this.runSiwcRequest(
          request,
          request.expectedAccount,
          async (session, account) => {
            validateSiwcGrant(request.grant, now());
            const result = await session.executeCdp({
              target: { tabId: request.tabId },
              method: "Network.setCookie",
              commandParams: {
                name: SIWC_COOKIE,
                value: request.grant.browserBootstrapGrant,
                url: account.authOrigin,
                path: "/",
                secure: true,
                httpOnly: true,
                sameSite: "Lax",
                expires: request.grant.expiresAt,
              },
            });
            if (!result.success) throw new Error(SIWC_UNAVAILABLE);
            try {
              await readContext(session, request, account);
            } catch {
              await session.executeCdp({
                target: { tabId: request.tabId },
                method: "Network.deleteCookies",
                commandParams: {
                  name: SIWC_COOKIE,
                  url: account.authOrigin,
                  path: "/",
                },
              });
              throw new Error(SIWC_UNAVAILABLE);
            }
          },
        ),
      );
      cookieQueue = operation.catch(() => {});
      return operation;
    }
    async runSiwcRequest<T>(
      request: SiwcRequest,
      expected: SiwcAccountContext | undefined,
      operation: (
        session: SiwcSession,
        account: SiwcAccountContext,
        token: string,
      ) => Promise<T>,
    ): Promise<T> {
      try {
        const session = await this.activateSession(request);
        const { account, accessToken } = await readContext(
          session,
          request,
          expected,
        );
        return await operation(session, account, accessToken);
      } catch {
        throw new Error(SIWC_UNAVAILABLE);
      }
    }
  }
  return { SiwcService, readAuthSession, createCachedAuthReader };
}
