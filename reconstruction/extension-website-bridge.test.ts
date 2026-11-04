import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  createWebsiteBridge,
  websiteTabPatterns,
} from "../packages/browser-extension/src/website_bridge";
import { createContentRuntime } from "../packages/browser-extension/src/content_runtime";
const flush = () => new Promise((resolve) => setImmediate(resolve));
const names = [
  "Xt",
  "hm",
  "fm",
  "Nc",
  "pm",
  "_s",
  "Tp",
  "Ip",
  "Cf",
  "nk",
  "de",
  "gy",
];
test("website bridge query patterns match original production and development channels", () => {
  const source = extensionBindings(names, { chrome: {}, Do: new Map() });
  for (const channel of ["prod", "dev", "internal", "other"])
    assert.deepEqual(websiteTabPatterns(channel), source.pm(channel));
});
test("website bridge preserves document handshake dedupe, independent notifications and injection failures", async () => {
  for (const mode of [
    "ready",
    "inject",
    "injection-fails",
    "handshake-fails",
    "timed-out",
    "navigated",
    "inactive",
    "frame-fails",
    "query-fails",
    "notify-fails",
    "development",
  ]) {
    const outputs = [];
    for (const upstream of [true, false]) {
      const trace: any[] = [],
        timers = new Map<number, Function>();
      let nextTimer = 1,
        pings = 0,
        frames = 0;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const setTimeout = ((fn: Function, ms: number) => {
        const id = nextTimer++;
        timers.set(id, fn);
        trace.push(["timer", id, ms]);
        return id;
      }) as any;
      const clearTimeout = ((id: number) => {
        trace.push(["clear", id]);
        timers.delete(id);
      }) as any;
      const chrome: any = {
        tabs: {
          async query(options: any) {
            trace.push(["query", options]);
            if (mode === "query-fails") throw Error("query");
            return [{ id: 1 }, { id: 2, discarded: true }, {}, { id: 3 }];
          },
          async sendMessage(tabId: number, message: any, options: any) {
            trace.push(["send", tabId, message, options]);
            if (message.type === "CHATGPT_WEBSITE_PLUGINS_CHANGED") {
              if (mode === "notify-fails") throw Error("notify");
              return;
            }
            const number = ++pings;
            if (number === 1) await gate;
            if (mode === "timed-out") return new Promise(() => {});
            if (
              mode === "ready" ||
              mode === "development" ||
              (mode === "inject" && number > 1)
            )
              return { version: "1" };
            return { version: "old" };
          },
        },
        runtime: { getManifest: () => ({ version: "1" }) },
        webNavigation: {
          async getFrame(options: any) {
            trace.push(["frame", options]);
            frames++;
            if (mode === "frame-fails") throw Error("frame");
            if (options.tabId === 3)
              return {
                documentId: "other",
                documentLifecycle: "active",
                url: "https://untrusted.test/",
              };
            return {
              documentId:
                mode === "navigated" && frames > 6 ? "new-doc" : "doc",
              documentLifecycle: mode === "inactive" ? "cached" : "active",
              url:
                mode === "development"
                  ? "http://localhost:3000/"
                  : "https://chatgpt.com/",
            };
          },
        },
        scripting: {
          async executeScript(options: any) {
            trace.push(["inject", options]);
            if (mode === "injection-fails" || mode === "navigated")
              throw Error("inject");
            return [];
          },
        },
      };
      const reportFailure = (...args: unknown[]) => {
        trace.push(["failure", ...args]);
      };
      const source = upstream
        ? extensionBindings(names, {
            chrome,
            Do: new Map(),
            Yt: reportFailure,
            setTimeout,
            clearTimeout,
          })
        : undefined;
      const contentRuntime = createContentRuntime({
        chrome,
        setTimeout,
        clearTimeout,
      });
      const refresh = upstream
        ? source.Cf
        : createWebsiteBridge({
            chrome,
            withTimeout: contentRuntime.withTimeout,
            reportFailure,
          }).refresh;
      const channel = mode === "development" ? "dev" : "prod";
      const results: unknown[] = [];
      const record = (p: Promise<void>) =>
        p.then(
          () => results.push("ok"),
          (error) => results.push(error.message),
        );
      const pending = [
        record(refresh(channel, true)),
        record(refresh(channel, true)),
        record(refresh(channel, false)),
      ];
      await flush();
      if (!["inactive", "frame-fails", "query-fails"].includes(mode))
        assert.equal(pings, 1, "shared pending document ping");
      release();
      for (let round = 0; round < 8; round++) {
        await flush();
        if (mode === "timed-out") for (const fn of [...timers.values()]) fn();
      }
      await Promise.all(pending);
      const again = record(refresh(channel, false));
      for (let round = 0; round < 8; round++) {
        await flush();
        if (mode === "timed-out") for (const fn of [...timers.values()]) fn();
      }
      await again;
      outputs.push({ trace, results, timerCount: timers.size });
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});
