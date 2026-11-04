import { youtubeVideoId } from "@core/browser/tabReading";
import type { createContentRuntime } from "./content_runtime";

export interface YoutubeTimestampRequest {
  type: "seek_youtube_timestamp";
  tabId: number;
  windowId: number;
  videoId: string;
  timestampSeconds: number;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}
/** Original rR/nR/Yf; the exact own-key count is intentional. */
export function isYoutubeTimestampRequest(
  value: unknown,
): value is YoutubeTimestampRequest {
  return (
    isRecord(value) &&
    Object.keys(value).length === 5 &&
    value.type === "seek_youtube_timestamp" &&
    typeof value.tabId === "number" &&
    Number.isSafeInteger(value.tabId) &&
    value.tabId >= 0 &&
    typeof value.windowId === "number" &&
    Number.isSafeInteger(value.windowId) &&
    value.windowId >= 0 &&
    typeof value.videoId === "string" &&
    /^[A-Za-z0-9_-]{11}$/u.test(value.videoId) &&
    typeof value.timestampSeconds === "number" &&
    Number.isFinite(value.timestampSeconds) &&
    value.timestampSeconds >= 0 &&
    value.timestampSeconds <= 604800
  );
}
/** Original iR: self-contained because Chrome serializes this function into the page. */
export function seekYoutubeTimestampInPage(
  seconds: number,
  videoId: string,
): boolean {
  let actual: string | null = null;
  try {
    const url = new URL(window.location.href);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.port !== ""
    )
      return false;
    if (
      url.hostname === "youtube.com" ||
      url.hostname === "www.youtube.com" ||
      url.hostname === "m.youtube.com"
    ) {
      if (url.pathname === "/watch") {
        const ids = url.searchParams.getAll("v");
        actual = ids.length === 1 ? (ids[0] ?? null) : null;
      } else {
        const parts = url.pathname.split("/").filter(Boolean);
        if (parts.length === 2 && parts[0] === "shorts")
          actual = parts[1] ?? null;
      }
    } else if (url.hostname === "youtu.be") {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length === 1) actual = parts[0] ?? null;
    }
  } catch {
    return false;
  }
  if (actual !== videoId) return false;
  const video = document.querySelector("video");
  if (!(video instanceof HTMLVideoElement)) return false;
  try {
    video.currentTime = seconds;
    return true;
  } catch {
    return false;
  }
}
/** Original sR/tR: validate before acting, then recheck the page at execution time. */
export function createYoutubeTimestampHandler(host: {
  chrome: Pick<typeof chrome, "tabs" | "scripting">;
  withTimeout: ReturnType<typeof createContentRuntime>["withTimeout"];
}) {
  async function seek({
    tabId,
    windowId,
    videoId,
    timestampSeconds,
  }: YoutubeTimestampRequest) {
    const tab = await host.chrome.tabs.get(tabId);
    if (
      tab.windowId !== windowId ||
      tab.url == null ||
      youtubeVideoId(tab.url) !== videoId
    )
      return false;
    const [result] = await host.chrome.scripting.executeScript({
      target: { tabId },
      args: [timestampSeconds, videoId],
      func: seekYoutubeTimestampInPage,
    });
    return result?.result === true;
  }
  return (message: unknown, reply: (value: unknown) => void): boolean => {
    if (!isRecord(message) || message.type !== "seek_youtube_timestamp")
      return false;
    if (!isYoutubeTimestampRequest(message)) {
      reply({ error: "Invalid YouTube timestamp request", ok: false });
      return true;
    }
    host
      .withTimeout(seek(message))
      .then((didSeek) => reply({ didSeek: didSeek ?? false, ok: true }))
      .catch(() =>
        reply({ error: "Unable to seek the YouTube video", ok: false }),
      );
    return true;
  };
}
