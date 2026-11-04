import { extensionBindings } from "./extension-source";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { originalServiceBindings } from "./service-source";
import {
  captureYoutubeCaptions,
  readYoutubeTranscript,
  transcriptLimits,
  isCaptionResponse,
  captionEvent,
} from "../packages/browser/src/service/content/youtube_transcript";
import { TabContentExportYouTubeTranscriptCommand } from "../packages/browser/src/service/commands/youtube_export";
const extensionOriginal = extensionBindings(["xn", "cm", "lm", "um", "om"], {});
const original = originalServiceBindings(["hp", "c5", "d5", "p5", "Fy"]);
const id = "abcdefghijk",
  url = `https://www.youtube.com/watch?v=${id}`;
function response(events: any[]) {
  return {
    body: JSON.stringify({ events }),
    captionKind: "asr",
    captionLanguage: "zh",
    pageUrl: url,
  };
}
test("transcript formatter matches original limits, UTF-8 budgets and timestamp rules", async () => {
  assert.deepEqual(transcriptLimits, original.hp);
  assert.deepEqual(transcriptLimits, extensionOriginal.xn);
  const cases: any[] = [
    null,
    {},
    response([]),
    response([
      { tStartMs: 0, segs: [{ utf8: " Hello\n" }, { utf8: " world " }] },
      { tStartMs: 3661999, segs: [{ utf8: "中文" }] },
    ]),
    response([
      { tStartMs: -1, segs: [] },
      { tStartMs: 0, segs: [{ utf8: 2 }] },
    ]),
    response(
      Array.from({ length: 5001 }, (_, i) => ({
        tStartMs: i * 1000,
        segs: [{ utf8: "line" }],
      })),
    ),
    response([
      { tStartMs: 0, segs: [{ utf8: "ok" }] },
      { tStartMs: 1, segs: [{ utf8: "字".repeat(200000) }] },
    ]),
    { ...response([]), body: "invalid" },
    { ...response([]), extra: true },
    { ...response([]), captionLanguage: null },
    { ...response([]), body: "x".repeat(transcriptLimits.maxJsonBytes + 1) },
  ];
  for (const value of cases) {
    assert.equal(isCaptionResponse(value), original.c5(value));
    assert.deepEqual(
      await readYoutubeTranscript(id, async () => value),
      await extensionOriginal.om(id, async () => value),
    );
    assert.deepEqual(
      await readYoutubeTranscript(id, async () => value),
      await original.Fy(id, async () => value),
    );
  }
  for (const value of [
    null,
    {},
    [],
    { tStartMs: 0, segs: [] },
    { tStartMs: NaN, segs: [] },
    { tStartMs: 0, segs: [{}] },
    { tStartMs: 0, segs: [{ utf8: undefined, extra: 1 }] },
  ])
    assert.deepEqual(captionEvent(value), original.d5(value));
  const result = await readYoutubeTranscript(id, async () =>
    response([{ tStartMs: 3661999, segs: [{ utf8: "中文" }] }]),
  );
  assert.match(result!.text, /\[1:01:01\] 中文/);
});
async function pageRun(source: boolean | "extension", mode: string) {
  const trace: any[] = [];
  let enabled = mode === "initial-on",
    observer: any,
    changed = false;
  const body = JSON.stringify({
    events: [{ tStartMs: 0, segs: [{ utf8: "Fixture captions" }] }],
  });
  const player: any = {
    getVideoData() {
      return { video_id: mode === "wrong-video" || changed ? "other" : id };
    },
    isSubtitlesOn() {
      trace.push(["subtitles", enabled]);
      return enabled;
    },
    toggleSubtitles() {
      trace.push("toggle");
      enabled = !enabled;
    },
    toggleSubtitlesOn() {
      trace.push("on");
      enabled = true;
      observer.callback({
        getEntries: () => [
          {
            startTime: 100,
            name: `https://www.youtube.com/api/timedtext?v=${id}&lang=zh&kind=asr`,
          },
        ],
      });
      if (mode === "change-after-toggle") changed = true;
    },
  };
  if (mode === "missing-method") delete player.toggleSubtitles;
  const globals: any = {
    URL,
    Reflect,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    AbortController,
    performance: { now: () => 100 },
    location: { href: url },
    document: {
      querySelector: (selector: string) =>
        selector === "ytd-player" ? null : player,
    },
    PerformanceObserver: class {
      callback: any;
      constructor(callback: any) {
        this.callback = callback;
        observer = this;
      }
      observe(options: any) {
        trace.push(["observe", options]);
      }
      disconnect() {
        trace.push("disconnect");
      }
    },
    setTimeout: (_fn: any, ms: number) => {
      trace.push(["timer", ms]);
      return 1;
    },
    clearTimeout: (timer: number) => {
      trace.push(["clear", timer]);
    },
    fetch: async (request: string, options: any) => {
      trace.push(["fetch", request, options.credentials]);
      if (mode === "fetch-error") throw Error("failed");
      if (mode === "change-after-fetch") changed = true;
      const bytes = new TextEncoder().encode(
        mode === "overflow" ? "x".repeat(101) : body,
      );
      let read = false;
      return {
        ok: mode !== "http-error",
        headers: {
          get: (name: string) =>
            name === "content-type"
              ? mode === "wrong-type"
                ? "text/html"
                : "application/json"
              : mode === "large-header"
                ? "99999999"
                : null,
        },
        body:
          mode === "text-fallback"
            ? null
            : {
                getReader: () => ({
                  async read() {
                    if (read) return { done: true };
                    read = true;
                    return { done: false, value: bytes };
                  },
                  async cancel() {
                    trace.push("cancel");
                  },
                }),
              },
        text: async () => body,
      };
    },
  };
  try {
    return {
      value: await vm.runInNewContext(
        `(${(source === "extension" ? extensionOriginal.um : source ? original.p5 : captureYoutubeCaptions).toString()})(${JSON.stringify(id)},limits)`,
        {
          ...globals,
          limits: {
            ...transcriptLimits,
            maxJsonBytes:
              mode === "overflow" ? 100 : transcriptLimits.maxJsonBytes,
          },
        },
      ),
      trace,
      enabled,
    };
  } catch (e) {
    return { error: (e as Error).message, trace, enabled };
  }
}
test("serialized caption capture matches original subtitle restoration, fetch and identity checks", async () => {
  for (const mode of [
    "normal",
    "initial-on",
    "wrong-video",
    "missing-method",
    "change-after-toggle",
    "change-after-fetch",
    "fetch-error",
    "http-error",
    "wrong-type",
    "large-header",
    "overflow",
    "text-fallback",
  ])
    assert.deepEqual(
      JSON.parse(JSON.stringify(await pageRun(false, mode))),
      JSON.parse(JSON.stringify(await pageRun(true, mode))),
      mode,
    );
  for (const mode of [
    "normal",
    "initial-on",
    "wrong-video",
    "missing-method",
    "change-after-toggle",
    "change-after-fetch",
    "fetch-error",
    "http-error",
    "wrong-type",
    "large-header",
    "overflow",
    "text-fallback",
  ])
    assert.deepEqual(
      JSON.parse(JSON.stringify(await pageRun(false, mode))),
      JSON.parse(JSON.stringify(await pageRun("extension", mode))),
      mode,
    );
  assert.equal((await pageRun(false, "normal")).enabled, false);
  assert.equal((await pageRun(false, "initial-on")).enabled, true);
  assert.equal((await pageRun(false, "change-after-fetch")).value, null);
  assert.ok((await pageRun(false, "overflow")).trace.includes("cancel"));
});
test("YouTube export checks captured and current video identity before writing", async () => {
  for (const mode of [
    "normal",
    "no-transcript",
    "changed",
    "wrong-capture",
    "invalid-tab",
  ]) {
    const calls: any[] = [];
    let gets = 0;
    const ctx: any = {
      acquireAuthority: () => ({
        observeContent: () => ({
          assert: async () => {
            calls.push("authorize");
          },
        }),
      }),
      security: { currentTabUrl: async () => url },
      tabs: {
        get: async () => {
          gets++;
          return {
            url:
              mode === "changed" && gets === 2
                ? "https://www.youtube.com/watch?v=ABCDEFGHIJK"
                : url,
          };
        },
      },
      cdp: {
        evaluateJavascript: async () =>
          mode === "no-transcript"
            ? null
            : {
                ...response([{ tStartMs: 0, segs: [{ utf8: "Fixture" }] }]),
                pageUrl:
                  mode === "wrong-capture"
                    ? "https://www.youtube.com/watch?v=ABCDEFGHIJK"
                    : url,
              },
      },
      filesystem: {
        tmpDir: "/fixture",
        mkdir: async () => {
          calls.push("mkdir");
        },
        writeFile: async (path: string, bytes: Uint8Array) => {
          calls.push(["write", path, new TextDecoder().decode(bytes)]);
        },
      },
    };
    if (mode === "normal") {
      const result = await TabContentExportYouTubeTranscriptCommand(
        { tab_id: 7 },
        ctx,
      );
      assert.match(result.path, /youtube-abcdefghijk-.*\.txt$/);
      assert.match(calls.at(-1)[2], /\[0:00\] Fixture/);
    } else {
      await assert.rejects(
        TabContentExportYouTubeTranscriptCommand(
          { tab_id: mode === "invalid-tab" ? 0 : 7 },
          ctx,
        ),
        mode === "changed"
          ? /changed before/
          : mode === "invalid-tab"
            ? /positive integer/
            : /No transcript/,
      );
      assert.equal(
        calls.some((x) => x === "mkdir"),
        false,
      );
    }
  }
});

test("YouTube export observes actual Chromium resource timing and writes fixture transcript", async () => {
  const { chromium } = await import("playwright");
  const fs = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = await fs.mkdtemp(join(tmpdir(), "cua-transcript-")),
    browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const requests: string[] = [];
    await page.route("https://www.youtube.com/**", async (route) => {
      requests.push(route.request().url());
      await route.fulfill(
        route.request().url().includes("/api/timedtext")
          ? {
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({
                events: [{ tStartMs: 1250, segs: [{ utf8: "字幕 fixture" }] }],
              }),
            }
          : {
              status: 200,
              contentType: "text/html",
              body: '<div id="movie_player"></div>',
            },
      );
    });
    await page.goto(url);
    await page.evaluate(() => {
      const player: any = document.querySelector("#movie_player");
      player.enabled = false;
      player.getVideoData = function () {
        return { video_id: "abcdefghijk" };
      };
      player.isSubtitlesOn = function () {
        return this.enabled;
      };
      player.toggleSubtitles = function () {
        this.enabled = !this.enabled;
      };
      player.toggleSubtitlesOn = function () {
        this.enabled = true;
        void fetch(
          "https://www.youtube.com/api/timedtext?v=abcdefghijk&lang=zh&kind=asr",
        ).then((response) => response.text());
      };
    });
    const context: any = {
      acquireAuthority: () => ({
        observeContent: () => ({ assert: async () => {} }),
      }),
      security: { currentTabUrl: async () => page.url() },
      tabs: { get: async () => ({ url: page.url() }) },
      cdp: {
        evaluateJavascript: (_id: number, expression: string) =>
          page.evaluate(expression),
      },
      filesystem: {
        tmpDir: directory,
        mkdir: fs.mkdir,
        writeFile: fs.writeFile,
      },
    };
    const result = await TabContentExportYouTubeTranscriptCommand(
      { tab_id: 7 },
      context,
    );
    assert.match(
      await fs.readFile(result.path, "utf8"),
      /\[0:01\] 字幕 fixture/,
    );
    assert.ok(requests.some((request) => request.includes("fmt=json3")));
    assert.equal(
      await page.evaluate(
        () => (document.querySelector("#movie_player") as any).enabled,
      ),
      false,
    );
  } finally {
    await browser.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
