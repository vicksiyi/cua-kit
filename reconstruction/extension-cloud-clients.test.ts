import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  CloudBrowserSettingsClient,
  createCloudRequirementsClientClass,
} from "../packages/browser-extension/src/cloud_clients";

test("cloud requirements client matches original cache, coalescing, stale fallback and abort", async () => {
  const oldNow = Date.now;
  try {
    for (const mode of [
      "normal",
      "personal",
      "first-failure",
      "later-failure",
      "parse-failure",
      "abort",
    ]) {
      const results = [];
      for (const restored of [false, true]) {
        let now = 1,
          calls = 0;
        Date.now = () => now;
        const controller = new AbortController();
        const trace: any[] = [];
        const parse = (value: any) => {
          trace.push(["parse", value]);
          if (mode === "parse-failure") throw Error("parse");
          return { requirements: value };
        };
        const Original = extensionBindings(["$g"], {
          Mg: parse,
          vl: 3600000,
        }).$g;
        const Class = restored
          ? createCloudRequirementsClientClass(parse)
          : Original;
        const client = new Class({
          signal: controller.signal,
          account: {
            structure: mode === "personal" ? "personal" : "enterprise",
          },
          async request(path: string) {
            trace.push(["request", path]);
            calls++;
            await Promise.resolve();
            if (mode === "abort") controller.abort(Error("cancelled"));
            if (
              mode === "first-failure" ||
              (mode === "later-failure" && calls > 1)
            )
              throw Error("network");
            return calls;
          },
        });
        const read = () =>
          client.readRequirements().then(
            (value: any) => ({ value }),
            (error: any) => ({ error: error.message }),
          );
        trace.push(["parallel", await Promise.all([read(), read()])]);
        trace.push(["cached", await read()]);
        now = 3600002;
        trace.push(["expired", await read()]);
        trace.push(["recached", await read()]);
        results.push({
          trace,
          calls,
          nextRefreshAt: client.nextRefreshAt,
          lastGood: client.lastGood,
          pending: client.pending,
        });
      }
      assert.deepEqual(results[1], results[0], mode);
    }
  } finally {
    Date.now = oldNow;
  }
});

test("cloud browser settings preserve serialized force/patch, cached reads and rejection recovery", async () => {
  const oldNow = Date.now;
  try {
    for (const mode of ["normal", "reject", "bad-response", "pre-abort"]) {
      const results = [];
      for (const restored of [false, true]) {
        let now = 10,
          calls = 0;
        Date.now = () => now;
        const controller = new AbortController();
        if (mode === "pre-abort") controller.abort(Error("cancelled"));
        const trace: any[] = [];
        const Original = extensionBindings(["jg"], {
          Fg: 900000,
          Bg: "/wham/browser/settings",
        }).jg;
        const Class = restored ? CloudBrowserSettingsClient : Original;
        const client = new Class({
          signal: controller.signal,
          account: { structure: "personal" },
          async request(path: string, init: any) {
            calls++;
            const current = calls;
            trace.push([
              "request",
              path,
              init?.method,
              init?.body,
              init?.signal === controller.signal,
            ]);
            await Promise.resolve();
            if (current === 1 && mode === "reject") throw Error("network");
            if (current === 1 && mode === "bad-response") return {};
            return {
              revision: current,
              rules: current % 2 ? {} : { webmcp: { allow: true } },
            };
          },
        });
        const settle = (pending: Promise<any>) =>
          pending.then(
            (value) => ({ value }),
            (error) => ({ error: error.name }),
          );
        trace.push([
          "parallel",
          await Promise.all([
            settle(client.read()),
            settle(client.read()),
            settle(client.read(true)),
            settle(client.patch({ enabled: true }, controller.signal)),
          ]),
        ]);
        trace.push(["cached", await settle(client.read())]);
        now = 900011;
        trace.push(["expired", await settle(client.read())]);
        results.push({
          trace,
          calls,
          expiresAt: client.expiresAt,
          cached: client.cached,
          pending: client.pending,
        });
      }
      assert.deepEqual(results[1], results[0], mode);
    }
  } finally {
    Date.now = oldNow;
  }
});
