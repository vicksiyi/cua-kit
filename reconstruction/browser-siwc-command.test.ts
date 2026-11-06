import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings, serviceSourceSha256 } from "./service-source";
import { SiwcDetectCommand } from "../packages/browser/src/service/commands/siwc";
import { SiwcDetect } from "../packages/browser/src/commands/siwc";
import { defineCommand } from "../packages/browser/src/service/commands/define_command";
import { positiveTabId } from "../packages/browser/src/service/tab_id";
import { inputTimeout } from "../packages/browser/src/service/input/input";
import {
  isSameSiwcAccount,
  isSiwcControlReady,
} from "../packages/browser/src/service/siwc/readiness";
assert.equal(
  serviceSourceSha256,
  "396d4bcd890e8e41e336469eb1a050bafd36bb2d91152b75bb22b70b56622021",
);
const source = originalServiceBindings(["Dc", "Co", "Ja", "yN", "mte", "uw"], {
  O: defineCommand,
  ee: { SiwcDetect },
  H: positiveTabId,
  Oe: inputTimeout,
  requestAnimationFrame: (callback: () => void) => callback(),
});
test("SIWC detect preserves capability gate and both authority checks, including changed URL and denial", async () => {
  for (const mode of [
    "ok",
    "unsupported",
    "deny-before",
    "deny-after",
    "observation-failed",
    "invalid-tab",
  ]) {
    const outcomes = [];
    for (const command of [source.yN, SiwcDetectCommand]) {
      const trace: any[] = [];
      let checks = 0;
      const context = {
        supportsTabCapability: async (id: string) => {
          trace.push(["capability", id]);
          return mode !== "unsupported";
        },
        getCurrentSessionId: () => "session",
        security: {
          currentTabUrl: async (tab: number) => {
            trace.push(["url", tab]);
            return checks ? "https://after.test" : "https://before.test";
          },
        },
        acquireAuthority: () => ({
          observeContent: (url: string) => ({
            assert: async () => {
              trace.push(["authorize", url]);
              checks++;
              if (
                (mode === "deny-before" && checks === 1) ||
                (mode === "deny-after" && checks === 2)
              )
                throw Error("denied");
            },
          }),
        }),
        playwright: {
          evaluateOnPlaywrightPage: async (tab: string, fn: any, opts: any) => {
            trace.push(["observe", tab, opts]);
            if (mode === "observation-failed") throw Error("navigation");
            return fn({
              siwcDetect: () => [],
              siwcDocumentId: () => "generation",
            });
          },
        },
      };
      let result;
      try {
        result = await command(
          { tab_id: mode === "invalid-tab" ? "invalid" : "7" },
          context,
        );
      } catch (error) {
        result = { error: (error as Error).message };
      }
      outcomes.push({ result, trace });
    }
    assert.deepEqual(outcomes[1], outcomes[0], mode);
  }
});
test("SIWC readiness matches source recheck after scroll, hit testing and automatic candidate uniqueness", async () => {
  const old = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = ((cb: any) => {
    cb();
    return 1;
  }) as any;
  try {
    for (const mode of [
      "ok",
      "invisible",
      "disabled",
      "detached",
      "changed-after-scroll",
      "blocked",
      "multiple",
      "different-ref",
    ])
      for (const scroll of [false, true])
        for (const automatic of [false, true]) {
          const outcomes = [];
          for (const ready of [source.mte, isSiwcControlReady]) {
            const trace: any[] = [];
            let scrolled = false;
            const element = {
              scrollIntoView: (opts: any) => {
                trace.push(["scroll", opts]);
                scrolled = true;
              },
              getBoundingClientRect: () => ({
                x: 10,
                y: 20,
                width: 40,
                height: 60,
              }),
            };
            const injected = {
              isSiwcControl: () =>
                mode !== "detached" &&
                !(mode === "changed-after-scroll" && scrolled),
              elementState: (_: any, state: string) => ({
                matches:
                  !(mode === "invisible" && state === "visible") &&
                  !(mode === "disabled" && state === "enabled"),
              }),
              expectHitTarget: (point: any) => {
                trace.push(["hit", point]);
                return mode === "blocked" ? "blocked" : "done";
              },
              siwcDetect: () =>
                mode === "multiple"
                  ? [{ ref: "s1" }, { ref: "s2" }]
                  : [{ ref: mode === "different-ref" ? "s2" : "s1" }],
              siwcRef: () => "s1",
            };
            outcomes.push({
              result: await ready(element as any, injected, {
                scroll,
                automatic,
              }),
              trace,
            });
          }
          assert.deepEqual(
            outcomes[1],
            outcomes[0],
            `${mode}/${scroll}/${automatic}`,
          );
        }
  } finally {
    if (old) globalThis.requestAnimationFrame = old;
    else delete (globalThis as any).requestAnimationFrame;
  }
});
test("SIWC account comparison checks all four identity fields", () => {
  const expected = {
    accountKey: "a",
    authLifetimeId: "b",
    authOrigin: "c",
    pageOrigin: "d",
  };
  for (const key of [undefined, ...Object.keys(expected)]) {
    const actual = key ? { ...expected, [key]: "changed" } : expected;
    assert.equal(
      isSameSiwcAccount(expected, actual),
      source.uw(expected, actual),
    );
    assert.equal(isSameSiwcAccount(expected, actual), key === undefined);
  }
});
