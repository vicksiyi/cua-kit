import { positiveTabId } from "../tab_id";
export interface AuthQrCode {
  payload: string;
  bounds: { x: number; y: number; width: number; height: number };
}
/** Original QY/HD. Bounds round outward and clamp only the upper-left coordinates. */
export function authQrBounds(points: Array<{ x: number; y: number }>) {
  if (
    points.length < 4 ||
    points.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))
  )
    return null;
  const xs = points.map(({ x }) => x),
    ys = points.map(({ y }) => y);
  const x = Math.max(0, Math.floor(Math.min(...xs))),
    y = Math.max(0, Math.floor(Math.min(...ys)));
  const width = Math.ceil(Math.max(...xs)) - x,
    height = Math.ceil(Math.max(...ys)) - y;
  return !Number.isSafeInteger(x) ||
    !Number.isSafeInteger(y) ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
    ? null
    : { x, y, width, height };
}
export function authQrCode(
  payload: string,
  points: Array<{ x: number; y: number }>,
): AuthQrCode | null {
  if (payload.length === 0) return null;
  const bounds = authQrBounds(points);
  return bounds == null ? null : { payload, bounds };
}
/** Original X_: fixed 125ms cadence, interruptible by abort. */
export async function waitAuthQrPoll(start: number, signal: AbortSignal) {
  const remaining = 125 - (Date.now() - start);
  if (remaining <= 0 || signal.aborted) return;
  await new Promise<void>((resolve) => {
    const abort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, remaining);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export interface AuthQrMonitorOptions {
  completeWhenQrCodeDisappears: boolean;
  ctx: any;
  pageBindingStatus(): Promise<string | null | undefined>;
  params: any;
  publishPayload(payload: string, completed?: boolean): unknown;
}
export function createAuthQrMonitor(
  decode: (
    url: string,
    params: any,
    context: any,
  ) => Promise<AuthQrCode | null | undefined>,
  wait = waitAuthQrPoll,
) {
  /** Original iJ. Screenshot timeout preserves debugger and transient failures are unknown. */
  async function capture(params: any, context: any) {
    try {
      const result = await context.cdp.call(
        positiveTabId(params.tab_id),
        "Page.captureScreenshot",
        {
          format: "jpeg",
          fromSurface: true,
          optimizeForSpeed: true,
          quality: 80,
        },
        { preserveDebuggerOnTimeout: true, timeoutMs: 2000 },
      );
      return await decode(
        `data:image/jpeg;base64,${result.data}`,
        params,
        context,
      );
    } catch {
      return undefined;
    }
  }
  /** Original oJ. Three absent observations complete; unknown resets the streak. */
  async function poll({
    abortSignal,
    completeWhenQrCodeDisappears,
    ctx,
    initialPayload,
    pageBindingStatus,
    params,
    publishPayload,
  }: AuthQrMonitorOptions & {
    abortSignal: AbortSignal;
    initialPayload: string;
  }) {
    let iteration = 0,
      lastPayload = initialPayload,
      absent = 0,
      pageChanged = false;
    while (!abortSignal.aborted) {
      const start = Date.now();
      if (iteration % 8 === 0) {
        try {
          const status = await pageBindingStatus();
          if (status != null) {
            if (!completeWhenQrCodeDisappears || status !== "page_changed")
              return;
            pageChanged = true;
          }
        } catch {
          absent = 0;
          await wait(start, abortSignal);
          continue;
        }
      }
      const code = await capture(params, ctx);
      if (abortSignal.aborted) return;
      if (code === undefined) absent = 0;
      else if (code != null) {
        if (pageChanged) return;
        lastPayload = code.payload;
        absent = 0;
        publishPayload(code.payload);
      } else if (completeWhenQrCodeDisappears && ++absent >= 3) {
        try {
          const status = await pageBindingStatus();
          if (status != null && status !== "page_changed") return;
        } catch {
          absent = 0;
          await wait(start, abortSignal);
          continue;
        }
        if (!abortSignal.aborted) publishPayload(lastPayload, true);
        return;
      }
      iteration++;
      await wait(start, abortSignal);
    }
  }
  /** Original WD: initial publication is synchronous, background failures are swallowed. */
  function start(
    options: AuthQrMonitorOptions & { initialQrCode: AuthQrCode },
  ) {
    const controller = new AbortController();
    options.publishPayload(options.initialQrCode.payload);
    poll({
      ...options,
      initialPayload: options.initialQrCode.payload,
      abortSignal: controller.signal,
    }).catch(() => {});
    return {
      stop() {
        controller.abort();
      },
    };
  }
  return { capture, poll, start };
}
