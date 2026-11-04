export interface TunnelNetworkRequest {
  signal: AbortSignal;
  dispose(): void;
  expireIfOverdue(): void;
}
export interface TunnelDeliveryEnvironment {
  fetch: typeof fetch;
  now(): number;
  wallNow(): number;
  random(): number;
  setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}
/** Original Cl. Unlike other retry parsers, do not trim header text here. */
export function tunnelRetryAfter(
  response: Pick<Response, "headers">,
  now: number,
) {
  const value = response.headers.get("Retry-After");
  if (value == null) return 0;
  if (/^\d+$/u.test(value)) return Math.min(Number(value) * 1000, 25000);
  const date = Date.parse(value);
  return !Number.isFinite(date) || date <= now
    ? 0
    : Math.min(date - now, 25000);
}
export type TunnelResponseFailure = (
  reason: string,
  responseType: unknown,
  status?: number,
) => void;
export type TunnelUnauthorizedRecovery = (
  retry: (token: string, signal: AbortSignal) => Promise<boolean>,
) => Promise<boolean>;
/** Original Bs/js/kl with explicit environment for source differential testing.
 * Default implementation uses actual fetch, clocks and timers. */
export function createTunnelResponseDelivery(
  env: TunnelDeliveryEnvironment = {
    fetch: (...args) => fetch(...args),
    now: () => performance.now(),
    wallNow: () => Date.now(),
    random: () => Math.random(),
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: (timer) => clearTimeout(timer),
  },
) {
  function createRequest(
    signal: AbortSignal,
    deadline: number,
    now: number,
  ): TunnelNetworkRequest | null {
    const duration = deadline - now;
    if (duration <= 0 || signal.aborted) return null;
    const controller = new AbortController();
    const expiresAt = env.wallNow() + duration;
    const timer = env.setTimeout(() => controller.abort(), duration);
    return {
      dispose: () => env.clearTimeout(timer),
      expireIfOverdue() {
        if (env.wallNow() >= expiresAt) controller.abort();
      },
      signal: AbortSignal.any([signal, controller.signal]),
    };
  }
  async function wait(ms: number, signal: AbortSignal) {
    if (signal.aborted) return;
    await new Promise<void>((resolve) => {
      const onAbort = () => {
        env.clearTimeout(timer);
        resolve();
      };
      const timer = env.setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
  async function postResponse(
    url: string,
    headers: Record<string, string>,
    response: Record<string, unknown>,
    deadline: number | null | undefined,
    signal: AbortSignal,
    networkRequests: Set<TunnelNetworkRequest>,
    recover?: TunnelUnauthorizedRecovery,
    report?: TunnelResponseFailure,
  ): Promise<boolean> {
    const body = JSON.stringify(response);
    const fail = (reason: string, status?: number) => {
      if (!signal.aborted)
        report?.(
          deadline != null && env.now() >= deadline ? "deadline" : reason,
          response.resp_type,
          status,
        );
      return false;
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      const now = env.now();
      const request = createRequest(
        signal,
        Math.min(deadline ?? Infinity, now + 25000),
        now,
      );
      if (request == null) return fail("deadline");
      networkRequests.add(request);
      let result: Response | null = null;
      try {
        result = await env.fetch(url, {
          body,
          credentials: "omit",
          headers: { ...headers, "Content-Type": "application/json" },
          method: "POST",
          signal: request.signal,
        });
      } catch {
        if (response.resp_type === "jsonrpc_notify" && request.signal.aborted)
          return fail("timeout");
        if (signal.aborted || attempt === 2)
          return fail(request.signal.aborted ? "timeout" : "network");
      } finally {
        networkRequests.delete(request);
        request.dispose();
      }
      if (result?.ok) return true;
      if (
        result?.status === 401 &&
        response.resp_type === "jsonrpc_response" &&
        !signal.aborted &&
        (deadline == null || env.now() < deadline) &&
        recover != null
      )
        return recover((token, retrySignal) =>
          postResponse(
            url,
            { ...headers, Authorization: `Bearer ${token}` },
            response,
            deadline,
            retrySignal,
            networkRequests,
            undefined,
            report,
          ),
        );
      if (result?.status === 404) return fail("request_gone", result.status);
      if (
        result != null &&
        (![408, 429, 502, 503, 504].includes(result.status) || attempt === 2)
      )
        return fail("http", result.status);
      const baseDelay = 2 ** attempt * 1000;
      const jitter = Math.floor(env.random() * baseDelay);
      const retryAfter =
        result == null ? 0 : tunnelRetryAfter(result, env.wallNow());
      const delay = Math.max(baseDelay + jitter, retryAfter);
      if (deadline != null && env.now() + delay >= deadline)
        return fail("deadline", result?.status);
      await wait(delay, signal);
    }
    return false;
  }
  return { postResponse, createRequest, wait };
}
