import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
const root =
  process.env.CUA_EXTENSION_SOURCE_ROOT ??
  `${homedir()}/Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0`;
const original = await readFile(
  `${root}/content-scripts/codex-work-preload.js`,
  "utf8",
);
assert.equal(
  createHash("sha256").update(original).digest("hex"),
  "bda10ae0882eeb01fe38e68c96a0f51785e71393609abf7764d087ff6a5de8e9",
);
const restored = await readFile(
  "packages/browser-extension/dist/content-scripts/codex-work-preload.js",
  "utf8",
);
const parentOrigin = `chrome-extension://${"a".repeat(32)}`;
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
async function fixture(source: string, mode: string) {
  const trace: any[] = [];
  class Status extends EventTarget {
    constructor(
      public kind: string,
      public state: string,
    ) {
      super();
    }
    override addEventListener(type: string, listener: any, options: any) {
      trace.push(["listen", this.kind, type, options]);
      super.addEventListener(type, listener, options);
    }
    change(state: string) {
      this.state = state;
      this.dispatchEvent(new Event("change"));
    }
  }
  const microphone = new Status(
    "microphone",
    mode.includes("prompt") ? "prompt" : "granted",
  );
  const camera = new Status(
    "camera",
    mode.includes("both-prompt")
      ? "prompt"
      : mode === "denied"
        ? "denied"
        : "granted",
  );
  const window: any = {
    location: {
      ancestorOrigins:
        mode === "missing-parent"
          ? []
          : [
              mode === "invalid-parent"
                ? "chrome-extension://invalid"
                : parentOrigin,
            ],
      search:
        mode === "wrong-surface"
          ? "?surface=other"
          : "?surface=browser_side_chat",
    },
    parent: {
      postMessage(message: any, origin: string) {
        trace.push(["post", message, origin]);
      },
    },
  };
  const mediaDevices: any = {
    async getUserMedia(this: any, constraints: any) {
      trace.push(["media", this === mediaDevices, constraints]);
      if (mode === "media-fails")
        throw new DOMException("fixture denied", "NotAllowedError");
      return "fixture-stream";
    },
  };
  const originalMedia = mediaDevices.getUserMedia;
  const navigator: any = {
    mediaDevices: mode === "missing-media" ? undefined : mediaDevices,
    permissions: {
      async query({ name }: any) {
        trace.push(["query", name]);
        if (mode === "query-fails") throw Error("fixture query error");
        return name === "microphone" ? microphone : camera;
      },
    },
  };
  const context = { window, navigator, URLSearchParams, DOMException, console };
  await runInNewContext(source, context);
  if (mode === "reinject") await runInNewContext(source, context);
  const descriptor = Object.getOwnPropertyDescriptor(
    window,
    "__CODEX_BROWSER_SIDE_CHAT__",
  );
  const marker = descriptor
    ? {
        value: descriptor.value,
        writable: descriptor.writable,
        enumerable: descriptor.enumerable,
        configurable: descriptor.configurable,
      }
    : null;
  let result: any = { skipped: true };
  if (navigator.mediaDevices) {
    const constraints =
      mode === "no-media-request"
        ? {}
        : {
            audio: mode === "video-only" ? false : { echoCancellation: true },
            video: mode === "audio-only" ? false : true,
          };
    let settled = false;
    const operation = navigator.mediaDevices.getUserMedia(constraints).then(
      (value: any) => {
        settled = true;
        return { value };
      },
      (error: any) => {
        settled = true;
        return { name: error.name, message: error.message };
      },
    );
    await flush();
    if (mode.includes("prompt")) {
      assert.equal(settled, false);
      assert.equal(trace.filter((row) => row[0] === "media").length, 0);
      microphone.change(mode === "prompt-deny" ? "denied" : "granted");
      await flush();
      if (mode.includes("both-prompt")) {
        assert.equal(settled, false);
        camera.change("granted");
      }
    }
    result = await operation;
  }
  return JSON.parse(
    JSON.stringify({
      trace,
      marker,
      wrapped: mediaDevices.getUserMedia !== originalMedia,
      result,
    }),
  );
}
test("full MAIN preload preserves ancestry guards, marker descriptor, constraints and reinjection", async () => {
  for (const mode of [
    "missing-parent",
    "invalid-parent",
    "wrong-surface",
    "missing-media",
    "no-media-request",
    "audio-only",
    "video-only",
    "granted",
    "denied",
    "query-fails",
    "media-fails",
    "reinject",
  ]) {
    assert.deepEqual(
      await fixture(restored, mode),
      await fixture(original, mode),
      mode,
    );
  }
});
test("full MAIN preload waits for original permission changes before media call and rejects denial", async () => {
  for (const mode of ["prompt-grant", "both-prompt-grant", "prompt-deny"]) {
    const actual = await fixture(restored, mode),
      expected = await fixture(original, mode);
    assert.deepEqual(actual, expected, mode);
    assert.equal(
      actual.trace.filter((row: any) => row[0] === "post").length,
      1,
    );
    if (mode === "prompt-deny")
      assert.equal(actual.result.name, "NotAllowedError");
  }
});
