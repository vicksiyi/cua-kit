export const transcriptLimits = {
  fetchTimeoutMs: 8000,
  maxItems: 5000,
  maxJsonBytes: 5 * 1024 * 1024,
  maxTextBytes: 500000,
  observationTimeoutMs: 4000,
};
type Limits = typeof transcriptLimits;
interface CaptionResponse {
  body: string;
  captionKind: string | null;
  captionLanguage: string | null;
  pageUrl: string;
}
/** Original c5/d5. Strict outer record keys, permissive segment metadata. */
export function isCaptionResponse(value: any): value is CaptionResponse {
  return !(
    value == null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 4 ||
    !("body" in value) ||
    typeof value.body !== "string" ||
    !("captionKind" in value) ||
    (value.captionKind !== null &&
      (typeof value.captionKind !== "string" ||
        value.captionKind.length > 100)) ||
    !("captionLanguage" in value) ||
    (value.captionLanguage !== null &&
      (typeof value.captionLanguage !== "string" ||
        value.captionLanguage.length > 100)) ||
    !("pageUrl" in value) ||
    typeof value.pageUrl !== "string"
  );
}
export function captionEvent(
  value: any,
): { segs: { utf8?: string }[]; tStartMs: number } | null {
  return value == null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("tStartMs" in value) ||
    typeof value.tStartMs !== "number" ||
    !Number.isFinite(value.tStartMs) ||
    value.tStartMs < 0 ||
    !("segs" in value) ||
    !Array.isArray(value.segs) ||
    !value.segs.every(
      (segment: any) =>
        segment != null &&
        typeof segment === "object" &&
        !Array.isArray(segment) &&
        (!("utf8" in segment) ||
          segment.utf8 === undefined ||
          typeof segment.utf8 === "string"),
    )
    ? null
    : { segs: value.segs, tStartMs: value.tStartMs };
}
/** Original p5; self-contained page-world capture, including subtitle restoration. */
export async function captureYoutubeCaptions(
  videoId: string,
  limits: Limits,
): Promise<CaptionResponse | null> {
  const helpers = {
    invoke(object: any, key: string) {
      const method = Reflect.get(object, key);
      return typeof method === "function"
        ? Reflect.apply(method, object, [])
        : undefined;
    },
    player(): any {
      const element = document.querySelector("ytd-player"),
        get = element == null ? null : Reflect.get(element, "getPlayer");
      if (typeof get === "function" && element != null) {
        const player = Reflect.apply(get, element, []);
        if (player != null && typeof player === "object") return player;
      }
      return document.querySelector("#movie_player");
    },
    identity() {
      const player = helpers.player();
      let url: URL;
      try {
        url = new URL(location.href);
      } catch {
        return { player, playerVideoId: null, urlVideoId: null };
      }
      const data =
          player == null ? null : helpers.invoke(player, "getVideoData"),
        id =
          data != null && typeof data === "object"
            ? Reflect.get(data, "video_id")
            : null;
      return {
        player,
        playerVideoId: typeof id === "string" ? id : null,
        urlVideoId: url.searchParams.get("v"),
      };
    },
    matches(identity: {
      player: any;
      playerVideoId: string | null;
      urlVideoId: string | null;
    }) {
      return (
        identity.player != null &&
        identity.playerVideoId === videoId &&
        identity.urlVideoId === videoId
      );
    },
  };
  const initial = helpers.identity();
  if (!helpers.matches(initial)) return null;
  const player = initial.player;
  if (
    [
      "getVideoData",
      "isSubtitlesOn",
      "toggleSubtitles",
      "toggleSubtitlesOn",
    ].some((key) => typeof Reflect.get(player, key) !== "function")
  )
    return null;
  const started = performance.now();
  let captionUrl: string | null = null;
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries())
      if (!(entry.startTime + 0.5 < started))
        try {
          const url = new URL(entry.name);
          if (
            url.protocol === "https:" &&
            url.hostname === "www.youtube.com" &&
            url.pathname === "/api/timedtext" &&
            url.searchParams.get("v") === videoId
          )
            captionUrl = entry.name;
        } catch {}
  });
  observer.observe({ buffered: true, type: "resource" });
  const subtitles = !!helpers.invoke(player, "isSubtitlesOn");
  try {
    if (subtitles) helpers.invoke(player, "toggleSubtitles");
    helpers.invoke(player, "toggleSubtitlesOn");
    const deadline = Date.now() + limits.observationTimeoutMs;
    while (Date.now() < deadline && captionUrl == null)
      await new Promise((resolve) => setTimeout(resolve, 150));
  } finally {
    try {
      const current = helpers.identity();
      if (helpers.matches(current) && current.player === player) {
        const enabled = !!helpers.invoke(player, "isSubtitlesOn");
        if (subtitles && !enabled) helpers.invoke(player, "toggleSubtitlesOn");
        else if (!subtitles && enabled)
          helpers.invoke(player, "toggleSubtitles");
      }
    } finally {
      observer.disconnect();
    }
  }
  if (captionUrl == null || !helpers.matches(helpers.identity())) return null;
  const url = new URL(captionUrl);
  url.searchParams.set("fmt", "json3");
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), limits.fetchTimeoutMs);
  try {
    const response = await fetch(url.toString(), {
      credentials: "include",
      signal: controller.signal,
    });
    if (
      !response.ok ||
      !response.headers
        .get("content-type")
        ?.toLowerCase()
        .includes("application/json")
    )
      return null;
    const length = Number(response.headers.get("content-length") ?? Number.NaN);
    if (Number.isFinite(length) && length > limits.maxJsonBytes) {
      controller.abort();
      return null;
    }
    const reader = response.body?.getReader();
    let body: string;
    if (reader == null) {
      body = await response.text();
      if (new TextEncoder().encode(body).byteLength > limits.maxJsonBytes)
        return null;
    } else {
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value != null) {
          size += value.byteLength;
          if (size > limits.maxJsonBytes) {
            await reader.cancel();
            return null;
          }
          chunks.push(new Uint8Array(value));
        }
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      body = new TextDecoder().decode(bytes);
    }
    return helpers.matches(helpers.identity())
      ? {
          body,
          captionKind: url.searchParams.get("kind"),
          captionLanguage: url.searchParams.get("lang"),
          pageUrl: location.href,
        }
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
export type CaptionPageExecutor = (
  fn: typeof captureYoutubeCaptions,
  videoId: string,
  limits: Limits,
) => Promise<unknown>;
/** Original Fy. Counts encoded UTF-8 bytes, with original truncation marker semantics. */
export async function readYoutubeTranscript(
  videoId: string,
  execute: CaptionPageExecutor,
) {
  const result = await execute(
    captureYoutubeCaptions,
    videoId,
    transcriptLimits,
  );
  if (
    !isCaptionResponse(result) ||
    new TextEncoder().encode(result.body).byteLength >
      transcriptLimits.maxJsonBytes
  )
    return null;
  let events: any[];
  try {
    const data = JSON.parse(result.body);
    if (
      data == null ||
      typeof data !== "object" ||
      !("events" in data) ||
      !Array.isArray(data.events)
    )
      return null;
    events = data.events;
  } catch {
    return null;
  }
  const encoder = new TextEncoder(),
    lines = [
      "YouTube transcript",
      `Video ID: ${videoId}`,
      `Language: ${result.captionLanguage ?? "unknown"}`,
      `Captions: ${result.captionKind === "asr" ? "auto-generated" : "authored or unspecified"}`,
      "",
    ];
  let count = 0,
    size = encoder.encode(lines.join("\n")).byteLength,
    truncated = false;
  for (const entry of events) {
    if (count >= transcriptLimits.maxItems) {
      truncated = true;
      break;
    }
    const event = captionEvent(entry);
    if (event == null) continue;
    const text = event.segs
      .map((segment) => segment.utf8 ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length === 0) continue;
    const seconds = Math.floor(event.tStartMs / 1000),
      hours = Math.floor(seconds / 3600),
      minutes = Math.floor((seconds % 3600) / 60),
      remainder = seconds % 60;
    const line = `[${hours > 0 ? `${hours}:${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}` : `${minutes}:${remainder.toString().padStart(2, "0")}`}] ${text}`;
    const bytes = encoder.encode(`\n${line}`).byteLength;
    if (size + bytes > transcriptLimits.maxTextBytes) {
      truncated = true;
      break;
    }
    lines.push(line);
    size += bytes;
    count++;
  }
  if (count === 0) return null;
  if (truncated) lines.push("", "[Transcript truncated]");
  return { pageUrl: result.pageUrl, text: lines.join("\n"), truncated };
}
