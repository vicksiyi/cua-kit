import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { youtubeVideoId } from "@core/browser/tabReading";
import {
  createYoutubeTimestampHandler,
  isYoutubeTimestampRequest,
  seekYoutubeTimestampInPage,
} from "../packages/browser-extension/src/youtube_timestamp";
const request = {
  type: "seek_youtube_timestamp",
  tabId: 1,
  windowId: 2,
  videoId: "abcdefghijk",
  timestampSeconds: 30,
};
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
test("timestamp request guard matches original exact-key and numeric boundaries", () => {
  const { nR } = extensionBindings(["nR", "Yf", "ms"], {});
  for (const value of [
    null,
    [],
    {},
    request,
    { ...request, extra: true },
    { ...request, timestampSeconds: -1 },
    { ...request, timestampSeconds: 604800 },
    { ...request, timestampSeconds: 604801 },
    { ...request, timestampSeconds: NaN },
    { ...request, tabId: 1.5 },
    { ...request, videoId: "invalid" },
    Object.assign(Object.create({ type: request.type }), {
      tabId: 1,
      windowId: 2,
      videoId: request.videoId,
      timestampSeconds: 0,
      extra: true,
    }),
  ])
    assert.equal(isYoutubeTimestampRequest(value), nR(value));
});
test("page seek matches original URL revalidation, actual video check and setter errors", () => {
  for (const url of [
    "https://www.youtube.com/watch?v=abcdefghijk",
    "https://m.youtube.com/shorts/abcdefghijk",
    "https://youtu.be/abcdefghijk",
    "http://youtube.com/watch?v=abcdefghijk",
    "https://youtube.com/watch?v=abcdefghijk&v=abcdefghijk",
    "https://evil.test/watch?v=abcdefghijk",
    "https://user@youtube.com/watch?v=abcdefghijk",
    "https://youtube.com:444/watch?v=abcdefghijk",
    "not a URL",
  ])
    for (const mode of ["video", "missing", "throws"]) {
      const outputs = [];
      for (const restored of [false, true]) {
        let time = 0;
        class Video {
          set currentTime(value: number) {
            if (mode === "throws") throw Error("setter");
            time = value;
          }
        }
        const external = {
          URL,
          window: { location: { href: url } },
          document: {
            querySelector: () => (mode === "missing" ? {} : new Video()),
          },
          HTMLVideoElement: Video,
        };
        const run = restored
          ? new Function(
              ...Object.keys(external),
              `return (${seekYoutubeTimestampInPage.toString()});`,
            )(...Object.values(external))
          : extensionBindings(["iR"], external).iR;
        outputs.push({ result: run(30, "abcdefghijk"), time });
      }
      assert.deepEqual(outputs[0], outputs[1], url + mode);
    }
});
test("timestamp route matches original ownership checks, timeout and script response semantics", async () => {
  for (const mode of [
    "success",
    "wrong-window",
    "wrong-video",
    "missing-url",
    "script-false",
    "script-empty",
    "script-error",
    "tab-error",
    "timeout",
    "invalid",
    "other",
  ]) {
    const outputs = [];
    for (const restored of [false, true]) {
      const trace: unknown[] = [];
      const chrome: any = {
        tabs: {
          get: async (id: number) => {
            trace.push(["tab", id]);
            if (mode === "tab-error") throw Error("closed");
            return {
              windowId: mode === "wrong-window" ? 3 : 2,
              url:
                mode === "missing-url"
                  ? undefined
                  : `https://youtube.com/watch?v=${mode === "wrong-video" ? "otherID1234" : "abcdefghijk"}`,
            };
          },
        },
        scripting: {
          executeScript: async (params: any) => {
            trace.push(["script", params.target, params.args]);
            if (mode === "script-error") throw Error("denied");
            return mode === "script-empty"
              ? []
              : [{ result: mode !== "script-false" }];
          },
        },
      };
      const withTimeout = async <T>(operation: Promise<T>) => {
        const value = await operation;
        return mode === "timeout" ? null : value;
      };
      const handler = restored
        ? createYoutubeTimestampHandler({ chrome, withTimeout })
        : extensionBindings(["tR", "rR", "nR", "Yf", "sR", "ms"], {
            chrome,
            nm: youtubeVideoId,
            iR: seekYoutubeTimestampInPage,
            de: withTimeout,
          }).tR;
      const input =
        mode === "invalid"
          ? { ...request, extra: 1 }
          : mode === "other"
            ? { type: "other" }
            : request;
      trace.push([
        "handled",
        handler(input, (reply: unknown) => trace.push(["reply", reply])),
      ]);
      await flush();
      outputs.push(trace);
    }
    assert.deepEqual(outputs[0], outputs[1], mode);
  }
});
