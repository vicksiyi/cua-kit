import { defineCommand } from "./define_command";
import { positiveTabId } from "../tab_id";
export interface ScreenshotPayload {
  tab_id: unknown;
  fullPage?: boolean;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
}
type CaptureMode = "css" | "device";
export interface CdpEvent {
  method: string;
  params?: Record<string, any> | null;
  [key: string]: unknown;
}
/** Structural boundary of the actual CDP/screencast manager, which is still being restored. */
export interface ScreenshotContext {
  cdp: {
    call(
      tabId: number,
      method: string,
      params?: unknown,
      options?: unknown,
    ): Promise<any>;
    withInternalScreencast<T>(
      tabId: number,
      run: (matches: (event: CdpEvent) => boolean) => Promise<T>,
    ): Promise<T>;
    waitForEvent(
      tabId: number,
      predicate: (event: CdpEvent) => boolean,
      options: {
        signal: AbortSignal;
        timeoutMessage: string;
        timeoutMs: number;
      },
    ): Promise<CdpEvent>;
  };
  acquireAuthority(): {
    observeContent(url: unknown): { assert(): Promise<unknown> };
  };
  security: { currentTabUrl(tabId: number): Promise<unknown> };
  credentialObservationGate?: {
    observe<T>(run: () => Promise<T>, tabId: number): Promise<T>;
  };
}
/** Original KD. Device-pixel-ratio errors and invalid results fall back to 1. */
export async function cssScreenshotScale(
  tabId: number,
  context: ScreenshotContext,
) {
  try {
    const ratio = (
      await context.cdp.call(
        tabId,
        "Runtime.evaluate",
        { expression: "window.devicePixelRatio", returnByValue: true },
        {
          telemetryAttrs: { "browser_use.cdp.eval.kind": "device_pixel_ratio" },
        },
      )
    )?.result?.value;
    if (typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0)
      return 1 / ratio;
  } catch {}
  return 1;
}
/** Original XD. Authority precedes observation, and remains outside the credential observation gate. */
export const TabScreenshotCommand = defineCommand(
  "tab_screenshot",
  async (payload: ScreenshotPayload, context: ScreenshotContext) => {
    await context
      .acquireAuthority()
      .observeContent(
        await context.security.currentTabUrl(positiveTabId(payload.tab_id)),
      )
      .assert();
    return await captureTabScreenshot(payload, context, "css");
  },
);
/** Original Ui. */
export async function captureTabScreenshot(
  payload: ScreenshotPayload,
  context: ScreenshotContext,
  mode: CaptureMode,
) {
  const capture = () => captureScreenshot(payload, context, mode);
  return context.credentialObservationGate == null
    ? await capture()
    : await context.credentialObservationGate.observe(
        capture,
        positiveTabId(payload.tab_id),
      );
}
/** Original pJ. Crop, full-page, viewport screencast and fallback paths retain original ordering. */
async function captureScreenshot(
  payload: ScreenshotPayload,
  context: ScreenshotContext,
  mode: CaptureMode,
) {
  const tabId = positiveTabId(payload.tab_id),
    options: any = { format: "jpeg", quality: 80 },
    crop = screenshotCrop(payload);
  if (crop != null) {
    const scale = await screenshotScale(tabId, context, mode);
    options.captureBeyondViewport = true;
    options.clip = { ...crop, scale };
  } else if (payload.fullPage === true) {
    const scale = await screenshotScale(tabId, context, mode),
      content = (await context.cdp.call(tabId, "Page.getLayoutMetrics"))
        .cssContentSize;
    if (
      content?.width == null ||
      content.height == null ||
      content.width <= 0 ||
      content.height <= 0
    )
      throw new Error(
        "Page.getLayoutMetrics returned no valid cssContentSize for full-page screenshot.",
      );
    options.captureBeyondViewport = true;
    options.clip = {
      x: content.x ?? 0,
      y: content.y ?? 0,
      width: content.width,
      height: content.height,
      scale,
    };
  } else {
    const scale = await screenshotScale(tabId, context, mode);
    let viewport: any;
    if (mode === "css")
      ({ cssVisualViewport: viewport } = await context.cdp.call(
        tabId,
        "Page.getLayoutMetrics",
      ));
    const frame =
      mode === "device" || scale <= 1
        ? await viewportScreencast(
            tabId,
            viewport == null
              ? undefined
              : { height: viewport.clientHeight, width: viewport.clientWidth },
            context,
          )
        : undefined;
    if (frame != null) return { data: frame };
    viewport ??= (await context.cdp.call(tabId, "Page.getLayoutMetrics"))
      .cssVisualViewport;
    options.clip = {
      x: viewport.pageX,
      y: viewport.pageY,
      width: viewport.clientWidth,
      height: viewport.clientHeight,
      scale,
    };
  }
  const result = await context.cdp.call(
    tabId,
    "Page.captureScreenshot",
    options,
    {
      preserveDebuggerOnTimeout: true,
      timeoutMs:
        mode === "device" && crop == null && payload.fullPage !== true
          ? 2000
          : 5000,
    },
  );
  if (typeof result.data !== "string" || !result.data)
    throw new Error(
      `Page.captureScreenshot returned no data for tab ${tabId}.`,
    );
  return { data: result.data };
}
/** Original Q_. */
async function screenshotScale(
  tabId: number,
  context: ScreenshotContext,
  mode: CaptureMode,
) {
  return mode === "device" ? 1 : await cssScreenshotScale(tabId, context);
}
/** Original mJ. Starts listening before starting screencast; stale frames are acknowledged and skipped. */
export async function viewportScreencast(
  tabId: number,
  size: { height: number; width: number } | undefined,
  context: ScreenshotContext,
) {
  const height = size == null ? undefined : Math.round(size.height),
    width = size == null ? undefined : Math.round(size.width);
  if (!(height != null && (height <= 0 || width == null || width <= 0)))
    return await context.cdp.withInternalScreencast(tabId, async (matches) => {
      const controller = new AbortController();
      let startedAt: number | undefined;
      const deadline = Date.now() + 2000;
      const wait = () => {
        const pending = context.cdp.waitForEvent(
          tabId,
          (event) => matches(event) && isScreencastEvent(event),
          {
            signal: controller.signal,
            timeoutMessage:
              "Timed out waiting for a viewport screencast frame.",
            timeoutMs: Math.max(1, deadline - Date.now()),
          },
        );
        pending.catch(() => {});
        return pending;
      };
      let pending = wait(),
        running = false;
      try {
        running = true;
        startedAt = Date.now() / 1000;
        await context.cdp.call(tabId, "Page.startScreencast", {
          everyNthFrame: 1,
          format: "jpeg",
          ...(height == null ? {} : { maxHeight: height, maxWidth: width }),
          quality: 80,
        });
        for (;;) {
          const event = await pending;
          if (event.method !== "Page.screencastFrame" || event.params == null)
            return;
          const sessionId = Reflect.get(event.params, "sessionId");
          if (typeof sessionId !== "number") return;
          if (!isFreshScreencastFrame(event, startedAt)) {
            pending = wait();
            await context.cdp.call(tabId, "Page.screencastFrameAck", {
              sessionId,
            });
            continue;
          }
          const data = Reflect.get(event.params, "data");
          try {
            await context.cdp.call(tabId, "Page.stopScreencast");
            running = false;
          } finally {
            await context.cdp.call(tabId, "Page.screencastFrameAck", {
              sessionId,
            });
          }
          return typeof data === "string" && data.length > 0 ? data : undefined;
        }
      } catch {
        return;
      } finally {
        controller.abort();
        await pending.catch(() => {});
        if (running)
          await context.cdp.call(tabId, "Page.stopScreencast").catch(() => {});
      }
    });
}
/** Original fJ/hJ/gJ. */
export function isScreencastEvent(event: CdpEvent) {
  return event.method === "Page.screencastFrame"
    ? true
    : event.method === "Page.screencastVisibilityChanged" &&
        event.params != null &&
        Reflect.get(event.params, "visible") === false;
}
export function isFreshScreencastFrame(
  event: CdpEvent,
  startedAt: number | undefined,
) {
  const timestamp = screencastTimestamp(event);
  return timestamp != null && startedAt != null && timestamp >= startedAt;
}
export function screencastTimestamp(event: CdpEvent) {
  if (event.params == null) return;
  const metadata = Reflect.get(event.params, "metadata");
  if (typeof metadata !== "object" || metadata == null) return;
  const timestamp = Reflect.get(metadata, "timestamp");
  return typeof timestamp === "number" && Number.isFinite(timestamp)
    ? timestamp
    : undefined;
}
/** Original bJ. Partial crops are ignored; no extra finite/coordinate validation is added. */
export function screenshotCrop(payload: ScreenshotPayload) {
  if (!(
    payload.cropX == null ||
    payload.cropY == null ||
    payload.cropWidth == null ||
    payload.cropHeight == null
  )) {
    if (payload.cropWidth <= 0 || payload.cropHeight <= 0)
      throw new Error("tab_screenshot crop width and height must be positive");
    return {
      x: payload.cropX,
      y: payload.cropY,
      width: payload.cropWidth,
      height: payload.cropHeight,
      scale: 1,
    };
  }
}
